// Per-serving values: [id, name, household unit, kcal, protein g, carbs g, fat g, fibre g]
// Raw ingredients follow IFCT 2017 (ICMR-NIN). Cooked dishes are estimates from
// typical home recipes and vary with oil and portion size: treat them as +/- 20%.
const FOODS = [
  // Staples
  ['chapati', 'Chapati / phulka', '1 medium', 100, 3, 20, 1, 3],
  ['chapati_ghee', 'Chapati with ghee', '1 medium', 125, 3, 20, 4, 3],
  ['bhakri_jowar', 'Jowar bhakri', '1 medium', 175, 5, 36, 1, 5],
  ['bhakri_bajra', 'Bajra bhakri', '1 medium', 180, 5.5, 31, 2.5, 5.5],
  ['rice', 'Rice, cooked', '1 katori', 195, 4, 43, 0.5, 0.5],
  ['matta_rice', 'Kerala matta rice, cooked', '1 katori', 190, 4, 41, 0.5, 1.5],
  ['khichdi', 'Moong dal khichdi', '1 plate', 300, 11, 48, 7, 5],
  ['pav', 'Pav', '1 piece', 110, 3.5, 21, 1.5, 1],
  ['thalipeeth', 'Thalipeeth', '1 piece', 200, 6, 28, 7, 5],
  // Dal, pulses, sabzi
  ['varan', 'Varan / dal', '1 katori', 120, 7, 17, 3, 3],
  ['amti', 'Amti', '1 katori', 130, 6, 18, 4, 3],
  ['usal', 'Usal (matki / moong)', '1 katori', 170, 10, 22, 5, 6],
  ['chole', 'Chole / rajma', '1 katori', 200, 10, 27, 6, 8],
  ['kadala', 'Kadala curry', '1 katori', 200, 9, 22, 8, 7],
  ['sambar', 'Sambar', '1 katori', 100, 5, 14, 3, 3],
  ['pithla', 'Pithla', '1 katori', 180, 8, 18, 8, 4],
  ['bhaji', 'Sabzi, dry (bhindi, kobi, etc.)', '1 katori', 110, 3, 10, 7, 4],
  ['batata', 'Batata bhaji', '1 katori', 160, 3, 22, 7, 3],
  ['paneer_bhaji', 'Paneer sabzi', '1 katori', 280, 15, 8, 21, 2],
  ['salad', 'Salad / kakdi / tomato', '1 katori', 25, 1, 5, 0, 2],
  // Protein
  ['whey', 'Whey protein', '1 scoop (30 g)', 120, 24, 3, 1.5, 0],
  ['soya', 'Soya chunks', '50 g dry', 172, 26, 16.5, 0.5, 6.5],
  ['paneer', 'Paneer', '100 g', 290, 18, 4, 22, 0],
  ['tofu', 'Tofu', '100 g', 130, 14, 3, 7, 1],
  ['curd', 'Curd / dahi', '1 katori', 90, 5, 7, 4.5, 0],
  ['greek', 'Greek yogurt / hung curd', '100 g', 95, 8, 5, 4.5, 0],
  ['taak', 'Taak / buttermilk', '1 glass', 40, 2.5, 4, 1.5, 0],
  ['milk', 'Milk, toned', '1 glass (250 ml)', 150, 8, 12, 7.5, 0],
  ['chilla', 'Besan chilla', '2 pieces', 220, 11, 26, 8, 5],
  ['chana', 'Roasted chana', '30 g (handful)', 110, 6.5, 17, 2, 5],
  ['peanuts', 'Peanuts', '30 g (handful)', 170, 7.5, 5, 14, 2.5],
  ['egg', 'Egg, boiled', '1', 75, 6.5, 0.5, 5, 0],
  ['chicken', 'Chicken curry', '1 katori', 240, 22, 5, 15, 1],
  ['chicken_breast', 'Chicken breast, cooked', '100 g', 165, 31, 0, 3.5, 0],
  ['fish', 'Fish curry', '1 katori', 200, 20, 4, 12, 0.5],
  // Breakfast and snacks
  ['poha', 'Poha', '1 plate', 270, 6, 45, 8, 3],
  ['upma', 'Upma', '1 plate', 250, 6, 38, 8, 3],
  ['oats', 'Oats, plain', '40 g dry', 155, 5, 27, 3, 4],
  ['idli', 'Idli', '2 pieces', 120, 4, 25, 0.5, 1.5],
  ['dosa', 'Dosa, plain', '1', 135, 3, 22, 4, 1],
  ['appam', 'Appam', '1', 120, 2, 24, 1.5, 1],
  ['puttu', 'Puttu', '1 piece', 250, 4, 42, 7, 3],
  ['misal', 'Misal pav', '1 plate (2 pav)', 480, 17, 60, 19, 9],
  ['vadapav', 'Vada pav', '1', 300, 6, 40, 13, 3],
  ['sabudana', 'Sabudana khichdi', '1 plate', 450, 6, 65, 18, 2],
  ['samosa', 'Samosa', '1', 260, 4, 30, 14, 2],
  ['biscuit', 'Biscuits (Parle-G / Marie)', '4', 100, 1.5, 17, 3, 0.5],
  ['biryani', 'Chicken biryani', '1 plate', 550, 25, 65, 20, 3],
  ['out', 'Eating out, medium meal', 'rough guess', 750, 20, 85, 35, 5],
  // Fruit, drinks, extras
  ['banana', 'Banana', '1 medium', 105, 1.5, 27, 0.5, 3],
  ['apple', 'Apple', '1 medium', 95, 0.5, 25, 0.5, 4],
  ['guava', 'Guava', '1 medium', 70, 2.5, 14, 1, 5],
  ['chai', 'Chai with sugar', '1 cup', 70, 2, 10, 2.5, 0],
  ['coffee', 'Coffee with milk and sugar', '1 cup', 70, 2, 10, 2.5, 0],
  ['black_coffee', 'Black coffee, no sugar', '1 cup', 2, 0, 0, 0, 0],
  ['colddrink', 'Cold drink / juice', '250 ml', 105, 0, 27, 0, 0],
  ['ghee', 'Ghee / oil', '1 tsp', 45, 0, 0, 5, 0],
  ['sugar', 'Sugar / jaggery', '1 tsp', 20, 0, 5, 0, 0],
];

// [gym exercise, dumbbell-at-home exercise, sets, reps, note]
// Shoulder-friendly by design: neutral grips, scapular-plane pressing,
// no behind-the-neck work, upright rows or dips.
const PLAN = {
  A: [
    ['Leg press', 'Goblet squat', 3, '8–12', ''],
    ['DB bench press, neutral grip', 'DB floor press, neutral grip', 3, '8–12', 'Elbows about 45° from the body'],
    ['Seated cable row', 'One-arm DB row', 3, '8–12', ''],
    ['Romanian deadlift', 'DB Romanian deadlift', 3, '8–12', ''],
    ['Cable face pull', 'Band face pull', 2, '12–15', ''],
    ['Plank', 'Plank', 3, '30–60 s', 'Log seconds as reps'],
  ],
  B: [
    ['DB split squat', 'DB split squat', 3, '8–12', 'Each side'],
    ['Lat pulldown, neutral grip', 'Band pulldown', 3, '8–12', 'Pull to the front only'],
    ['Incline DB press, 30°', 'Push-up', 3, '8–12', ''],
    ['Hip thrust', 'Glute bridge with DB', 3, '10–15', ''],
    ['DB lateral raise, scapular plane', 'DB lateral raise, scapular plane', 2, '12–15', 'Light; stop at shoulder height'],
    ['Dead bug', 'Dead bug', 3, '8–10', 'Each side'],
  ],
  C: [
    ['Hack squat / leg press', 'Goblet squat, slow lowering', 3, '10–15', ''],
    ['Landmine press', 'Half-kneeling one-arm DB press', 3, '8–12', 'Press up and slightly forward'],
    ['Chest-supported row', 'Chest-supported DB row', 3, '8–12', ''],
    ['Leg curl', 'DB leg curl', 3, '10–15', ''],
    ['DB curl', 'DB curl', 2, '10–15', ''],
    ['Triceps pushdown', 'DB kickback', 2, '10–15', ''],
  ],
};

const PREHAB = [
  'Cross-body stretch, 3 × 30 s',
  'Sleeper stretch, 3 × 30 s (gentle)',
  'Band external rotation, 2 × 15',
  'Band pull-apart, 2 × 15',
  'Wall slides, 2 × 10',
];
