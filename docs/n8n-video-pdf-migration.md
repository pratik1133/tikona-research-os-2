# n8n Video Workflow: PPT -> PDF Migration

This workflow update assumes:

- the report visual source is now `research_reports.pdf_file_url`
- page images come from `POST http://72.61.226.16:5005/convert`
- the converter accepts either `ppt_url` or `pdf_url`
- the response shape from `/convert` is still:

```json
{
  "success": true,
  "images": ["data:image/png;base64,..."],
  "slide_count": 18,
  "report_id": "..."
}
```

## What Changed

The old workflow was tied to a fixed 12-slide PPT structure. The new report flow is dynamic, so:

1. Use `pdf_file_url` instead of `ppt_file_url`
2. Share the PDF, not the PPT
3. Convert the PDF pages to images
4. Generate narration dynamically based on:
   - actual page count
   - real report sections present in Supabase

## Node Changes

### 1. `Prepare Video Data2`

Replace the Set assignments with:

```javascript
{
  "pdf_id": "{{ $('Fetch Report from Supabase2').item.json.pdf_file_id || $('Fetch Report from Supabase2').item.json.pdf_file_url?.match(/\\/d\\/(.+?)(\\/|$)/)?.[1] || '' }}",
  "pdf_url": "{{ $('Fetch Report from Supabase2').item.json.pdf_file_url || '' }}",
  "report_id": "{{ $('Set Configuration2').item.json.report_id }}",
  "company_name": "{{ $('Fetch Report from Supabase2').item.json.company_name }}"
}
```

Delete the old `ppt_id` and `ppt_url` assignments.

### 2. `Check PDF Exists2`

Replace the old `Check PPT Exists2` node.

Condition:

- Left value:

```javascript
={{ $json.pdf_url }}
```

- Operator: `notEmpty`

### 3. `Ensure PDF is Public1`

Same Google Drive share node, but change `fileId` to:

```javascript
={{ $json.pdf_id }}
```

### 4. `Convert PDF to Images2`

Replace the old HTTP Request node settings with:

- Method: `POST`
- URL:

```text
http://72.61.226.16:5005/convert
```

- JSON body:

```json
{
  "pdf_url": "{{ $('Prepare Video Data2').item.json.pdf_url }}",
  "project_id": "{{ $('Set Configuration2').item.json.report_id }}"
}
```

### 5. `Code: Prepare AI Prompt`

Replace the entire code node with this:

```javascript
// ============================================================
// STEP 1: Build a dynamic report-aware prompt for the current PDF
// ============================================================

const images = $input.all()[0].json.images || $input.all()[0].json.data?.images || [];

let report = {};
try {
  report = $("Fetch Report from Supabase2").first().json || {};
} catch (e) {
  report = $input.all()[0].json || {};
}

const get = (field, fallback = "") => report[field] || fallback;
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

const standardSections = [
  { key: "company_background", fallbackTitle: "Company Background" },
  { key: "business_model", fallbackTitle: "Business Model" },
  { key: "management_analysis", fallbackTitle: "Management Analysis" },
  { key: "industry_overview", fallbackTitle: "Industry Overview" },
  { key: "industry_tailwinds", fallbackTitle: "Key Industry Tailwinds" },
  { key: "demand_drivers", fallbackTitle: "Demand Drivers" },
  { key: "industry_risks", fallbackTitle: "Industry Risks" },
];

const customSections = [
  { key: "cs_investment_rationale", headingKey: "cs_investment_rationale_h", fallbackTitle: "Investment Rationale" },
  { key: "cs_corporate_governance", headingKey: "cs_corporate_governance_h", fallbackTitle: "Corporate Governance" },
  { key: "cs_saarthi_framework", headingKey: "cs_saarthi_framework_h", fallbackTitle: "SAARTHI Framework" },
  { key: "cs_entry_review_exit_strategy", headingKey: "cs_entry_review_exit_strategy_h", fallbackTitle: "Entry Review Exit Strategy" },
  { key: "cs_scenario_analysis", headingKey: "cs_scenario_analysis_h", fallbackTitle: "Scenario Analysis" },
  { key: "cs_rating", headingKey: "cs_rating_h", fallbackTitle: "Rating" },
  { key: "cs_target_price", headingKey: "cs_target_price_h", fallbackTitle: "Target Price" },
  { key: "cs_upside_percentage", headingKey: "cs_upside_percentage_h", fallbackTitle: "Upside Percentage" },
  { key: "cs_market_cap", headingKey: "cs_market_cap_h", fallbackTitle: "Market Cap" },
  { key: "cs_market_cap_category", headingKey: "cs_market_cap_category_h", fallbackTitle: "Market Cap Category" },
  { key: "cs_current_market_price", headingKey: "cs_current_market_price_h", fallbackTitle: "Current Market Price" },
];

const orderedSections = [];

for (const section of standardSections) {
  const content = clean(get(section.key));
  if (!content) continue;
  const heading = clean(get(`${section.key}_h`, section.fallbackTitle)) || section.fallbackTitle;
  orderedSections.push({ title: heading, content });
}

for (const section of customSections) {
  const content = clean(get(section.key));
  if (!content) continue;
  const heading = clean(get(section.headingKey, section.fallbackTitle)) || section.fallbackTitle;
  orderedSections.push({ title: heading, content });
}

const companyName = get("company_name", "this company");
const recommendation = clean(get("recommendation"));
const targetPrice = clean(get("target_price"));
const pageCount = images.length;

if (pageCount === 0) {
  throw new Error("No page images were returned from the PDF converter.");
}

const contentPages = Math.max(1, pageCount - 2); // page 1 intro, last page disclaimer/close
const buckets = Array.from({ length: contentPages }, () => []);

orderedSections.forEach((section, index) => {
  buckets[index % contentPages].push(section);
});

const pagePlan = [];

pagePlan.push({
  page: 1,
  title: "Opening",
  sections: [
    {
      title: "Opening Summary",
      content: `Company: ${companyName}. Recommendation: ${recommendation || "Not specified"}. Target Price: ${targetPrice || "Not specified"}. Introduce the report and the core investment case.`
    }
  ]
});

for (let i = 0; i < buckets.length; i++) {
  pagePlan.push({
    page: i + 2,
    title: `Page ${i + 2}`,
    sections: buckets[i].length ? buckets[i] : [
      {
        title: "General Commentary",
        content: `Continue the presentation flow for ${companyName} using the visible content on this page.`
      }
    ]
  });
}

if (pagePlan.length < pageCount) {
  pagePlan.push({
    page: pageCount,
    title: "Closing / Disclaimer",
    sections: [
      {
        title: "Closing",
        content: `Wrap up the report for ${companyName}. If this page is a disclaimer or disclosures page, keep the narration brief and formal.`
      }
    ]
  });
}

while (pagePlan.length < pageCount) {
  pagePlan.push({
    page: pagePlan.length + 1,
    title: `Page ${pagePlan.length + 1}`,
    sections: [
      {
        title: "Continuation",
        content: `Provide a concise continuation of the research narrative for ${companyName}.`
      }
    ]
  });
}

const planText = pagePlan.map((page) => {
  const block = page.sections
    .map((section) => `- ${section.title}: ${section.content}`)
    .join("\n");
  return `--- PAGE ${page.page}: ${page.title} ---\n${block}`;
}).join("\n\n");

const prompt = `You are a professional equity research analyst creating a voice-over narration script for a video walkthrough of a PDF research report about ${companyName}.

This report is no longer a fixed 12-slide PPT. It is a dynamic PDF with ${pageCount} pages.

You must return narration for EXACTLY ${pageCount} pages.

Rules:
1. Return ONLY a valid JSON array of exactly ${pageCount} strings.
2. Each string is the narration for one page, in order.
3. Each page narration should usually be 35-75 words.
4. Make it sound natural, confident, and professional.
5. Do not use markdown, bullet points, asterisks, or labels.
6. Avoid reading raw tables line-by-line; summarize the key message.
7. If a page is a disclaimer, disclosures page, or low-content page, keep narration very short.
8. Spell out financial abbreviations naturally where possible.
9. Maintain flow from page to page instead of repeating the company intro.

Use this page plan derived from the report content:

${planText}`;

const geminiBody = {
  contents: [{
    parts: [{ text: prompt }]
  }],
  generationConfig: {
    temperature: 0.6,
    maxOutputTokens: 8192,
    responseMimeType: "application/json"
  }
};

return {
  json: {
    images,
    geminiBody,
    company_name: companyName,
    page_count: pageCount
  }
};
```

### 6. `Code: Map AI Scripts to Scenes`

Replace the entire code node with this:

```javascript
// ============================================================
// STEP 3: Parse AI response and map it to however many PDF pages exist
// ============================================================

const images = $("Code: Prepare AI Prompt").first().json.images || [];
const expectedCount = images.length;

const geminiResponse = $input.first().json;
let aiText = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

aiText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

let scripts;
try {
  scripts = JSON.parse(aiText);
} catch (e) {
  const arrayMatch = aiText.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    scripts = JSON.parse(arrayMatch[0]);
  } else {
    throw new Error("Failed to parse AI response as JSON array: " + aiText.substring(0, 200));
  }
}

if (!Array.isArray(scripts)) {
  throw new Error("AI response was not a JSON array.");
}

function cleanTextForAudio(text) {
  if (!text) return "";
  let clean = text.toString();

  clean = clean.replace(/[*_#`\[\]]/g, "")
    .replace(/- /g, ", ");

  clean = clean.replace(/\b(\d+(\.\d+)?)M\b/gi, "$1 Million")
    .replace(/\b(\d+(\.\d+)?)B\b/gi, "$1 Billion")
    .replace(/\b(\d+(\.\d+)?)Cr\b/gi, "$1 Crore")
    .replace(/\bFY(\d{2})\b/gi, "Fiscal Year 20$1")
    .replace(/\bQ(\d)\b/gi, "Quarter $1")
    .replace(/\bYoY\b/gi, "Year over Year")
    .replace(/\bQoQ\b/gi, "Quarter over Quarter")
    .replace(/\bEBITDA\b/gi, "Ebitda")
    .replace(/\bCAGR\b/gi, "C A G R")
    .replace(/\bROE\b/gi, "R O E")
    .replace(/\bPAT\b/gi, "P A T")
    .replace(/\bP\/E\b/gi, "P E ratio");

  clean = clean.replace(/\$/g, " dollars ")
    .replace(/₹/g, " rupees ")
    .replace(/Rs\./gi, " rupees ");

  clean = clean.replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return clean;
}

const normalizedScripts = [...scripts];

while (normalizedScripts.length < expectedCount) {
  normalizedScripts.push("This page continues the report discussion.");
}

const scenes = [];
for (let i = 0; i < expectedCount; i++) {
  const rawText = normalizedScripts[i] || "";
  const finalText = cleanTextForAudio(rawText) || " ";

  scenes.push({
    image: images[i],
    text: finalText.substring(0, 1200)
  });
}

return { json: { scenes } };
```

## Important Note About the New Report Format

This migration is enough to make the workflow functional again, but the narration is still section-driven, not page-OCR-driven.

That means:

- it will adapt to varying page counts
- it will work much better than the old fixed 12-slide logic
- but it still does not "read" each actual page image

If you want page-perfect narration later, the next upgrade is:

1. convert PDF to images
2. send page images to a vision model
3. ask for one narration per page based on the actual page visuals

For now, this migration is the best low-risk bridge from PPT to PDF.
