import re

path = 'pipeline/renderer.py'
txt = open(path, encoding='utf-8').read()

NEW_CSS = '''\
BRAND_OVERRIDE_CSS = """
/* === Tikona brand + landscape 16:9 overrides === */
:root {
  --navy:       #1F4690;
  --navy-mid:   #3A5BA0;
  --gold:       #FFA500;
  --gold-light: #FFA500;
  --gold-pale:  #FFE5B4;
  --slate:      #3A5BA0;
  --text:       #000000;
  --text-light: #333333;
  --white:      #FFFFFF;
  --page-width: 338mm;
  --page-height: 190mm;
}
@page { size: 338mm 190mm; margin: 0; }

.page {
  width: var(--page-width) !important;
  min-height: var(--page-height) !important;
  height: var(--page-height) !important;
  padding: 10mm 12mm 14mm !important;
  overflow: hidden;
}

body { background: #e8ecf2; }

/* Header */
.report-header { padding: 6mm 0 4mm !important; border-bottom: 2px solid var(--navy) !important; }
.header-top { margin-bottom: 4mm !important; }
.firm-logo { background: var(--navy) !important; color: var(--white) !important; }
.firm-name { color: var(--navy) !important; }
.report-type-badge { background: var(--gold) !important; color: var(--text) !important; }
.company-name-hdr { color: var(--navy) !important; }
.rating-badge { background: var(--navy) !important; color: var(--white) !important; }
.sector-tag { color: var(--navy-mid) !important; }

/* Tagline */
.tagline-band { background: var(--navy) !important; color: var(--white) !important; }
.tagline-text { color: var(--white) !important; }

/* Thesis box -- navy bg, everything inside must be white */
.thesis-box {
  background: var(--navy) !important;
  color: var(--white) !important;
  border-left: 6px solid var(--gold) !important;
  border-radius: 4px;
  padding: 10px 14px;
}
.thesis-box * { color: var(--white) !important; }

/* Key sections -- light bg, dark text */
.key-section { background: transparent !important; color: var(--text) !important; }
.key-section p { color: var(--text) !important; }
.key-section-title, .section-title, .fin-table-title, .figure-title {
  color: var(--navy) !important;
}
.section-number { background: var(--gold) !important; color: var(--text) !important; }
.analysis-bold { color: var(--navy) !important; font-weight: 700; }

/* Metric strip -- gold-pale bg, each card white with dark text */
.metric-strip { background: var(--gold-pale) !important; border: 1px solid var(--gold) !important; }
.metric-card {
  background: var(--white) !important;
  border-right: 1px solid var(--gold) !important;
  color: var(--text) !important;
}
.metric-card-value { color: var(--navy) !important; font-weight: 700 !important; }
.metric-card-label { color: var(--navy-mid) !important; font-weight: 600 !important; }
.metric-card-sub   { color: var(--text-light) !important; }

/* Financial table */
.fin-table-wrap table thead th { background: var(--navy) !important; color: var(--white) !important; }
.fin-table-wrap .tbl-highlight { background: var(--gold-pale) !important; }
.fin-table-wrap .bold  { color: var(--navy) !important; font-weight: 700; }
.fin-table-wrap .green { color: var(--navy-mid) !important; font-weight: 600; }
.fin-table-wrap td, .fin-table-wrap th { color: var(--text) !important; }
.fin-table-wrap .tbl-highlight td { color: var(--navy) !important; }

/* Side panel -- navy bg, ALL text must be light */
.side-panel-card {
  background: var(--navy) !important;
  color: var(--white) !important;
  border-top: 4px solid var(--gold) !important;
}
.side-panel-card * { color: var(--white) !important; }
.side-panel-card .side-metric-value { font-size: 1.2em; font-weight: 700; }
.side-panel-card .side-metric-title,
.side-panel-card .side-section-hdr  { color: var(--gold-pale) !important; font-weight: 600; }
.side-panel-card .side-label        { color: var(--gold-pale) !important; opacity: 0.9; }
.side-panel-card .side-metric-sub   { color: var(--gold-pale) !important; }
.side-panel-card .side-divider      { background: var(--gold) !important; opacity: .5; }

/* Highlight boxes */
.highlight-box {
  background: var(--gold-pale) !important;
  border-left: 4px solid var(--gold) !important;
  color: var(--text) !important;
}
.highlight-box * { color: var(--text) !important; }
.highlight-box-title { color: var(--navy) !important; font-weight: 700; }

/* Page content default text colour (prevents dark-on-dark) */
.page-content, .main-col, .page { color: var(--text) !important; }

/* Two-col proportions for landscape */
.two-col { display: grid !important; grid-template-columns: 2.15fr 1fr !important; gap: 8mm !important; }

/* Section header */
.section-header { border-bottom: 2px solid var(--navy) !important; }

/* Footer */
.page-footer { border-top: 1px solid var(--navy) !important; }
.footer-left, .footer-center, .footer-right { color: var(--navy-mid) !important; }

/* Legend dots */
.legend-label { color: var(--text-light) !important; }
.legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }

/* Print */
@media print {
  body { background: var(--white); }
  .page { box-shadow: none !important; margin: 0 !important; }
}
"""'''

txt2 = re.sub(r'BRAND_OVERRIDE_CSS\s*=\s*""".*?"""', NEW_CSS, txt, flags=re.DOTALL)
if txt2 == txt:
    print('ERROR: pattern not found - nothing replaced')
else:
    open(path, 'w', encoding='utf-8').write(txt2)
    print(f'Patched successfully. Total lines: {len(txt2.splitlines())}')
