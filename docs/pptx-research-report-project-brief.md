# PPTX-First Research Report Generator

## Are We Doing The Right Thing?

Yes. Moving away from HTML and toward a PPTX-first report generation pipeline is the right call for this use case.

Why this direction is correct:

- The current report behaves more like an institutional research deck than a normal web page.
- HTML has already shown itself to be unstable for your workflow: layout issues, editing friction, and export problems.
- Research reports for wealth management need repeatability, visual control, and reliable PDF output.
- PPTX is a better fit for slide-like layouts, tables, chart placement, branding, and analyst review.
- We can still use Anthropic heavily, but in the right layer: planning and content generation, not low-level rendering.

This is not an anti-AI decision. It is a production architecture decision.

The core principle is:

`AI decides the story. Software guarantees the document.`

---

## Project Goal

Build a production-friendly system that converts:

- structured company data
- financial model outputs
- approved research content

into:

- a branded PPTX research report
- a final PDF for publication/distribution

with high consistency, strong control over layout, and lower QA effort than the current HTML path.

---

## What Exactly Are We Building?

We are building a **PPTX-first research report generation engine** for equity research / wealth management workflows.

The system should:

- accept company metadata, financial model data, and report narrative
- use Anthropic to plan slide flow and write slide-level narrative
- convert that into a structured slide specification
- render the deck deterministically into PPTX using a fixed template system
- export the PPTX to PDF
- support review, approval, and versioning

This is not a generic “make me a presentation” app.

This is a **finance-grade document production system** for structured equity research reports.

---

## High-Level Product Idea

### Input

- Company name, ticker/NSE symbol, sector
- Financial model data
- Stage 2 approved report content
- Optional metadata like rating, target price, CMP, upside, market cap, peer list

### Intelligence Layer

Anthropic should do:

- understand the research narrative
- understand the financial model context
- decide the slide sequence
- choose slide layout types
- write titles, subtitles, bullets, and summaries
- recommend where charts or tables are needed

Anthropic should **not** do:

- generate raw PPT code every run
- control exact layout coordinates
- be the final authority for numeric table values
- invent chart series without deterministic source data

### Rendering Layer

The renderer should:

- read a validated slide spec
- apply predefined slide layouts
- place text in known positions
- generate or insert charts
- generate or insert tables
- export a branded PPTX
- export PDF from PPTX

### Output

- Draft PPTX
- Approved PPTX
- Final PDF
- Versioned structured report JSON

---

## Why We Are Not Letting The LLM Generate The Entire PPT Directly

If someone asks this, use the explanation below.

### Short Answer

We are still using AI, but we are using it in the correct layer. AI is good at planning and writing the report. It is not reliable enough to be the final rendering engine for client-grade documents.

### Business Answer

If the LLM creates the whole PPT directly every time, then layout logic changes every time too. That leads to inconsistent quality, more QA, harder debugging, and weaker operational control.

### Technical Answer

Direct LLM-to-PPT generation creates problems with:

- inconsistent output across runs
- random layout failures
- difficult debugging
- poor auditability
- higher long-term maintenance cost

A deterministic renderer solves that by keeping layout and export logic fixed.

### One-Line Positioning

`We use AI for intelligence and software for control.`

---

## Core Architecture

### 1. Canonical Source Of Truth

The source of truth should be a structured report specification, not HTML and not raw generated PPT code.

Suggested core object:

- `report.json`

It should contain:

- report metadata
- company metadata
- slide sequence
- slide layout types
- block definitions
- chart specs
- table specs
- references to deterministic numeric sources
- version metadata

### 2. Slide Layout Library

The system should use a reusable library of slide templates.

Initial layout set:

- `cover_slide`
- `company_snapshot`
- `text_plus_bullets`
- `text_plus_chart`
- `full_width_chart`
- `full_table`
- `valuation_summary`
- `risks_and_catalysts`
- `disclaimer`

The renderer should never “guess” layout. It should map a chosen layout type to fixed placement rules.

### 3. Deterministic PPTX Renderer

Use Python with `python-pptx` or a similar stable PPTX library.

The renderer should:

- load a base template
- create slides from layout definitions
- fill placeholders
- draw or embed charts
- render styled tables
- apply common formatting rules
- save PPTX

### 4. PDF Export

Final deliverable should be PDF.

Preferred flow:

- generate PPTX
- convert PPTX to PDF in a reliable post-processing step

---

## Recommended Tech Direction

### AI Layer

- Anthropic SDK
- Prompting for structured JSON output only
- Validation of model output before rendering

### Backend / Rendering

- Python
- `python-pptx`
- `pydantic` for schema validation
- `pandas` for table prep
- `matplotlib` or `plotly` for chart generation if using image-based charts

### Data / Storage

- JSON report spec stored per version
- PPTX file storage
- PDF file storage
- optional metadata DB for runs, approvals, statuses, versions

---

## What Needs To Be Ready Before Starting

### Product Decisions

- What is the standard research report length range?
- What are the mandatory slide types?
- What fields are always required?
- Which parts are editable by analysts?
- What is the approval flow?
- Is PPTX just an internal artifact, or should analysts edit it manually too?

### Design Assets

- Master PPTX template
- Brand guide
- Fonts
- Color system
- Example good reports
- Disclaimer slide copy

### Data Inputs

- Financial model schema
- Report section schema
- Company metadata schema
- Standard fields for CMP, TP, rating, upside, valuation, key metrics

### Engineering Inputs

- preferred runtime and deployment model
- file storage approach
- PDF conversion approach
- schema versioning plan
- logging/error reporting approach

---

## Suggested JSON Model

At a minimum, the report spec should support:

```json
{
  "report_id": "uuid",
  "company": {
    "name": "ABC Ltd",
    "ticker": "ABC",
    "sector": "Chemicals"
  },
  "metadata": {
    "rating": "BUY",
    "cmp": 420,
    "target_price": 515
  },
  "slides": [
    {
      "slide_id": "s1",
      "layout": "company_snapshot",
      "title": "ABC Ltd At A Glance",
      "blocks": [
        {
          "type": "text",
          "key": "summary",
          "content": "..."
        },
        {
          "type": "metrics",
          "key": "key_metrics",
          "items": [
            { "label": "CMP", "value": "₹420" },
            { "label": "TP", "value": "₹515" }
          ]
        }
      ]
    }
  ]
}
```

---

## Chart Strategy

Do not let the LLM invent chart data.

Use deterministic sources for chart series:

- financial model outputs
- validated computed metrics
- stored peer comparison data

Recommended chart strategy:

- Start with image-based charts for speed and visual control
- Use native PPT charts later if editability becomes important

Initial chart types:

- bar
- line
- stacked bar
- combo
- donut only where truly useful

---

## Table Strategy

Tables should also be deterministic.

Initial supported tables:

- annual financial summary
- quarterly summary
- peer comparison
- valuation table
- SOTP table
- ratio summary

Renderer rules needed:

- standard column widths
- numeric formatting
- row limits per slide
- split behavior for overflow
- fallback for missing values

---

## MVP Scope

The first version should do only the essentials well.

### MVP Inclusions

- ingest approved report content + financial model
- generate slide plan JSON via Anthropic
- support 5 to 8 slide layouts
- render PPTX
- support basic charts and tables
- export PDF
- save run outputs

### MVP Exclusions

- free-form design generation
- too many sector-specific templates
- complex editor UI
- full WYSIWYG deck editing
- advanced animation/transitions
- highly dynamic overflow resolution for every edge case

---

## Phased Build Plan

### Phase 1: Project Foundation

Goal:

Set up the project skeleton and define the source-of-truth schema.

Deliverables:

- repo structure
- report JSON schema
- slide/block schema
- sample inputs and outputs
- first prompt contract for Anthropic

### Phase 2: Slide Planning With Anthropic

Goal:

Use Anthropic to produce a structured slide plan from research content and financial model data.

Deliverables:

- prompts
- schema validation
- retry/fallback behavior
- sample slide plans across a few companies

### Phase 3: Layout Library

Goal:

Create reusable layout definitions for the deck.

Deliverables:

- master template
- placeholder map
- layout registry
- formatting helpers

### Phase 4: PPTX Renderer

Goal:

Build deterministic rendering from structured slide spec to PPTX.

Deliverables:

- slide factory
- text rendering
- metric card rendering
- image placement
- reusable theme helpers

### Phase 5: Charts And Tables

Goal:

Add finance-grade visual blocks.

Deliverables:

- chart renderer
- table renderer
- overflow handling basics
- numeric formatting helpers

### Phase 6: Export, QA, And Versioning

Goal:

Make the system operationally usable.

Deliverables:

- PDF export
- run status tracking
- versioned JSON
- audit trail
- regression sample set

---

## Success Criteria

The project is successful if:

- reports render consistently across runs
- analysts spend less time fixing formatting
- PDF output is reliable
- charts and tables are accurate and readable
- the system is easier to maintain than the HTML path
- AI improves report quality without controlling layout unpredictably

---

## Risks

### Product Risks

- unclear report standardization
- too much flexibility requested too early
- trying to support all slide types in v1

### Engineering Risks

- poor schema design
- weak overflow handling
- over-reliance on model output without validation
- mixing numeric truth with narrative generation

### Operational Risks

- analysts editing final PPT manually without version trace
- mismatches between PDF and approved structured content
- weak fallback behavior when data is incomplete

---

## Ground Rules For This Project

- structured JSON is the canonical report artifact
- PPTX is the primary rendering artifact
- PDF is the primary distribution artifact
- LLM returns structured content, not low-level rendering code
- numeric content must come from deterministic sources whenever possible
- layouts must be predefined and validated
- every report run should be reproducible

---

## Ideal First Milestone

A good first milestone is:

`Given one company, one financial model, and one approved report draft, generate a branded 6-8 slide PPTX deck with at least one chart, one table, and a final PDF.`

If that works reliably, the project direction is validated.

---

## Final Position

This project is the right move.

We are not walking away from AI. We are moving AI into the role where it adds the most value and causes the least production instability.

The final architecture should be:

`Financial model + approved report content -> Anthropic slide plan -> structured report JSON -> deterministic PPTX renderer -> PDF export`
