// Built for one person. Change these in Me > Settings, not here.
const ME = { sex: 'm', dob: '1999-12-18', h: 183, w0: 94.5, waist0: 110, days: 3, equip: 'gym', shoulder: true };

const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snack', 'Snacks'], ['dinner', 'Dinner']];
const CATS = [['usual', 'Usual'], ['thali', 'Thali'], ['roti', 'Poli & bhaat'], ['dal', 'Dal & usal'], ['bhaji', 'Bhaji'], ['protein', 'Protein'],
  ['nashta', 'Nashta'], ['snack', 'Snacks'], ['sweet', 'God'], ['drink', 'Drinks'], ['fruit', 'Fruit'], ['kerala', 'Kerala'], ['nonveg', 'Egg & non-veg'], ['mine', 'Mine']];

// [id, name, household unit, kcal, protein, carbs, fat, fibre, category]
// Raw ingredients follow IFCT 2017 (ICMR-NIN). Cooked dishes are estimates from
// typical home recipes; oil and portion size move them by about 20%.
const FOODS = [
  ['chapati', 'Chapati / poli', '1 medium', 100, 3, 20, 1, 3, 'roti'],
  ['chapati_ghee', 'Chapati with tup', '1 medium', 125, 3, 20, 4, 3, 'roti'],
  ['bhakri_jowar', 'Jwarichi bhakri', '1 medium', 175, 5, 36, 1, 5, 'roti'],
  ['bhakri_bajra', 'Bajrichi bhakri', '1 medium', 180, 5.5, 31, 2.5, 5.5, 'roti'],
  ['bhakri_rice', 'Tandlachi bhakri', '1 medium', 170, 3, 37, 0.5, 1, 'roti'],
  ['thalipeeth', 'Thalipeeth', '1', 200, 6, 28, 7, 5, 'roti'],
  ['paratha', 'Paratha, plain', '1', 180, 4, 26, 7, 3, 'roti'],
  ['aloo_paratha', 'Aloo paratha', '1', 250, 5, 36, 9, 4, 'roti'],
  ['puran_poli', 'Puran poli', '1', 290, 6, 50, 8, 4, 'roti'],
  ['pav', 'Pav', '1', 110, 3.5, 21, 1.5, 1, 'roti'],
  ['rice', 'Bhaat (rice)', '1 katori', 195, 4, 43, 0.5, 0.5, 'roti'],
  ['masale_bhaat', 'Masale bhaat', '1 plate', 330, 7, 52, 10, 4, 'roti'],
  ['khichdi', 'Dal khichdi', '1 plate', 300, 11, 48, 7, 5, 'roti'],
  ['ghee', 'Tup / oil', '1 tsp', 45, 0, 0, 5, 0, 'roti'],

  ['varan', 'Varan', '1 katori', 120, 7, 17, 3, 3, 'dal'],
  ['amti', 'Amti', '1 katori', 130, 6, 18, 4, 3, 'dal'],
  ['dal_tadka', 'Dal tadka', '1 katori', 160, 8, 19, 6, 4, 'dal'],
  ['usal', 'Matki usal', '1 katori', 170, 10, 22, 5, 6, 'dal'],
  ['moong', 'Moogachi usal', '1 katori', 160, 10, 20, 4.5, 6, 'dal'],
  ['chavli', 'Chavli / vatana usal', '1 katori', 180, 10, 24, 5, 7, 'dal'],
  ['chole', 'Chole / rajma', '1 katori', 200, 10, 27, 6, 8, 'dal'],
  ['sprouts', 'Mod aleli matki, vafavleli', '1 katori', 100, 7, 15, 0.5, 5, 'dal'],
  ['pithla', 'Pithla', '1 katori', 180, 8, 18, 8, 4, 'dal'],
  ['zunka', 'Zunka', '1 katori', 220, 10, 20, 11, 5, 'dal'],
  ['kadhi', 'Kadhi', '1 katori', 110, 4, 9, 6, 0.5, 'dal'],

  ['bhaji', 'Suki bhaji (bhendi, kobi, gavar)', '1 katori', 110, 3, 10, 7, 4, 'bhaji'],
  ['palebhaji', 'Palebhaji (methi, palak)', '1 katori', 100, 4, 8, 6, 4, 'bhaji'],
  ['rassa', 'Rassa bhaji (flower-batata)', '1 katori', 140, 3, 14, 8, 4, 'bhaji'],
  ['batata', 'Batata bhaji', '1 katori', 160, 3, 22, 7, 3, 'bhaji'],
  ['vangi', 'Bharli vangi', '1 katori', 200, 4, 12, 15, 5, 'bhaji'],
  ['paneer_bhaji', 'Paneer bhaji', '1 katori', 280, 15, 8, 21, 2, 'bhaji'],
  ['soya_bhaji', 'Soya chunks bhaji', '1 katori', 190, 17, 13, 8, 5, 'bhaji'],
  ['koshimbir', 'Koshimbir', '1 katori', 60, 2, 6, 3, 2, 'bhaji'],
  ['salad', 'Kakdi / tomato / gajar', '1 katori', 25, 1, 5, 0, 2, 'bhaji'],
  ['thecha', 'Thecha', '1 tsp', 25, 0.5, 1, 2, 0.5, 'bhaji'],
  ['shengdana', 'Shengdana chutney', '1 tbsp', 60, 2.5, 2, 5, 1, 'bhaji'],

  ['whey', 'Whey protein', '1 scoop (30 g)', 120, 24, 3, 1.5, 0, 'protein'],
  ['soya', 'Soya chunks', '50 g dry', 172, 26, 16.5, 0.5, 6.5, 'protein'],
  ['paneer', 'Paneer', '100 g', 290, 18, 4, 22, 0, 'protein'],
  ['paneer_bhurji', 'Paneer bhurji', '1 katori', 260, 16, 6, 19, 1, 'protein'],
  ['tofu', 'Tofu', '100 g', 130, 14, 3, 7, 1, 'protein'],
  ['curd', 'Dahi', '1 katori', 90, 5, 7, 4.5, 0, 'protein'],
  ['greek', 'Chakka / Greek yogurt', '100 g', 95, 8, 5, 4.5, 0, 'protein'],
  ['taak', 'Taak', '1 glass', 40, 2.5, 4, 1.5, 0, 'protein'],
  ['milk', 'Milk, toned', '1 glass (250 ml)', 150, 8, 12, 7.5, 0, 'protein'],
  ['chilla', 'Dhirde / besan chilla', '2', 220, 11, 26, 8, 5, 'protein'],
  ['chana', 'Futane (roasted chana)', '30 g, a handful', 110, 6.5, 17, 2, 5, 'protein'],
  ['peanuts', 'Shengdane (peanuts)', '30 g, a handful', 170, 7.5, 5, 14, 2.5, 'protein'],

  ['poha', 'Kande pohe', '1 plate', 270, 6, 45, 8, 3, 'nashta'],
  ['dadpe', 'Dadpe pohe', '1 plate', 220, 5, 34, 8, 3, 'nashta'],
  ['upma', 'Upma / sanja', '1 plate', 250, 6, 38, 8, 3, 'nashta'],
  ['oats', 'Oats, plain', '40 g dry', 155, 5, 27, 3, 4, 'nashta'],
  ['misal', 'Misal pav', '1 plate, 2 pav', 480, 17, 60, 19, 9, 'nashta'],
  ['sabudana', 'Sabudana khichdi', '1 plate', 450, 6, 65, 18, 2, 'nashta'],
  ['sabudana_vada', 'Sabudana vada', '2', 300, 4, 40, 14, 2, 'nashta'],
  ['ghavan', 'Ghavan', '2', 180, 3, 34, 3, 1, 'nashta'],
  ['idli', 'Idli', '2', 120, 4, 25, 0.5, 1.5, 'nashta'],
  ['dosa', 'Dosa, plain', '1', 135, 3, 22, 4, 1, 'nashta'],
  ['bread', 'Bread', '2 slices', 140, 5, 26, 1.5, 2, 'nashta'],

  ['vadapav', 'Vada pav', '1', 300, 6, 40, 13, 3, 'snack'],
  ['batata_vada', 'Batata vada', '1', 190, 3, 20, 11, 2, 'snack'],
  ['samosa', 'Samosa', '1', 260, 4, 30, 14, 2, 'snack'],
  ['pav_bhaji', 'Pav bhaji', '1 plate, 2 pav', 600, 14, 80, 24, 9, 'snack'],
  ['bhel', 'Bhel', '1 plate', 280, 7, 45, 8, 5, 'snack'],
  ['chivda', 'Chivda', '1 katori', 200, 4, 22, 11, 2, 'snack'],
  ['farsan', 'Farsan / shev', '30 g, a handful', 165, 4, 13, 11, 2, 'snack'],
  ['kothimbir', 'Kothimbir vadi', '3 pieces', 180, 6, 18, 9, 3, 'snack'],
  ['chikki', 'Shengdana chikki', '1 piece', 130, 3.5, 13, 7, 1, 'snack'],
  ['biscuit', 'Biscuits (Parle-G / Marie)', '4', 100, 1.5, 17, 3, 0.5, 'snack'],
  ['maggi', 'Maggi', '1 packet', 310, 7, 45, 12, 2, 'snack'],
  ['veg_biryani', 'Veg biryani / pulao', '1 plate', 450, 10, 65, 16, 5, 'snack'],
  ['pizza', 'Pizza', '2 slices', 520, 22, 60, 20, 4, 'snack'],
  ['out', 'Hotel meal, rough guess', '1 meal', 750, 20, 85, 35, 5, 'snack'],

  ['sheera', 'Sheera', '1 katori', 280, 3, 40, 12, 1, 'sweet'],
  ['shrikhand', 'Shrikhand', '1 katori', 260, 6, 42, 8, 0, 'sweet'],
  ['ladoo', 'Besan ladoo', '1', 180, 3.5, 22, 9, 1, 'sweet'],
  ['gulab_jamun', 'Gulab jamun', '1', 150, 2, 22, 6, 0, 'sweet'],
  ['ice_cream', 'Ice cream', '1 cup', 140, 2.5, 17, 7, 0, 'sweet'],
  ['sugar', 'Sakhar / gul', '1 tsp', 20, 0, 5, 0, 0, 'sweet'],

  ['chai', 'Chaha with sugar', '1 cup', 70, 2, 10, 2.5, 0, 'drink'],
  ['coffee', 'Coffee, milk and sugar', '1 cup', 70, 2, 10, 2.5, 0, 'drink'],
  ['black_coffee', 'Black coffee, no sugar', '1 cup', 2, 0, 0, 0, 0, 'drink'],
  ['solkadhi', 'Sol kadhi', '1 glass', 80, 1, 6, 6, 0, 'drink'],
  ['lassi', 'Lassi, sweet', '1 glass', 180, 6, 28, 5, 0, 'drink'],
  ['usacha_ras', 'Usacha ras', '1 glass', 180, 0, 45, 0, 0, 'drink'],
  ['nimbu', 'Limbu sarbat', '1 glass', 50, 0, 13, 0, 0, 'drink'],
  ['colddrink', 'Cold drink / packaged juice', '250 ml', 105, 0, 27, 0, 0, 'drink'],
  ['coconut_water', 'Shahalyache pani', '1 glass', 45, 0.5, 10, 0, 0, 'drink'],

  ['banana', 'Keli (banana)', '1 medium', 105, 1.5, 27, 0.5, 3, 'fruit'],
  ['apple', 'Apple', '1 medium', 95, 0.5, 25, 0.5, 4, 'fruit'],
  ['guava', 'Peru (guava)', '1 medium', 70, 2.5, 14, 1, 5, 'fruit'],
  ['orange', 'Santra / mosambi', '1', 60, 1, 15, 0, 3, 'fruit'],
  ['papaya', 'Papai', '1 katori', 60, 1, 15, 0, 2.5, 'fruit'],
  ['mango', 'Amba', '1 medium', 150, 1.5, 37, 0.5, 4, 'fruit'],
  ['dates', 'Khajur', '2', 55, 0.5, 15, 0, 1.5, 'fruit'],

  ['matta_rice', 'Matta rice', '1 katori', 190, 4, 41, 0.5, 1.5, 'kerala'],
  ['sambar', 'Sambar', '1 katori', 100, 5, 14, 3, 3, 'kerala'],
  ['kadala', 'Kadala curry', '1 katori', 200, 9, 22, 8, 7, 'kerala'],
  ['avial', 'Avial', '1 katori', 150, 3, 12, 10, 4, 'kerala'],
  ['thoran', 'Thoran', '1 katori', 110, 3, 9, 7, 4, 'kerala'],
  ['moru', 'Moru curry', '1 katori', 90, 3, 5, 6, 0, 'kerala'],
  ['appam', 'Appam', '1', 120, 2, 24, 1.5, 1, 'kerala'],
  ['puttu', 'Puttu', '1 piece', 250, 4, 42, 7, 3, 'kerala'],
  ['parotta', 'Kerala parotta', '1', 300, 6, 40, 13, 1.5, 'kerala'],

  ['egg', 'Egg, boiled', '1', 75, 6.5, 0.5, 5, 0, 'nonveg'],
  ['omelette', 'Omelette', '2 eggs', 190, 13, 1, 15, 0, 'nonveg'],
  ['chicken', 'Chicken rassa', '1 katori', 240, 22, 5, 15, 1, 'nonveg'],
  ['chicken_breast', 'Chicken breast, cooked', '100 g', 165, 31, 0, 3.5, 0, 'nonveg'],
  ['fish', 'Fish curry', '1 katori', 200, 20, 4, 12, 0.5, 'nonveg'],
  ['biryani', 'Chicken biryani', '1 plate', 550, 25, 65, 20, 3, 'nonveg'],
];

// One tap logs the whole plate; adjust the pieces afterwards.
const THALI = [
  ['Poli-bhaji thali', [['chapati', 2], ['bhaji', 1], ['varan', 1], ['curd', 1]]],
  ['Usal thali', [['chapati', 2], ['usal', 1], ['koshimbir', 1], ['taak', 1]]],
  ['Pithla-bhakri', [['bhakri_jowar', 1], ['pithla', 1], ['thecha', 1], ['taak', 1]]],
  ['Varan-bhaat', [['rice', 1], ['varan', 1], ['ghee', 1]]],
  ['Whey and banana', [['whey', 1], ['banana', 1]]],
  ['Kerala meals', [['matta_rice', 1.5], ['sambar', 1], ['thoran', 1], ['moru', 1]]],
];

const USUAL = {
  breakfast: ['whey', 'poha', 'oats', 'upma', 'banana', 'chai', 'milk'],
  lunch: ['chapati', 'bhaji', 'varan', 'usal', 'curd', 'rice', 'koshimbir', 'taak'],
  snack: ['chana', 'taak', 'chai', 'peanuts', 'guava', 'whey', 'biscuit'],
  dinner: ['chapati', 'bhaji', 'varan', 'usal', 'curd', 'bhakri_jowar', 'pithla', 'soya_bhaji'],
};
// Veg protein the coach reaches for, in the order it suggests them.
const GAP = ['whey', 'usal', 'curd', 'soya_bhaji', 'greek', 'chana', 'taak'];

// [gym exercise, dumbbell-at-home exercise, sets, reps, note]
const PLAN = {
  A: [
    ['Leg press', 'Goblet squat', 3, '8–12', ''],
    ['DB bench press, neutral grip', 'DB floor press, neutral grip', 3, '8–12', 'Elbows about 45° from the body'],
    ['Seated cable row', 'One-arm DB row', 3, '8–12', ''],
    ['Romanian deadlift', 'DB Romanian deadlift', 3, '8–12', ''],
    ['Cable face pull', 'Band face pull', 2, '12–15', ''],
    ['Plank', 'Plank', 3, '30–60', 'Log seconds as reps'],
  ],
  B: [
    ['DB split squat', 'DB split squat', 3, '8–12', 'Each side'],
    ['Lat pulldown, neutral grip', 'Band pulldown', 3, '8–12', 'To the front only'],
    ['Incline DB press, 30°', 'Push-up', 3, '8–12', ''],
    ['Hip thrust', 'Glute bridge with DB', 3, '10–15', ''],
    ['DB lateral raise, scapular plane', 'DB lateral raise, scapular plane', 2, '12–15', 'Light; stop at shoulder height'],
    ['Dead bug', 'Dead bug', 3, '8–10', 'Each side'],
  ],
  C: [
    ['Hack squat', 'Goblet squat, slow lowering', 3, '10–15', ''],
    ['Landmine press', 'Half-kneeling one-arm DB press', 3, '8–12', 'Up and slightly forward'],
    ['Chest-supported row', 'Chest-supported DB row', 3, '8–12', ''],
    ['Leg curl', 'DB leg curl', 3, '10–15', ''],
    ['DB curl', 'DB curl', 2, '10–15', ''],
    ['Triceps pushdown', 'DB kickback', 2, '10–15', ''],
  ],
};
const PREHAB = ['Cross-body stretch, 3 × 30 s', 'Sleeper stretch, 3 × 30 s, gentle', 'Band external rotation, 2 × 15', 'Band pull-apart, 2 × 15', 'Wall slides, 2 × 10'];

// The reasoning behind every number. g = what kind of evidence it rests on.
const EVID = {
  kcal: { t: 'Calorie target', g: 'Equation validated in 498 adults, then your own data',
    b: T => `Resting energy by Mifflin-St Jeor: <b>${Math.round(T.bmr)} kcal</b>. Daily burn, ${T.measured ? 'measured from your logs' : 'estimated from steps and training'}: <b>${Math.round(T.tdee)} kcal</b>. Less a deficit of <b>${Math.round(T.deficit)} kcal</b> gives <b>${T.kcal} kcal</b>.<br><br>The equation misses by 10–15% in individuals. After 10 logged days and 2 weeks of weigh-ins the app drops it and back-calculates your burn from what you ate and how your weight moved${T.measured ? '' : ` (${T.loggedDays} of 10 days so far)`}.`,
    s: ['Mifflin MD, et al. Am J Clin Nutr. 1990;51:241–7', 'Hall KD, et al. Lancet. 2011;378:826–37'] },
  rate: { t: 'Why 0.6% a week', g: 'Randomised trial, 24 athletes',
    b: () => 'Losing 0.7% of body weight a week while lifting preserved and slightly increased lean mass. Losing 1.4% a week did not. The slower group also gained more strength. For you that is roughly 0.5–0.6 kg a week. If the trend drops faster than 1% a week, the app tells you to eat more.',
    s: ['Garthe I, et al. Int J Sport Nutr Exerc Metab. 2011;21:97–104', 'Cava E, et al. Adv Nutr. 2017;8:511–9'] },
  protein: { t: 'Protein target', g: 'Meta-analysis, 49 trials, 1,863 people',
    b: T => `Muscle gain from resistance training stops improving above about 1.6 g of protein per kg a day. Fat mass does not need protein, so the app uses an adjusted weight of ${Math.round(T.adj)} kg: 1.6 × ${Math.round(T.adj)} ≈ <b>${T.protein} g</b>. In a deficit, higher protein plus lifting kept more lean mass in a controlled trial.<br><br>Two plates of poli, bhaji and varan give about 30–40 g. That gap is why whey, soya, usal and dahi carry this plan.`,
    s: ['Morton RW, et al. Br J Sports Med. 2018;52:376–84', 'Longland TM, et al. Am J Clin Nutr. 2016;103:738–46'] },
  fibre: { t: 'Fibre', g: 'ICMR-NIN recommendation',
    b: () => 'ICMR-NIN sets fibre at 15 g per 1,000 kcal, about 30 g a day. Bhakri, usal, palebhaji and fruit get you there; maida and polished rice do not. Fibre and protein are also what keep you full on fewer calories.',
    s: ['ICMR-NIN. Nutrient Requirements for Indians, 2020', 'ICMR-NIN. Dietary Guidelines for Indians, 2024'] },
  waist: { t: 'Waist matters more than BMI', g: 'Indian consensus statement; meta-analysis of 31 studies',
    b: () => 'At the same BMI, Asian Indians carry more body fat, and more of it around the abdomen, than Europeans. The Indian cut-offs are therefore lower: BMI 23 overweight, 25 obese; waist 90 cm for men, 80 cm for women. Across populations, a waist above half your height predicted diabetes and cardiovascular risk better than BMI did.',
    s: ['Misra A, et al. J Assoc Physicians India. 2009;57:163–70', 'WHO Expert Consultation. Lancet. 2004;363:157–63', 'Ashwell M, et al. Obes Rev. 2012;13:275–86'] },
  steps: { t: 'Step goal', g: 'Meta-analysis, 15 cohorts, 47,471 adults',
    b: T => `Mortality fell steadily with more daily steps and levelled off around 8,000–10,000 in adults under 60. Your goal sits 1,000 above your recent average and climbs to 8,000. Today it is <b>${T.stepGoal}</b>.`,
    s: ['Paluch AE, et al. Lancet Public Health. 2022;7:e219–28'] },
  sleep: { t: 'Sleep', g: 'Crossover trial, 10 adults: small, direction consistent',
    b: () => 'On an identical calorie deficit, 5.5 hours in bed instead of 8.5 cut the share of weight lost as fat by 55% and raised hunger. The lost weight came from lean mass instead. Residency will limit sleep; a fixed wake time is the part you can control.',
    s: ['Nedeltcheva AV, et al. Ann Intern Med. 2010;153:435–41'] },
  lift: { t: 'Training plan', g: 'Two meta-analyses',
    b: () => 'Muscle growth rises with weekly sets per muscle, and training a muscle at least twice a week beats once. Three full-body days give each major muscle about 9 hard sets across three sessions. Stop 1–3 reps short of failure; add weight when every set reaches the top of the range.<br><br>Pressing is neutral-grip or in the scapular plane, and there is no behind-the-neck work, upright row or dip, to keep a tight posterior capsule and a type II acromion out of trouble.',
    s: ['Schoenfeld BJ, et al. J Sports Sci. 2017;35:1073–82', 'Schoenfeld BJ, et al. Sports Med. 2016;46:1689–97'] },
  zones: { t: 'Active minutes', g: 'WHO guideline; ACSM position stand',
    b: () => 'WHO advises 150–300 minutes of moderate activity a week, with vigorous minutes counting double. Intensity here is your heart-rate reserve: moderate is 40–59%, vigorous 60–89%. Maximum heart rate is estimated as 208 − 0.7 × age and resting rate comes from your morning check, so the bands tighten as you log more.',
    s: ['Bull FC, et al. Br J Sports Med. 2020;54:1451–62', 'Garber CE, et al. Med Sci Sports Exerc. 2011;43:1334–59', 'Tanaka H, et al. J Am Coll Cardiol. 2001;37:153–6'] },
  hrv: { t: 'Morning HRV', g: 'Observational studies in athletes: a nudge, not a verdict',
    b: () => 'RMSSD is beat-to-beat variation driven by vagal tone. A single reading means little; what carries information is today against your own rolling 7-day baseline. A one-minute recording after a one-minute settle agrees well with longer ones. A reading clearly below baseline after poor sleep, illness or a hard block is a reason to keep the day easy. Measure on waking, same position, before coffee.',
    s: ['Plews DJ, et al. Sports Med. 2013;43:773–81', 'Esco MR, Flatt AA. J Sports Sci Med. 2014;13:535–41'] },
};
