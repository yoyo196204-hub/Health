# Builds whole.js, everyday whole foods from the OpenNutrition dataset (https://www.opennutrition.app, ODbL).
#   curl -LO https://downloads.opennutrition.app/opennutrition-dataset-2025.1.zip && unzip it, then
#   python3 test/build-whole.py path/to/opennutrition_foods.tsv
# Only "everyday" foods whose numbers trace to a national food table (USDA, Canadian Nutrient File, Australian
# Nutrient Database, Frida) are kept. OpenNutrition's prepared and restaurant foods, and everyday foods without a
# source, are left out: they carry no reference, and Health never guesses a food's numbers. Its barcoded grocery
# items are left out too: they are North American, and the scanner's list (products.js) covers India.
# Panels whose energy disagrees with their own macros (4/4/9, fibre 2) by more than 30% are dropped.
import csv, json, os, re, sys
csv.field_size_limit(10**9)
src = sys.argv[1] if len(sys.argv) > 1 else 'opennutrition_foods.tsv'
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'whole.js')
DB = {'USDA Standard Reference, Legacy': 'USDA', 'USDA Foundational Foods': 'USDA', 'USDA Survey (FNDDS)': 'USDA', 'Canadian Nutrient File': 'CNF',
      'Australian Nutrient Database': 'AUSNUT', 'Frida': 'Frida'}
FR = {0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔'}
rows, seen, drop = [], set(), {'nosrc': 0, 'atwater': 0, 'missing': 0, 'dup': 0}
for r in csv.DictReader(open(src, encoding='utf-8'), delimiter='\t'):
    if r['type'] != 'everyday': continue
    s = json.loads(r['source'] or '[]'); dbs = sorted({DB.get(x.get('database'), x.get('database')) for x in s if x.get('database')})
    if not dbs: drop['nosrc'] += 1; continue
    N = json.loads(r['nutrition_100g'] or '{}')
    k, p, c, f, fb, sug = (N.get(x) for x in ('calories', 'protein', 'carbohydrates', 'total_fat', 'dietary_fiber', 'total_sugars'))
    if None in (k, p, c, f) or k < 0 or k > 902: drop['missing'] += 1; continue
    est = 4 * p + 4 * (c - (fb or 0)) + 9 * f + 2 * (fb or 0)
    if (k > 30 and abs(est - k) / k > 0.3 and abs(4 * p + 4 * c + 9 * f - k) / k > 0.3) or (k <= 30 and abs(est - k) > 12): drop['atwater'] += 1; continue
    name = re.sub(r'[|\n\t]+', ' ', r['name']).strip()[:70]
    if name.lower() in seen: drop['dup'] += 1; continue
    seen.add(name.lower())
    sv = json.loads(r['serving'] or '{}'); g = (sv.get('metric') or {}).get('quantity'); cm = sv.get('common') or {}
    unit = (sv.get('metric') or {}).get('unit') or 'g'
    if not g or g < 1 or g > 2000: g, label = 100, f'100 {unit}'
    else:
        q = cm.get('quantity'); u = cm.get('unit') or ''
        qs = FR.get(round(q, 2), ('%g' % round(q, 2)) if q else '') if q else ''
        label = f'{qs} {u} ({round(g)} {unit})'.strip() if u and u not in ('g', 'ml') else f'{round(g)} {unit}'
    # The carbs are OpenNutrition's total carbohydrate; Health counts available carbs, so fibre comes off.
    ca = max(0, c - (fb or 0)) if 'USDA' in dbs or 'CNF' in dbs else c
    # The same check the tests make, on the numbers as stored.
    if k > 30 and abs(4 * p + 4 * ca + 9 * f + 2 * (fb or 0) - k) / k > 0.3: drop['atwater'] += 1; continue
    v = lambda x: '' if x is None else '%g' % round(x, 1)
    rows.append('|'.join([r['id'][3:], name, label, '%g' % round(g, 1), v(k), v(p), v(ca), v(f), v(fb), v(sug), ','.join(dbs)]))
print(len(rows), drop)
body = '\n'.join(rows)
open(out, 'w').write("'use strict';\n// Everyday whole foods from OpenNutrition (https://www.opennutrition.app, ODbL; see licenses/OpenNutrition-ODbL.txt), each traced\n// to a national food table. One food per line: id|name|serving as named|serving g|then per 100 g: kcal|protein|available carbs|fat|fibre|sugars|tables.\n// Built by test/build-whole.py; loaded only when food search needs it.\nself.ONDB = " + json.dumps(body, ensure_ascii=False) + ";\n(self.LOADED ||= []).push('whole.js');\n")
print(os.path.getsize(out))
