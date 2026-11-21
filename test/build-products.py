# Builds products.js, the scanner's offline list of packaged foods, from Open Food Facts.
#   pip install duckdb && python3 test/build-products.py
# Reads only the needed columns of the Open Food Facts Parquet export on Hugging Face (about 7.7 GB in all, a few
# hundred MB actually fetched), keeps every product sold in India (or with an Indian 890 barcode) plus the products
# scanned 40+ times anywhere, and drops panels that cannot be right: no energy or protein, a macro over 100 g per 100 g,
# or energy that disagrees with its own macros (4/4/9, fibre 2) by more than 35%. Sugars above the carbs and salt
# above 40 g are dropped as typos. Takes about five minutes.
import os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join('..', 'products.js')
import duckdb, json, time
t=time.time()
c=duckdb.connect(); c.execute('INSTALL httpfs; LOAD httpfs; SET http_timeout=600000; SET http_retries=10;')
u='https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet'
q=f"""
COPY (
SELECT code, product_name, brands, quantity, serving_size, serving_quantity, nova_group, nutriscore_grade, countries_tags, unique_scans_n,
  list_filter(nutriments, lambda x: x.name IN ('energy-kcal','energy','proteins','carbohydrates','fat','fiber','sugars','salt','saturated-fat','sodium')) AS nut
FROM read_parquet('{u}')
WHERE (list_contains(countries_tags,'en:india') OR code LIKE '890%' OR coalesce(unique_scans_n,0) >= 40)
  AND NOT coalesce(no_nutrition_data,false) AND NOT coalesce(obsolete,false)
) TO '/tmp/off_sub.parquet' (FORMAT parquet)
"""
c.execute(q)
print('rows', c.execute("select count(*) from '/tmp/off_sub.parquet'").fetchone(), 'secs', time.time()-t)
import re, json
c=duckdb.connect()
rows=c.execute("select code, product_name, brands, quantity, serving_size, serving_quantity, nova_group, nutriscore_grade, nut, list_contains(countries_tags,'en:india') ind, coalesce(unique_scans_n,0) sc from '/tmp/off_sub.parquet'").fetchall()
def pick(names):
    if not names: return ''
    d={n['lang']:(n['text'] or '').strip() for n in names}
    for l in ('en','main'):
        if d.get(l): return d[l]
    return next((v for v in d.values() if v),'')
def clean(s,n): return re.sub(r'[|\n\r\t]+',' ',s or '').strip()[:n]
out={}; skipped={'noname':0,'nokcal':0,'atwater':0,'code':0}
for code,pn,br,qty,ss,sq,nova,ns,nut,ind,sc in rows:
    if not code or not re.fullmatch(r'\d{8,14}',code): skipped['code']+=1; continue
    name=clean(pick(pn),70)
    if not name: skipped['noname']+=1; continue
    N={x['name']:x['100g'] for x in (nut or []) if x['100g'] is not None}
    k=N.get('energy-kcal')
    if k is None and N.get('energy') is not None: k=N['energy']/4.184
    if k is None or k<0 or k>950: skipped['nokcal']+=1; continue
    p=N.get('proteins'); cb=N.get('carbohydrates'); f=N.get('fat'); fb=N.get('fiber')
    if p is None: skipped['nokcal']+=1; continue
    if any(v is not None and (v<0 or v>100) for v in (p,cb,f,fb)): skipped['atwater']+=1; continue
    if cb is not None and f is not None:
        est=4*p+4*cb+9*f+2*(fb or 0)
        if k>20 and abs(est-k)/k>0.35: skipped['atwater']+=1; continue
        if k<=20 and abs(est-k)>15: skipped['atwater']+=1; continue
    sug=N.get('sugars'); salt=N.get('salt')
    if sug is not None and (sug<0 or sug>100 or (cb is not None and sug>cb+0.5)): sug=None
    if salt is not None and (salt<0 or salt>40): salt=None
    brand=clean((br or '').split(',')[0],30)
    try: sg=float(sq) if sq not in (None,'') else None
    except: sg=None
    if sg is not None and not (1<=sg<=2000): sg=None
    r=lambda v: '' if v is None else ('%g'%round(v,1))
    rec=[code,name,brand,clean(qty,20),clean(ss,24),'' if sg is None else '%g'%round(sg,1),r(k),r(p),r(cb),r(f),r(fb),r(sug),r(salt),str(nova or ''),(ns or '') if ns in list('abcde') else '']
    old=out.get(code)
    out[code]=rec
print(len(out), skipped)
# Indian products first, then the rest: the file is one string, one product per line.
lines=['|'.join(v) for v in out.values()]
body='\n'.join(lines)
js="'use strict';\n// Packaged foods for the scanner, from Open Food Facts (ODbL; see licenses/OpenFoodFacts-ODbL.txt).\n// Every product sold in India with a nutrition panel, plus the most-scanned products worldwide. One product per line:\n// barcode|name|brand|pack size|serving as printed|serving g|kcal|protein|carbs|fat|fibre|sugars|salt|NOVA group|Nutri-Score, per 100 g or ml.\n// Panels whose energy disagrees with their own macros by more than 35% were left out. Built by test/build-products.py.\nself.OFFDB = "+json.dumps(body)+";\n(self.LOADED ||= []).push('products.js');\n"
open(OUT,'w').write(js)
import os; print(os.path.getsize(OUT))
