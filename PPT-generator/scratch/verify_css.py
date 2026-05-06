import re, sys
sys.stdout.reconfigure(encoding='utf-8')

h = open('out/reliance_v5_fixed.html', encoding='utf-8').read()
css_m = re.search(r'<style>(.*?)</style>', h, re.S)
css = css_m.group(1) if css_m else ''

print('=== Brand Override Check ===')
print('Has Tikona brand override:', 'Tikona brand' in css)
print('Has --navy: #1F4690:', '#1F4690' in css)
print('Has --gold: #FFA500:', '#FFA500' in css)  
print('Has 338mm page:', '338mm' in css)
print('Has overflow: visible:', 'overflow: visible' in css)
print()

# The old buggy overrides should be GONE
brand_section = css.split('Tikona brand')[-1] if 'Tikona brand' in css else ''
bad_patterns = [
    '.company-name-hdr { color: var(--navy)',
    '.firm-name { color: var(--navy)',
    '.firm-logo { background: var(--navy)',
]
print('=== Old buggy overrides removed? ===')
for p in bad_patterns:
    found = p in brand_section
    status = 'STILL PRESENT - BAD' if found else 'GONE - GOOD'
    print(f'  {p[:50]}... : {status}')

print()
print('=== Reference CSS color relationships (should be intact) ===')
ref_section = css.split('Tikona brand')[0] if 'Tikona brand' in css else css
checks = [
    ('.report-header', 'background'),
    ('.company-name-hdr', 'color'),
    ('.firm-name', 'color'),
    ('.rating-badge', 'color'),
    ('.tagline-text', 'color'),
    ('.thesis-box', 'background'),
    ('.metric-card', 'background'),
]
for sel, prop in checks:
    pattern = re.escape(sel) + r'[^{]*\{[^}]*' + prop + r'\s*:\s*([^;]+)'
    m = re.search(pattern, ref_section)
    if m:
        print(f'  {sel} {{ {prop}: {m.group(1).strip()} }}')
    else:
        print(f'  {sel} {{ {prop}: not found }}')
