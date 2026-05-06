"""Layout-aware page compaction before deterministic splitting."""

from __future__ import annotations

from .layout import PageMeasurement
from .llm_client import LLMClient
from .pages import regenerate_page_with_feedback
from .schemas import CompanyPack, EditorialPlan, PageContent, SpineOutline


def compact_overflow_pages(
    pack: CompanyPack,
    spine: SpineOutline,
    pages: list[PageContent],
    measurements: list[PageMeasurement],
    client: LLMClient | None = None,
    editorial_plan: EditorialPlan | None = None,
) -> tuple[list[PageContent], int]:
    """Regenerate overflowing pages with stronger compression instructions.

    This preserves page ownership and deck pacing better than blindly splitting
    overflowing content into continuation pages.
    """
    client = client or LLMClient()
    by_page = {m.page_number: m for m in measurements if m.overflow}
    specs = {s.page_number: s for s in (editorial_plan.page_specs if editorial_plan else [])}
    rewrites = 0
    updated: list[PageContent] = []

    for page in pages:
        meas = by_page.get(page.page_number)
        if meas is None:
            updated.append(page)
            continue

        brief = spine.pages[page.page_number - 1]
        spec = specs.get(page.page_number)
        reduction = max(10, int(round((meas.rendered_height - meas.budget) / max(meas.budget, 1) * 100)))
        cut_order = ", ".join(spec.cut_first) if spec and spec.cut_first else "secondary examples, repeated background, low-value filler"
        feedback = (
            "LAYOUT COMPRESSION FEEDBACK — this page overflowed in rendered HTML.\n"
            f"- Rendered height: {meas.rendered_height}px; target budget: {meas.budget}px.\n"
            f"- Reduce visual/text density by about {reduction}% while preserving the page's core claim.\n"
            f"- Keep the analytical ownership of this page intact; do NOT push content into a continuation page.\n"
            f"- Cut in this order first: {cut_order}.\n"
            "- Prefer fewer blocks, fewer rows, and shorter wording over adding continuation material.\n"
            "- If needed, collapse a table to the most decision-useful rows and trim charts to one core message."
        )
        updated.append(
            regenerate_page_with_feedback(
                pack,
                spine,
                brief,
                client,
                feedback,
                editorial_spec=spec,
            )
        )
        rewrites += 1

    return updated, rewrites
