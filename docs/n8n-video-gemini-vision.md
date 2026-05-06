# n8n Video Workflow: Gemini Vision Narration

This version removes the old fixed-slide / section-mapping logic and generates narration from the actual PDF page images.

Use this when:

- the report is generated as HTML -> PDF
- the PDF is the final approved visual artifact
- page count is dynamic
- charts / tables / page composition matter

## Final Flow

1. Fetch `pdf_file_url` from `research_reports`
2. Make the PDF public in Drive
3. Convert the PDF to page images with:

```text
POST http://72.61.226.16:5005/convert
```

4. Send page images to Gemini Vision
5. Get back one narration string per page
6. Map narration to scenes
7. Send scenes to `POST http://72.61.226.16:5005/generate-video`

## What to Replace

You should replace:

- `Code: Prepare AI Prompt`
- `Gemini: Summarize Slides`
- `Code: Map AI Scripts to Scenes`

The upstream PDF conversion node can stay, as long as it returns:

```json
{
  "images": ["data:image/png;base64,...", "..."]
}
```

## 1. `Prepare Video Data2`

Use:

```javascript
{
  "pdf_id": "{{ $('Fetch Report from Supabase2').item.json.pdf_file_id || $('Fetch Report from Supabase2').item.json.pdf_file_url?.match(/\\/d\\/(.+?)(\\/|$)/)?.[1] || '' }}",
  "pdf_url": "{{ $('Fetch Report from Supabase2').item.json.pdf_file_url || '' }}",
  "report_id": "{{ $('Set Configuration2').item.json.report_id }}",
  "company_name": "{{ $('Fetch Report from Supabase2').item.json.company_name }}"
}
```

## 2. `Convert PDF to Images2`

HTTP Request settings:

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

## 3. `Code: Prepare Gemini Vision Prompt`

Replace the old `Code: Prepare AI Prompt` node with this:

```javascript
// ============================================================
// STEP 1: Build Gemini Vision request from actual PDF page images
// ============================================================

const images = $input.first().json.images || [];

let report = {};
try {
  report = $("Fetch Report from Supabase2").first().json || {};
} catch (e) {
  report = {};
}

const companyName = report.company_name || "this company";
const pageCount = images.length;

if (!pageCount) {
  throw new Error("No images returned from PDF conversion.");
}

const parts = [];

parts.push({
  text: `You are a professional equity research analyst creating narration for a research-report video.

You will be given ${pageCount} page images from a PDF equity research report for ${companyName}.

Your job:
1. Analyze each page image visually.
2. Write one narration paragraph per page, in order.
3. Each narration should usually be 35-75 words.
4. Focus on the key insight of the page, not every tiny detail.
5. If the page is mainly a chart, table, or dashboard, summarize what it is showing in natural language.
6. If the page is a disclaimer / disclosures / appendix page, keep the narration very short.
7. Do not use markdown, bullets, numbering, labels, or code fences.
8. Keep flow natural across pages, like a human analyst presenting the report.
9. Do not hallucinate exact numbers unless they are clearly legible on the page.

Return ONLY valid JSON in this exact format:
{
  "scripts": [
    "page 1 narration",
    "page 2 narration"
  ]
}

The array length must be exactly ${pageCount}.`
});

for (let i = 0; i < images.length; i++) {
  const img = images[i];
  const base64 = String(img).replace(/^data:image\\/png;base64,/, "");

  parts.push({ text: `Page ${i + 1}` });
  parts.push({
    inline_data: {
      mime_type: "image/png",
      data: base64
    }
  });
}

const geminiBody = {
  contents: [{
    role: "user",
    parts
  }],
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 8192,
    responseMimeType: "application/json"
  }
};

return {
  json: {
    company_name: companyName,
    page_count: pageCount,
    images,
    geminiBody
  }
};
```

## 4. `Gemini: Vision Narration`

Use an HTTP Request node.

- Method: `POST`
- URL:

```text
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_GEMINI_KEY
```

- Header:

```text
Content-Type: application/json
```

- JSON body:

```javascript
={{ JSON.stringify($json.geminiBody) }}
```

Recommended timeout:

```text
120000
```

If your page count gets large and request size becomes too heavy, we can split pages into batches of 4-6 pages later.

## 5. `Code: Map Vision Scripts to Scenes`

Replace the old mapping node with this:

```javascript
// ============================================================
// STEP 2: Parse Gemini Vision output and map to scenes
// ============================================================

const prep = $("Code: Prepare Gemini Vision Prompt").first().json;
const images = prep.images || [];
const expectedCount = images.length;

if (!expectedCount) {
  throw new Error("No images available for scene mapping.");
}

const response = $input.first().json;
let rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
rawText = rawText.replace(/```json\\n?/g, "").replace(/```\\n?/g, "").trim();

let parsed;
try {
  parsed = JSON.parse(rawText);
} catch (e) {
  const objectMatch = rawText.match(/\\{[\\s\\S]*\\}/);
  if (!objectMatch) {
    throw new Error("Could not parse Gemini Vision response: " + rawText.slice(0, 300));
  }
  parsed = JSON.parse(objectMatch[0]);
}

let scripts = Array.isArray(parsed?.scripts) ? parsed.scripts : [];

function cleanTextForAudio(text) {
  if (!text) return "";

  let clean = String(text);

  clean = clean
    .replace(/[*_#`\\[\\]]/g, "")
    .replace(/\\s+/g, " ")
    .trim();

  clean = clean
    .replace(/\\bFY(\\d{2})\\b/gi, "Fiscal Year 20$1")
    .replace(/\\bQ(\\d)\\b/gi, "Quarter $1")
    .replace(/\\bYoY\\b/gi, "Year over Year")
    .replace(/\\bQoQ\\b/gi, "Quarter over Quarter")
    .replace(/\\bEBITDA\\b/gi, "Ebitda")
    .replace(/\\bCAGR\\b/gi, "C A G R")
    .replace(/\\bROE\\b/gi, "R O E")
    .replace(/\\bROCE\\b/gi, "R O C E")
    .replace(/\\bPAT\\b/gi, "P A T")
    .replace(/\\bP\\/E\\b/gi, "P E ratio")
    .replace(/₹/g, " rupees ")
    .replace(/Rs\\./gi, " rupees ")
    .replace(/\\$/g, " dollars ");

  return clean.trim();
}

while (scripts.length < expectedCount) {
  scripts.push("This page continues the report discussion.");
}

if (scripts.length > expectedCount) {
  scripts = scripts.slice(0, expectedCount);
}

const scenes = images.map((image, idx) => ({
  image,
  text: (cleanTextForAudio(scripts[idx]) || " ").slice(0, 1200)
}));

return { json: { scenes } };
```

## Why This Is Better

This approach:

- follows the actual rendered PDF
- adapts to variable page counts
- can narrate charts / layouts / disclaimer pages correctly
- removes the brittle 12-slide PPT assumption

## Important Caveat

If your PDF is very long, sending all page images in one Gemini request may become too large.

If that happens, the next improvement is:

- split images into batches of 4-6 pages
- call Gemini once per batch
- merge the `scripts` arrays before the final mapping step

For most normal report lengths, the single-call version is a good first step.
