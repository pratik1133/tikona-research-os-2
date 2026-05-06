import re

path = 'pipeline/renderer.py'
txt = open(path, encoding='utf-8').read()

# The key insight: the reference CSS already has correct color relationships
# (white text on navy headers, etc). We should ONLY override the CSS custom
# properties to rebrand, and fix page dimensions. Don't override individual
# element colors or we break the contrast relationships.
NEW_CSS = '''\
BRAND_OVERRIDE_CSS = """
/* === Tikona brand: variable-only rebranding + landscape 16:9 === */

/* --- Rebrand via CSS custom properties only --- */
:root {
  --navy:       #1F4690;
  --navy-mid:   #2A4F85;
  --gold:       #FFA500;
  --gold-light: #FFB733;
  --gold-pale:  #FFE5B4;
  --slate:      #3A5BA0;
  --mid-grey:   #6b7c93;
  --light-grey: #f4f6f9;
  --border:     #d5dce8;
  --text:       #1a2537;
  --text-light: #4a5568;
  --green:      #1a7a4a;
  --red:        #b91c1c;
  --teal:       #0e7490;
  --white:      #ffffff;

  /* Landscape 16:9 widescreen */
  --page-width:  338mm;
  --page-height: 190mm;
}

/* --- Page dimensions for 16:9 landscape --- */
@page { size: 338mm 190mm; margin: 0; }

.page {
  width:  var(--page-width)  !important;
  min-height: var(--page-height) !important;
  max-height: var(--page-height) !important;
  padding: 8mm 10mm 12mm !important;
  overflow: visible !important;
  box-sizing: border-box !important;
}

/* --- Compact header for landscape (less vertical space) --- */
.report-header {
  padding: 4mm 8mm !important;
}
.header-top {
  margin-bottom: 2mm !important;
}
.company-name-hdr {
  font-size: 1.4em !important;
}
.report-date {
  margin-top: 1mm !important;
  font-size: 0.75em !important;
}

/* --- Tagline band --- */
.tagline-band {
  padding: 4mm 8mm !important;
  margin-bottom: 4mm !important;
}

/* --- Two-column layout for widescreen --- */
.two-col {
  display: grid !important;
  grid-template-columns: 2.2fr 1fr !important;
  gap: 6mm !important;
}

/* --- Compact content for landscape fit --- */
.key-section { margin-bottom: 3mm !important; }
.key-section p { font-size: 9pt !important; line-height: 1.45 !important; }
.thesis-box { padding: 6px 10px !important; margin-bottom: 4mm !important; }
.thesis-box p { font-size: 9pt !important; line-height: 1.45 !important; }

/* --- Financial tables: tighter for landscape --- */
.fin-table-wrap { margin-bottom: 4mm !important; }
.fin-table-wrap table { font-size: 8pt !important; }
.fin-table-wrap th, .fin-table-wrap td { padding: 3px 6px !important; }

/* --- Metric strip: compact --- */
.metric-strip { margin-bottom: 4mm !important; }
.metric-card { padding: 4px 8px !important; }
.metric-card-value { font-size: 1em !important; }
.metric-card-label { font-size: 0.7em !important; }

/* --- Side panel: compact --- */
.side-panel-card { padding: 6px 10px !important; }
.side-metric-value { font-size: 1.1em !important; }
.side-row { padding: 1px 0 !important; font-size: 0.8em !important; }

/* --- Section header: slimmer --- */
.section-header { margin-bottom: 3mm !important; padding-bottom: 2mm !important; }
.section-number { font-size: 0.8em !important; padding: 2px 6px !important; }
.section-title  { font-size: 1em !important; }

/* --- Highlight box --- */
.highlight-box { padding: 6px 10px !important; margin-bottom: 3mm !important; }

/* --- Charts: constrain height --- */
.figure { margin-bottom: 4mm !important; }
.figure svg { max-height: 150px !important; }

/* --- Footer: thin --- */
.page-footer { padding: 2mm 0 !important; font-size: 0.7em !important; }

/* --- Print --- */
@media print {
  body { background: white; }
  .page { box-shadow: none !important; margin: 0 !important; }
}
"""'''

txt2 = re.sub(r'BRAND_OVERRIDE_CSS\s*=\s*""".*?"""', NEW_CSS, txt, flags=re.DOTALL)
if txt2 == txt:
    print('ERROR: pattern not found - nothing replaced')
else:
    open(path, 'w', encoding='utf-8').write(txt2)
    print(f'Patched successfully. Total lines: {len(txt2.splitlines())}')
