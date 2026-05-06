"""Phase 2: Spine generator.

One LLM call that reads the CompanyPack and returns a SpineOutline:
  - thesis_north_star (the single argument the whole report defends)
  - pages: list of PageBrief (type, title, key_message, data_slices)

The output is short, so truncation is not a risk. This outline becomes the
coherence anchor — every downstream page call sees it.
"""

from __future__ import annotations

import json
from typing import Any

from .llm_client import LLMClient
from .schemas import CompanyPack, PageBrief, SpineOutline


ALLOWED_PAGE_TYPES = [
    "cover",
    "story_charts",
    "thesis",
    "industry",
    "company_overview",
    "business_segments",
    "management",
    "earnings_forecast",
    "financial_highlights",
    "valuation",
    "scorecard",
    "scenario_analysis",
    "entry_strategy",
    "catalysts",
    "risks",
    "peer_comparison",
    "esg",
    "appendix",
    # NOTE: "disclaimer" is auto-appended by renderer, not planned by LLM
]


SPINE_SYSTEM = """You are a senior equity research editor at an Indian institutional \
brokerage (think IIFL / Jefferies India). You plan the structure of landscape \
research reports before analysts draft them.

Your job: given a company research pack, decide the report's outline.

RECOMMENDED SECTION ORDER (follow this as closely as data permits):
  1. cover          — Teaser page. Deal maker/breaker. Recommendation + why, in 60 seconds.
  2. story_charts   — Story in charts: 2/3 visuals, 1/3 text. Charts tell the story.
  3. thesis         — Investment Thesis (1 page). Core idea + risks + valuation summary.
  4. industry       — Industry Overview. Sector growth, structural drivers, key risks.
  5. company_overview — What the company does. Revenue split. Business explainable in 2 sentences.
  6. business_segments — Key Investment Ideas. Sector positioning, differentiation, growth drivers, moat.
  7. management     — Management Analysis. Governance quality, board structure, credibility.
  8. earnings_forecast — Earnings Forecast. 3Y historical + 2Y forward. State assumptions.
  9. financial_highlights — Financials. P&L, Balance Sheet, Cash Flow, margins, key ratios.
  10. valuation     — Valuations. Multi-method (P/E, EV/EBITDA, DCF). Sensitivity analysis.
  11. scorecard     — SAARTHI Framework. EVERY dimension detailed with progress bars.
  12. scenario_analysis — Scenario Analysis. Bull/Base/Bear cases with assumptions & impact.
  13. entry_strategy — Entry, Review, Exit Strategy. When to buy, thesis invalidation triggers.

You may ADD optional pages (catalysts, risks, peer_comparison, esg, appendix) if data supports them.
You may SKIP sections if the data pack doesn't have enough content for them.
Do NOT include a "disclaimer" page — that is auto-appended by the system.

Rules:
- Aim for 12–13 pages (excluding disclaimer). 13 is ideal. Do NOT pad.
- Prefer combining related material into one strong page over splitting it across multiple pages.
- Use optional pages only when they remove real crowding from a core page.
- Prefer thesis + catalysts together when possible.
- Prefer entry strategy + thesis invalidation triggers together when possible.
- Avoid appendix/esg pages unless they are essential to the thesis.
- Every page must advance the thesis. No filler.
- Each page has one and only one "key_message" — a single sentence an analyst must prove.
- The thesis_north_star is the ONE argument the whole report defends.
- Use only these page types: {page_types}
- "data_slices" are dotted keys from the narrative JSON the page will consume.
"""


SPINE_USER_TEMPLATE = """Company research pack (JSON):
```json
{pack_json}
```

Available narrative keys (top level): {narrative_keys}
Financial years in model: {years}

Design the outline. Output JSON matching this exact shape:

{{
  "thesis_north_star": "<one sentence>",
  "tone": "<short phrase>",
  "pages": [
    {{
      "page_number": 1,
      "page_type": "<one of the allowed types>",
      "title": "<page title>",
      "key_message": "<one sentence>",
      "data_slices": ["<dotted.key>", ...]
    }},
    ...
  ]
}}
"""


def _compact_pack_for_spine(pack: CompanyPack) -> dict[str, Any]:
    """Slim the pack down so the spine call stays cheap.

    Keep scalars + short descriptive fields; drop long prose sections.
    Spine doesn't need the full thesis body — just enough to plan structure.
    """
    keep_scalar = {
        "company", "ticker", "sector", "rating", "cmp", "target_price",
        "upside_potential_pct", "tagline",
    }
    out: dict[str, Any] = {k: pack.narrative.get(k) for k in keep_scalar if k in pack.narrative}

    # For each remaining section, include only a short preview so the planner
    # knows what's available without reading every word.
    for k, v in pack.narrative.items():
        if k in keep_scalar or k in out:
            continue
        if isinstance(v, str):
            out[k] = v[:400] + ("…" if len(v) > 400 else "")
        elif isinstance(v, list):
            out[k] = f"[list with {len(v)} items]"
        elif isinstance(v, dict):
            out[k] = {"_keys": list(v.keys())[:20]}
        else:
            out[k] = v
    return out


def generate_spine(pack: CompanyPack, client: LLMClient | None = None) -> tuple[SpineOutline, dict]:
    """Returns (validated SpineOutline, raw usage info)."""
    client = client or LLMClient()

    system = SPINE_SYSTEM.format(page_types=", ".join(ALLOWED_PAGE_TYPES))
    user = SPINE_USER_TEMPLATE.format(
        pack_json=json.dumps(_compact_pack_for_spine(pack), indent=2, ensure_ascii=False),
        narrative_keys=", ".join(sorted(pack.narrative.keys())),
        years=", ".join(pack.financials.years) if pack.financials else "n/a",
    )

    parsed, result = client.generate_json(system, user)

    # Ensure page numbers are sequential starting at 1.
    pages = parsed.get("pages", [])
    for i, p in enumerate(pages, start=1):
        p["page_number"] = i
    parsed["pages"] = pages

    spine = SpineOutline.model_validate(parsed)
    return spine, {"model": result.model, "usage": result.usage}
