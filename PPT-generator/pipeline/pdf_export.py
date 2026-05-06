"""Phase 7a: PDF export.

Renders each .page div separately in Chromium (landscape A4) and merges them
with pypdf. Avoids the page-splitting bugs of generic HTML-to-PDF tools.
"""

from __future__ import annotations

import asyncio
import io
import tempfile
from pathlib import Path


async def _render_and_merge(html_path: Path, output_pdf: Path) -> None:
    from playwright.async_api import async_playwright
    from pypdf import PdfReader, PdfWriter

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1200, "height": 900})
        await page.goto(f"file://{html_path.resolve().as_posix()}")
        page_count = await page.evaluate(
            "document.querySelectorAll('.page').length"
        )

        writer = PdfWriter()
        for i in range(page_count):
            # Isolate one .page at a time by hiding siblings.
            await page.evaluate(
                """(idx) => {
                    const els = document.querySelectorAll('.page');
                    els.forEach((el, j) => {
                        el.style.display = (j === idx) ? '' : 'none';
                    });
                }""",
                i,
            )
            pdf_bytes = await page.pdf(
                width="338mm",
                height="190mm",
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
            reader = PdfReader(io.BytesIO(pdf_bytes))
            for pg in reader.pages:
                writer.add_page(pg)

        await browser.close()

    with output_pdf.open("wb") as f:
        writer.write(f)


def export_pdf(html: str, output_pdf_path: str) -> str:
    out = Path(output_pdf_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(html)
        tmp = Path(f.name)
    try:
        asyncio.run(_render_and_merge(tmp, out))
    finally:
        tmp.unlink(missing_ok=True)
    return str(out)
