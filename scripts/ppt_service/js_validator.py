"""
JavaScript code validation and repair utilities.
Adapted from the Colab PPT generation script.
"""

import re

# Matches slide variable declarations (let/var/const slide = pres.addSlide())
SLIDE_BOUNDARY_RX = re.compile(
    r"(?:let|var|const)\s+slide\w*\s*=\s*pres\.addSlide\(\)\s*;"
)


def is_balanced(code: str) -> bool:
    """Check whether all brackets are balanced, ignoring strings and comments."""
    depth = 0
    i = 0
    n = len(code)
    while i < n:
        ch = code[i]
        # Skip single-line comments
        if ch == "/" and i + 1 < n and code[i + 1] == "/":
            while i < n and code[i] != "\n":
                i += 1
            continue
        # Skip double-quoted strings
        if ch == '"':
            i += 1
            while i < n:
                if code[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if code[i] == '"':
                    break
                i += 1
        # Skip single-quoted strings
        elif ch == "'":
            i += 1
            while i < n:
                if code[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if code[i] == "'":
                    break
                i += 1
        # Skip template literals
        elif ch == "`":
            i += 1
            while i < n:
                if code[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if code[i] == "`":
                    break
                i += 1
        # Count brackets
        elif ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        i += 1
    return depth == 0


def extract_valid_slide_blocks(merged_code: str, total_slides: int = 16) -> tuple[str, list[int]]:
    """
    Split merged JS at every slide boundary.
    Keep only blocks where all brackets are balanced.
    Returns (valid_code, list_of_missing_slide_numbers).
    """
    boundaries = [(m.start(), m.group()) for m in SLIDE_BOUNDARY_RX.finditer(merged_code)]

    if not boundaries:
        return merged_code, list(range(1, total_slides + 1))

    boilerplate = merged_code[: boundaries[0][0]]
    valid_parts: list[str] = []
    present_pages: set[int] = set()

    for idx, (start, _) in enumerate(boundaries):
        end = boundaries[idx + 1][0] if idx + 1 < len(boundaries) else len(merged_code)
        block = merged_code[start:end]

        if is_balanced(block):
            valid_parts.append(block)
            # Detect page number from F(slide, pres, N) footer call
            page_match = re.search(
                r"F\(\s*slide\w*\s*,\s*pres\s*,\s*[\"']?(\d+)[\"']?\s*\)", block
            )
            if page_match:
                present_pages.add(int(page_match.group(1)))

    valid_code = boilerplate + "\n".join(valid_parts)

    # Slide 1 (cover) may not have F() footer — detect by background pattern
    if valid_parts and 1 not in present_pages:
        first_block = valid_parts[0]
        if "background" in first_block.lower()[:300]:
            present_pages.add(1)

    missing_nums = sorted(set(range(1, total_slides + 1)) - present_pages)
    return valid_code, missing_nums


def remove_dup_declarations(code: str) -> tuple[str, int]:
    """
    Remove duplicate top-level declarations that bleed in
    when LLM chunks are merged.
    """
    lines = code.split("\n")
    result: list[str] = []
    seen_setup = False
    skip_fn = False
    fn_depth = 0
    removed = 0

    for ln in lines:
        s = ln.strip()
        if "pres.layout" in s:
            seen_setup = True

        if skip_fn:
            fn_depth += s.count("{") - s.count("}")
            if fn_depth <= 0:
                skip_fn = False
                fn_depth = 0
            removed += 1
            continue

        if seen_setup:
            if s.startswith("const pptxgen = require"):
                removed += 1
                continue
            if s.startswith("let pres = new pptxgen") or s.startswith("var pres = new pptxgen"):
                removed += 1
                continue
            if s == "const TOTAL = 16;":
                removed += 1
                continue
            if s.startswith("const C = {"):
                removed += 1
                continue
            if s.startswith("const mkS"):
                removed += 1
                continue
            if s.startswith("function H(") or s.startswith("function F("):
                skip_fn = True
                fn_depth = 0
                removed += 1
                continue

        result.append(ln)

    return "\n".join(result), removed


def fix_shapetype_hallucinations(code: str) -> str:
    """Fix common LLM hallucinations in PptxGenJS code."""
    replacements = {
        "pres.ShapeType.rect": "pres.shapes.RECTANGLE",
        "pres.ShapeType.oval": "pres.shapes.OVAL",
        "pres.ShapeType.line": "pres.shapes.LINE",
    }
    for wrong, right in replacements.items():
        code = code.replace(wrong, right)
    return code


def convert_let_to_var(code: str) -> str:
    """Convert let/const slide declarations to var (allows re-declaration across chunks)."""
    return re.sub(
        r"\b(?:let|const)\s+(slide\w*)\s*=\s*pres\.addSlide\(\)",
        r"var \1 = pres.addSlide()",
        code,
    )
