"""Whole-report editorial review.

Per-page critique catches local issues. This module adds the missing global
editor pass that looks at the deck as one authored report: repetition, pacing,
page ownership, and document-level compression.
"""

from __future__ import annotations

import json

from .llm_client import LLMClient
from .pages import regenerate_page_with_feedback
from .schemas import CompanyPack, DocumentReview, EditorialPlan, PageContent, SpineOutline


DOCUMENT_REVIEW_SYSTEM = """You are the head of research editing a full
institutional report before it goes to clients. Judge the report as ONE deck,
not as isolated pages.

Focus on:
- repetition across pages
- weak pacing or wrong page ownership
- pages that should be compressed because they restate nearby material
- pages that feel underpowered relative to their strategic role
- any boilerplate, metadata noise, or filler that makes the deck feel AI-generated

Return only revision requests that materially improve the deck. Do not nitpick.

Return JSON in this shape:
{
  "verdict": "accept" | "revise",
  "global_issues": ["..."],
  "page_revisions": [
    {
      "page_number": 3,
      "severity": "med" | "high",
      "issues": ["..."],
      "suggestions": "..."
    }
  ]
}
"""


DOCUMENT_REVIEW_USER = """North-star thesis:
{thesis}

Editorial hook:
{hook}

Outline:
{outline}

Source data summary:
```json
{data_summary}
```

Current report pages:
```json
{pages_json}
```

Review the report as a single authored deck.
"""


def _data_summary(pack: CompanyPack) -> dict:
    data = {
        "company": pack.company,
        "rating": pack.rating,
        "cmp": pack.cmp,
        "target_price": pack.target_price,
        "narrative_keys": sorted(pack.narrative.keys()),
    }
    if pack.financials:
        data["years"] = pack.financials.years
        data["financial_metrics"] = [r.metric for r in pack.financials.rows[:30]]
    return data


def review_document(
    pack: CompanyPack,
    spine: SpineOutline,
    pages: list[PageContent],
    editorial_plan: EditorialPlan | None = None,
    client: LLMClient | None = None,
) -> DocumentReview:
    client = client or LLMClient()
    outline = "\n".join(
        f"  {p.page_number}. [{p.page_type}] {p.title} - {p.key_message}"
        for p in spine.pages
    )
    user = DOCUMENT_REVIEW_USER.format(
        thesis=spine.thesis_north_star,
        hook=(editorial_plan.document_hook if editorial_plan else spine.tone),
        outline=outline,
        data_summary=json.dumps(_data_summary(pack), indent=2, ensure_ascii=False),
        pages_json=json.dumps([p.model_dump() for p in pages], indent=2, ensure_ascii=False),
    )
    parsed, _ = client.generate_json(DOCUMENT_REVIEW_SYSTEM, user)
    return DocumentReview.model_validate(parsed)


def apply_document_review(
    pack: CompanyPack,
    spine: SpineOutline,
    pages: list[PageContent],
    review: DocumentReview,
    client: LLMClient | None = None,
    editorial_plan: EditorialPlan | None = None,
    min_severity: str = "med",
) -> list[PageContent]:
    client = client or LLMClient()
    threshold = {"low": 0, "med": 1, "high": 2}
    min_rank = threshold[min_severity]
    specs = {s.page_number: s for s in (editorial_plan.page_specs if editorial_plan else [])}
    revisions = {
        r.page_number: r
        for r in review.page_revisions
        if threshold.get(r.severity, 0) >= min_rank
    }

    updated: list[PageContent] = []
    for page in pages:
        rev = revisions.get(page.page_number)
        if rev is None:
            updated.append(page)
            continue
        brief = spine.pages[page.page_number - 1]
        feedback = (
            "DOCUMENT EDITOR FEEDBACK — revise this page so it works better inside the full deck.\n"
            + "\n".join(f"- {issue}" for issue in rev.issues)
            + f"\n\nSuggestions: {rev.suggestions}"
        )
        updated.append(
            regenerate_page_with_feedback(
                pack,
                spine,
                brief,
                client,
                feedback,
                editorial_spec=specs.get(page.page_number),
            )
        )
    return updated
