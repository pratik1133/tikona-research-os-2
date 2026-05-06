"""Document-level editorial planning.

This stage restores some of the "single editor" behavior we lose when the
report is generated page-by-page. It produces richer per-page guidance:
what each page must land, what it should avoid repeating, and what gets cut
first if the page becomes crowded.
"""

from __future__ import annotations

import json
from typing import Any

from .llm_client import LLMClient
from .schemas import CompanyPack, EditorialPlan, PageEditorialSpec, SpineOutline


EDITORIAL_SYSTEM = """You are the research editor overseeing a 12-13 page
institutional initiation report. Your job is not to write the pages yet. Your
job is to decide how the WHOLE report should behave so it reads like one tightly
edited deck instead of many separate mini-reports.

For each planned page, define:
- `narrative_role`: the page's role in the report arc
- `must_land`: the single analytical point the page must make
- `must_include`: evidence or sub-points worth keeping if space allows
- `avoid_repeating`: points already owned by other pages and should not be repeated
- `cut_first`: lower-priority detail to remove first if the page feels crowded
- `preferred_blocks`: concise preferred block mix like ["chart", "metrics", "callout"]
- `max_blocks`: usually 2 or 3, rarely 4

Rules:
- This is a 12-13 page deck, not a memo. Compression is a feature.
- Avoid duplication across adjacent pages.
- Push pages toward complementary roles:
  * story_charts proves the thesis visually
  * thesis frames the investment case and valuation bridge
  * valuation owns the explicit maths
  * scenario_analysis owns case framing
  * entry_strategy owns monitoring and invalidation
- If two pages overlap, assign ownership clearly rather than letting both cover the same idea.
- `cut_first` should be concrete and useful for later layout-aware compression.

Return ONLY JSON matching the requested shape.
"""


EDITORIAL_USER_TEMPLATE = """North-star thesis:
{thesis}

Planned outline:
{outline}

Compact company pack:
```json
{pack_json}
```

Create the editorial plan in this exact JSON shape:
{{
  "document_hook": "<one sentence describing how the whole deck should feel>",
  "compression_bias": "<one sentence>",
  "page_specs": [
    {{
      "page_number": 1,
      "narrative_role": "<short phrase>",
      "must_land": "<one sentence>",
      "must_include": ["<point>", "..."],
      "avoid_repeating": ["<point>", "..."],
      "cut_first": ["<point>", "..."],
      "preferred_blocks": ["chart"|"table"|"metrics"|"callout"|"bullets"|"risk"|"catalyst"|"scenario"|"scorecard"|"timeline"|"paragraph"],
      "max_blocks": 2
    }}
  ]
}}
"""


def _compact_pack(pack: CompanyPack) -> dict[str, Any]:
    keep_scalar = {
        "company", "ticker", "sector", "rating", "cmp", "target_price",
        "upside_potential_pct", "tagline",
    }
    out: dict[str, Any] = {k: pack.narrative.get(k) for k in keep_scalar if k in pack.narrative}
    for k, v in pack.narrative.items():
        if k in out:
            continue
        if isinstance(v, str):
            out[k] = v[:220] + ("..." if len(v) > 220 else "")
        elif isinstance(v, list):
            out[k] = f"[list with {len(v)} items]"
        elif isinstance(v, dict):
            out[k] = {"_keys": list(v.keys())[:12]}
        else:
            out[k] = v
    return out


def _outline_summary(spine: SpineOutline) -> str:
    return "\n".join(
        f"  {p.page_number}. [{p.page_type}] {p.title} - {p.key_message}"
        for p in spine.pages
    )


def _default_spec_for_page(page_number: int, title: str, key_message: str) -> PageEditorialSpec:
    return PageEditorialSpec(
        page_number=page_number,
        narrative_role=f"Advance the report through {title}",
        must_land=key_message,
        must_include=[],
        avoid_repeating=[],
        cut_first=["secondary background detail", "repeated context already stated elsewhere"],
        preferred_blocks=["callout", "metrics"],
        max_blocks=3,
    )


def generate_editorial_plan(
    pack: CompanyPack,
    spine: SpineOutline,
    client: LLMClient | None = None,
) -> tuple[EditorialPlan, dict]:
    client = client or LLMClient()
    user = EDITORIAL_USER_TEMPLATE.format(
        thesis=spine.thesis_north_star,
        outline=_outline_summary(spine),
        pack_json=json.dumps(_compact_pack(pack), indent=2, ensure_ascii=False),
    )
    parsed, result = client.generate_json(EDITORIAL_SYSTEM, user)

    page_specs_raw = parsed.get("page_specs", []) or []
    by_page: dict[int, dict[str, Any]] = {}
    for item in page_specs_raw:
        try:
            n = int(item.get("page_number"))
        except Exception:  # noqa: BLE001
            continue
        by_page[n] = item

    normalized_specs: list[PageEditorialSpec] = []
    for brief in spine.pages:
        raw = by_page.get(brief.page_number)
        if raw is None:
            normalized_specs.append(
                _default_spec_for_page(brief.page_number, brief.title, brief.key_message)
            )
            continue
        raw["page_number"] = brief.page_number
        raw.setdefault("must_land", brief.key_message)
        raw.setdefault("narrative_role", f"Advance the report through {brief.title}")
        raw.setdefault("must_include", [])
        raw.setdefault("avoid_repeating", [])
        raw.setdefault("cut_first", [])
        raw.setdefault("preferred_blocks", [])
        raw["max_blocks"] = max(2, min(4, int(raw.get("max_blocks", 3))))
        normalized_specs.append(PageEditorialSpec.model_validate(raw))

    plan = EditorialPlan.model_validate(
        {
            "document_hook": parsed.get("document_hook") or spine.thesis_north_star,
            "compression_bias": parsed.get("compression_bias")
            or "compress aggressively; omit lower-priority detail before expanding page count",
            "page_specs": [s.model_dump() for s in normalized_specs],
        }
    )
    return plan, {"model": result.model, "usage": result.usage}
