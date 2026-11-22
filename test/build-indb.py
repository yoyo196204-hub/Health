# Builds indb.js, Indian recipes from the Indian Nutrient Databank (INDB; Vijayakumar, Jaacks et al., Current
# Developments in Nutrition 2024; github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-), 1,014 recipes from The Art
# & Science of Cooking, Basic Food Preparation and recipe websites, computed from ICMR-NIN IFCT 2017/2004 (then UK and
# USDA tables) with USDA retention factors.
#   git clone https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB- && python3 test/build-indb.py path/to/INDB.xlsx
# One recipe per line: code|name|serving as named|serving g|then per 100 g: kcal|protein|carbs|fat|fibre|free sugars.
# A serving's weight is the recipe's own serving (its per-serving energy over its per-100 g energy); a recipe with no
# serving is given per 100 g. Rows whose energy disagrees with their own macros (4/4/9, fibre 2) by over 30% are dropped.
# INDB counts all the oil a deep-fried recipe is cooked in as eaten (poori at 738 kcal and 78 g fat per 100 g, about
# twice what is absorbed), so recipes over 35 g fat per 100 g are left out, except dressings, which really are that fat.
# The app's own estimates cover the fried foods: poori, vada, samosa, pakoda, bhaji.
import json, os, re, sys
import pandas as pd
src = sys.argv[1] if len(sys.argv) > 1 else 'INDB.xlsx'
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'indb.js')
x = pd.read_excel(src)
rows, drop, seen = [], {'missing': 0, 'atwater': 0, 'dup': 0, 'frying oil': 0}, set()
num = lambda v: None if pd.isna(v) else float(v)
for _, r in x.iterrows():
    k, p, c, f, fb, sug = (num(r[c]) for c in ('energy_kcal', 'protein_g', 'carb_g', 'fat_g', 'fibre_g', 'freesugar_g'))
    if None in (k, p, c, f) or k <= 0 or k > 902: drop['missing'] += 1; continue
    fb = fb or 0
    if k > 30 and abs(4 * p + 4 * c + 9 * f + 2 * fb - k) / k > 0.3: drop['atwater'] += 1; continue
    name = re.sub(r'\s+', ' ', re.sub(r'[|\n\t]+', ' ', str(r['food_name']))).strip()[:70]
    if f > 35 and not re.search(r'mayonnaise|dressing|tartare', name, re.I): drop['frying oil'] += 1; continue
    if name.lower() in seen: drop['dup'] += 1; continue
    seen.add(name.lower())
    unit, uk = r['servings_unit'], num(r['unit_serving_energy_kcal'])
    # A serving as INDB gives it, when it is one portion: not a jar or a dish of preserves, and 10 to 500 g.
    whole = isinstance(unit, str) and re.search(r'jar|pint|bottle|litre|liter|dish|kg', unit, re.I)
    g = round(uk / k * 100) if isinstance(unit, str) and uk and not whole and 10 <= uk / k * 100 <= 500 else None
    label = f'1 {unit.strip()} ({g} g)' if g else '100 g'
    v = lambda y: '' if y is None else '%g' % round(y, 1)
    rows.append('|'.join([str(r['food_code']), name, label, str(g or 100), v(k), v(p), v(c), v(f), v(fb), v(sug)]))
head = """'use strict';
// Indian recipes from the Indian Nutrient Databank (INDB): Vijayakumar A, Jaacks LM et al., Curr Dev Nutr 2024;
// https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB- (see licenses/INDB.txt). Values computed from ICMR-NIN
// IFCT 2017/2004. One recipe per line: code|name|serving as named|serving g|then per 100 g: kcal|protein|carbs|fat|fibre|sugars.
// Built by test/build-indb.py; loaded only when food search needs it.
"""
open(out, 'w', encoding='utf-8').write(head + 'self.INDBD = ' + json.dumps('\n'.join(rows), ensure_ascii=False) + ";\n(self.LOADED ||= []).push('indb.js');\n")
print(len(rows), 'recipes', drop, os.path.getsize(out), 'bytes')
