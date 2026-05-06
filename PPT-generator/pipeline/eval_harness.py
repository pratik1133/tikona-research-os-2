"""Phase 7b: Evaluation harness — LLM-as-judge.

Scores a generated report on five dimensions, 1-5 each, with short rationale.
Use it to track quality across pipeline changes. A "golden set" of 3-5 companies
plus this scorer gives you a numeric fitness function for future iteration.

Rubric:
  coherence        : every page reinforces the thesis_north_star
  factual_fidelity : numbers/claims traceable to CompanyPack (no hallucinations)
  depth            : analysis is institutional-grade, not superficial
  prose_quality    : tight, data-led, free of filler
  visual_fidelity  : blocks picked suit the message; layout makes sense
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from typing import Any

from .llm_client import LLMClient
from .schemas import CompanyPack, PageContent, SpineOutline


@dataclass
class EvalScore:
    coherence: int
    factual_fidelity: int
    depth: int
    prose_quality: int
    visual_fidelity: int
    rationale: dict[str, str]
    total: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


EVAL_SYSTEM = """You are the head of equity research at a tier-1 institutional \
brokerage. You grade draft reports harshly but fairly. You do NOT give \
participation scores — a 3 means genuinely acceptable, 5 means you would \
send this to a sovereign wealth fund unchanged.

Score each dimension 1-5:
  coherence        : does every page reinforce the thesis_north_star?
  factual_fidelity : are all numbers/claims traceable to the provided data?
  depth            : is the analysis institutional-grade, not superficial?
  prose_quality    : tight, data-led, no filler or hype?
  visual_fidelity  : block types suit each page's message?

Return JSON:
{
  "coherence": int, "factual_fidelity": int, "depth": int,
  "prose_quality": int, "visual_fidelity": int,
  "rationale": {
    "coherence": "...", "factual_fidelity": "...", "depth": "...",
    "prose_quality": "...", "visual_fidelity": "..."
  }
}
"""


EVAL_USER = """Thesis north-star: {thesis}

Outline:
{outline}

Source data (summary):
```json
{data_summary}
```

Report pages (JSON):
```json
{pages_json}
```

Score this report.
"""


def _data_summary(pack: CompanyPack) -> dict[str, Any]:
    d = {
        "company": pack.company,
        "rating": pack.rating,
        "cmp": pack.cmp,
        "target_price": pack.target_price,
        "narrative_keys": sorted(pack.narrative.keys()),
    }
    if pack.financials:
        d["financial_metrics"] = [r.metric for r in pack.financials.rows]
        d["years"] = pack.financials.years
    return d


def evaluate(
    pack: CompanyPack,
    spine: SpineOutline,
    pages: list[PageContent],
    client: LLMClient | None = None,
) -> EvalScore:
    client = client or LLMClient()
    outline = "\n".join(
        f"  {p.page_number}. [{p.page_type}] {p.title} — {p.key_message}"
        for p in spine.pages
    )
    user = EVAL_USER.format(
        thesis=spine.thesis_north_star,
        outline=outline,
        data_summary=json.dumps(_data_summary(pack), indent=2, ensure_ascii=False),
        pages_json=json.dumps([p.model_dump() for p in pages], indent=2, ensure_ascii=False),
    )
    parsed, _ = client.generate_json(EVAL_SYSTEM, user)

    dims = ("coherence", "factual_fidelity", "depth", "prose_quality", "visual_fidelity")
    scores = {d: int(parsed.get(d, 0)) for d in dims}
    rationale = parsed.get("rationale", {}) or {}
    return EvalScore(
        **scores,
        rationale={d: str(rationale.get(d, "")) for d in dims},
        total=sum(scores.values()),
    )
