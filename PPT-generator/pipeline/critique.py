"""Phase 4: Critique & regenerate.

For each PageContent, a reviewer model reads:
  - the spine (so it knows the thesis + this page's key_message)
  - the page itself
  - neighbors (for repetition / contradiction checks)

It returns: { ok: bool, severity: "low"|"med"|"high", issues: [...], suggestions: str }

Pages flagged 'high' are regenerated once with the reviewer's feedback appended
to the page prompt. 'med' and 'low' are logged but accepted.
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from .llm_client import LLMClient
from .pages import _brief_str, regenerate_page_with_feedback
from .schemas import CompanyPack, EditorialPlan, PageContent, SpineOutline


@dataclass
class CritiqueResult:
    page_number: int
    ok: bool
    severity: str
    issues: list[str]
    suggestions: str


CRITIQUE_SYSTEM = """You are a managing director reviewing a draft equity research \
page before it goes to clients. You are blunt, specific, and only flag issues \
that genuinely hurt the report.

Check for:
- Contradictions vs the thesis_north_star or neighbor pages
- Hallucinated numbers or facts not present in the provided data
- Off-message content that doesn't reinforce this page's key_message
- Weak/filler prose
- Missing obvious content this page type should have
- Repetition with neighbor pages
- Generic boilerplate blocks (analyst/disclosure text, report metadata, placeholders)
- Visible layout risk signs: too many blocks, overstuffed tables, duplicated sections, or content that obviously belongs on another page

Severity:
  low  : minor polish, accept as-is
  med  : real issue but page is still usable
  high : page must be regenerated

Return JSON:
{ "ok": bool, "severity": "low"|"med"|"high", "issues": [str], "suggestions": str }
"""


CRITIQUE_USER_TEMPLATE = """Thesis north-star: {thesis}

This page's key_message: {key_message}

Neighbor context:
  prev: {prev}
  next: {next}

DRAFT PAGE (JSON):
```json
{page_json}
```

Review it."""


def critique_page(
    spine: SpineOutline,
    page: PageContent,
    client: LLMClient,
) -> CritiqueResult:
    idx = page.page_number - 1
    brief = spine.pages[idx]
    prev_p = spine.pages[idx - 1] if idx > 0 else None
    next_p = spine.pages[idx + 1] if idx + 1 < len(spine.pages) else None

    user = CRITIQUE_USER_TEMPLATE.format(
        thesis=spine.thesis_north_star,
        key_message=brief.key_message,
        prev=_brief_str(prev_p),
        next=_brief_str(next_p),
        page_json=json.dumps(page.model_dump(), indent=2, ensure_ascii=False),
    )
    parsed, _ = client.generate_json(CRITIQUE_SYSTEM, user)

    return CritiqueResult(
        page_number=page.page_number,
        ok=bool(parsed.get("ok", False)),
        severity=str(parsed.get("severity", "low")).lower(),
        issues=list(parsed.get("issues", [])),
        suggestions=str(parsed.get("suggestions", "")),
    )


def critique_all(
    spine: SpineOutline,
    pages: list[PageContent],
    client: LLMClient | None = None,
    max_workers: int = 6,
) -> list[CritiqueResult]:
    client = client or LLMClient()
    results: dict[int, CritiqueResult] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(critique_page, spine, p, client): p for p in pages}
        for fut in as_completed(futures):
            r = fut.result()
            results[r.page_number] = r
    return [results[i] for i in sorted(results)]


def regenerate_flagged(
    pack: CompanyPack,
    spine: SpineOutline,
    pages: list[PageContent],
    critiques: list[CritiqueResult],
    client: LLMClient | None = None,
    editorial_plan: EditorialPlan | None = None,
) -> list[PageContent]:
    """Regenerate pages flagged 'high'. Feedback is appended to the page prompt."""
    client = client or LLMClient()
    by_page = {c.page_number: c for c in critiques}
    specs = {s.page_number: s for s in (editorial_plan.page_specs if editorial_plan else [])}
    out: list[PageContent] = []
    for page in pages:
        c = by_page.get(page.page_number)
        if not c or c.severity != "high":
            out.append(page)
            continue
        brief = spine.pages[page.page_number - 1]
        feedback = (
            "REVIEWER FEEDBACK — the previous draft was rejected. Fix these issues:\n"
            + "\n".join(f"- {i}" for i in c.issues)
            + f"\n\nSuggestions: {c.suggestions}"
        )
        new_page = regenerate_page_with_feedback(
            pack,
            spine,
            brief,
            client,
            feedback,
            editorial_spec=specs.get(page.page_number),
        )
        out.append(new_page)
    return out
