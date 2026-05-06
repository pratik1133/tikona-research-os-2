import json, sys
sys.stdout.reconfigure(encoding='utf-8')
from pipeline.data_loader import load_company_pack
from pipeline.renderer import load_reference_css, render_document
from pipeline.schemas import PageContent

pack = load_company_pack('reliance_data.json', 'reliance_model.csv')
css = load_reference_css('gravita_india_tikona_capital.html')
raw = json.load(open('scratch/pipeline_artifacts/pages.json', encoding='utf-8'))
pages = [PageContent.model_validate(p) for p in raw]
html = render_document(pages, pack, css)
open('out/reliance_v5_fixed.html','w',encoding='utf-8').write(html)
print(f'Done: {len(html):,} chars, {len(pages)} pages')
