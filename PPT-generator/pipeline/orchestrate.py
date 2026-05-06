"""End-to-end orchestrator for the full 7-phase pipeline.

Usage:
    python -m pipeline.orchestrate \
        --data reliance_data.json --csv reliance_model.csv \
        --reference gravita_india_tikona_capital.html \
        --output out/reliance_report.html \
        --pdf out/reliance_report.pdf
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

from .compact import compact_overflow_pages
from .critique import critique_all, regenerate_flagged
from .data_loader import load_company_pack
from .document_review import apply_document_review, review_document
from .editorial import generate_editorial_plan
from .eval_harness import evaluate
from .layout import measure_pages, solve_layout
from .llm_client import LLMClient
from .pages import generate_all_pages
from .pdf_export import export_pdf
from .renderer import load_reference_css, render_document
from .spine import generate_spine


def run(
    data_path: str,
    csv_path: str | None,
    reference_html: str,
    output_html: str,
    pdf_path: str | None = None,
    enable_critique: bool = True,
    enable_layout_solver: bool = True,
    enable_eval: bool = False,
    dump_dir: str | None = "scratch/pipeline_artifacts",
) -> dict:
    editorial_plan = None
    deck_review = None

    # Phase 1
    pack = load_company_pack(data_path, csv_path)
    print(f"[1/9] Loaded pack: {pack.company} ({len(pack.narrative)} narrative keys)")

    client = LLMClient()
    print(f"      Provider: {client.provider} | model: {client.model}")

    # Phase 2
    spine, _ = generate_spine(pack, client=client)
    print(f"[2/9] Spine: {len(spine.pages)} pages")
    print(f"      Thesis: {spine.thesis_north_star}")

    # Phase 3
    editorial_plan, _ = generate_editorial_plan(pack, spine, client=client)
    print(f"[3/9] Editorial plan: {len(editorial_plan.page_specs)} page specs")
    print(f"      Hook: {editorial_plan.document_hook}")

    # Phase 4
    pages = generate_all_pages(pack, spine, client=client, editorial_plan=editorial_plan)
    print(f"[4/9] Generated {len(pages)} pages")

    # Phase 5
    if enable_critique:
        crits = critique_all(spine, pages, client=client)
        flagged = [c for c in crits if c.severity == "high"]
        print(f"[5/9] Critique: {len(flagged)} page(s) need regen")
        for c in crits:
            if c.severity != "low":
                print(f"        p{c.page_number} [{c.severity}]: {'; '.join(c.issues[:2])}")
        if flagged:
            pages = regenerate_flagged(
                pack,
                spine,
                pages,
                crits,
                client=client,
                editorial_plan=editorial_plan,
            )

    # Phase 6
    deck_review = review_document(pack, spine, pages, editorial_plan=editorial_plan, client=client)
    page_rewrites = [r for r in deck_review.page_revisions if r.severity in {"med", "high"}]
    print(f"[6/9] Document review: {deck_review.verdict} ({len(page_rewrites)} page revision(s))")
    if deck_review.global_issues:
        print(f"      Global: {'; '.join(deck_review.global_issues[:2])}")
    if page_rewrites:
        pages = apply_document_review(
            pack,
            spine,
            pages,
            deck_review,
            client=client,
            editorial_plan=editorial_plan,
            min_severity="med",
        )

    # Phase 7
    css = load_reference_css(reference_html)
    html = render_document(pages, pack, css)
    print(f"[7/9] Rendered {len(html):,} chars of HTML")

    # Phase 8
    if enable_layout_solver:
        try:
            measurements = measure_pages(html)
            overflowing = [m for m in measurements if m.overflow]
            if overflowing:
                pages, rewrites = compact_overflow_pages(
                    pack,
                    spine,
                    pages,
                    measurements,
                    client=client,
                    editorial_plan=editorial_plan,
                )
                if rewrites:
                    html = render_document(pages, pack, css)
                    measurements = measure_pages(html)
                    print(f"      Compacted {rewrites} overflowing page(s) before layout solve")
            pages, measurements = solve_layout(pages, pack, css)
            sparse = sum(1 for m in measurements if m.sparse)
            print(f"[8/9] Layout: {len(pages)} pages after solve ({sparse} sparse)")
            html = render_document(pages, pack, css)
        except Exception as e:  # noqa: BLE001
            print(f"[8/9] Layout solver skipped ({type(e).__name__}: {e})")

    Path(output_html).parent.mkdir(parents=True, exist_ok=True)
    Path(output_html).write_text(html, encoding="utf-8")
    print(f"      HTML -> {output_html}")

    # Phase 9a
    if pdf_path:
        try:
            export_pdf(html, pdf_path)
            print(f"[9/9] PDF  -> {pdf_path}")
        except Exception as e:  # noqa: BLE001
            print(f"[9/9] PDF export failed ({type(e).__name__}: {e})")

    # Phase 9b
    score = None
    if enable_eval:
        score = evaluate(pack, spine, pages, client=client)
        print(f"      Eval: total {score.total}/25 "
              f"(coh={score.coherence}, fact={score.factual_fidelity}, "
              f"depth={score.depth}, prose={score.prose_quality}, vis={score.visual_fidelity})")

    if dump_dir:
        d = Path(dump_dir)
        d.mkdir(parents=True, exist_ok=True)
        (d / "spine.json").write_text(spine.model_dump_json(indent=2), encoding="utf-8")
        if editorial_plan:
            (d / "editorial_plan.json").write_text(
                editorial_plan.model_dump_json(indent=2), encoding="utf-8"
            )
        (d / "pages.json").write_text(
            json.dumps([p.model_dump() for p in pages], indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        if deck_review:
            (d / "document_review.json").write_text(
                deck_review.model_dump_json(indent=2), encoding="utf-8"
            )
        if score:
            (d / "eval.json").write_text(json.dumps(score.to_dict(), indent=2), encoding="utf-8")

    return {
        "html": output_html,
        "pdf": pdf_path,
        "pages": len(pages),
        "eval": score.to_dict() if score else None,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--csv", default=None)
    ap.add_argument("--reference", default="gravita_india_tikona_capital.html")
    ap.add_argument("--output", default="out/report.html")
    ap.add_argument("--pdf", default=None)
    ap.add_argument("--no-critique", action="store_true")
    ap.add_argument("--no-layout", action="store_true")
    ap.add_argument("--eval", action="store_true")
    args = ap.parse_args()
    run(
        args.data, args.csv, args.reference, args.output,
        pdf_path=args.pdf,
        enable_critique=not args.no_critique,
        enable_layout_solver=not args.no_layout,
        enable_eval=args.eval,
    )


if __name__ == "__main__":
    main()
