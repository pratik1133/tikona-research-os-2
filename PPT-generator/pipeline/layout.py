"""Phase 6: Layout solver.

Renders the HTML with headless Chromium, measures each .page div's actual
content height, and:
  - flags OVERFLOW pages (content taller than the page box)
  - flags SPARSE pages (content fills < 40% of the page)

Auto-fix strategy (conservative):
  - Overflow: move trailing blocks onto a new page of the same page_type
    (preserves coherence; key_message still reinforced).
  - Sparse: logged only — expansion requires an LLM call, handled by caller.

The solver is deterministic and idempotent — re-run until no overflow.
"""

from __future__ import annotations

import asyncio
import copy
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .renderer import render_document
from .schemas import CompanyPack, PageContent


# 16:9 widescreen page at 96dpi: 190mm -> ~718px. Leave buffer for header+footer.
DEFAULT_PAGE_HEIGHT = 718
DEFAULT_CONTENT_BUDGET = 640
SPARSE_RATIO = 0.40


@dataclass
class PageMeasurement:
    page_number: int
    rendered_height: int
    budget: int
    overflow: bool
    sparse: bool
    fill_ratio: float


async def _measure(html_path: Path) -> list[int]:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1200, "height": 900})
        await page.goto(f"file://{html_path.resolve().as_posix()}")
        heights = await page.evaluate(
            """() => Array.from(document.querySelectorAll('.page'))
                   .map(el => el.scrollHeight)"""
        )
        await browser.close()
        return heights


def measure_pages(html: str, budget: int = DEFAULT_CONTENT_BUDGET) -> list[PageMeasurement]:
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(html)
        tmp = Path(f.name)
    try:
        heights = asyncio.run(_measure(tmp))
    finally:
        tmp.unlink(missing_ok=True)

    out: list[PageMeasurement] = []
    for i, h in enumerate(heights, start=1):
        out.append(
            PageMeasurement(
                page_number=i,
                rendered_height=h,
                budget=budget,
                overflow=h > DEFAULT_PAGE_HEIGHT,
                sparse=(h / DEFAULT_PAGE_HEIGHT) < SPARSE_RATIO,
                fill_ratio=h / DEFAULT_PAGE_HEIGHT,
            )
        )
    return out


def split_overflow_pages(
    pages: list[PageContent],
    measurements: list[PageMeasurement],
) -> list[PageContent]:
    """Split overflowing pages without creating empty continuation pages."""
    meas = {m.page_number: m for m in measurements}
    new_pages: list[PageContent] = []

    for p in pages:
        m = meas.get(p.page_number)
        if not m or not m.overflow or len(p.blocks) < 2:
            new_pages.append(p)
            continue

        # Estimate how many leading blocks can fit within the measured budget.
        fit_ratio = max(0.2, min(0.8, m.budget / max(m.rendered_height, 1)))
        mid = int(round(len(p.blocks) * fit_ratio))
        mid = max(1, min(len(p.blocks) - 1, mid))
        first = copy.deepcopy(p)
        first.blocks = p.blocks[:mid]
        cont = copy.deepcopy(p)
        cont.blocks = p.blocks[mid:]
        if not cont.blocks:
            new_pages.append(first)
            continue
        cont.title = f"{p.title} (contd.)"
        new_pages.append(first)
        new_pages.append(cont)

    return _prune_and_renumber(new_pages)


def _prune_and_renumber(pages: list[PageContent]) -> list[PageContent]:
    """Drop blank pages and collapse repeated continuation suffixes."""
    cleaned: list[PageContent] = []
    for p in pages:
        if not p.blocks:
            continue
        while p.title.endswith(" (contd.) (contd.)"):
            p.title = p.title[:-9]
        cleaned.append(p)

    for i, p in enumerate(cleaned, start=1):
        p.page_number = i
    return cleaned


def solve_layout(
    pages: list[PageContent],
    pack: CompanyPack,
    css: str,
    max_iters: int = 3,
) -> tuple[list[PageContent], list[PageMeasurement]]:
    """Iteratively render → measure → split until stable or max_iters reached."""
    current = _prune_and_renumber(copy.deepcopy(pages))
    original_count = len(current)
    measurements: list[PageMeasurement] = []
    for _ in range(max_iters):
        html = render_document(current, pack, css)
        measurements = measure_pages(html)
        overflowing = [m for m in measurements if m.overflow]
        if not overflowing:
            break
        updated = split_overflow_pages(current, measurements)
        if len(updated) > max(original_count + 6, int(original_count * 1.5)):
            break
        if len(updated) == len(current):
            break
        current = updated
    return current, measurements
