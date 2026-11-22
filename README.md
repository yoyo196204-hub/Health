# Health

A personal fat-loss, training and recovery app for one person, built on published evidence and on that
person's own data. Every number on screen has a "why" link to the reasoning and the studies behind it.

Everything is worked out on the phone, from nothing but what is stored on it: the energy you actually burn (learned
from your scale and your food log, with its 95% interval), one recovery number made of signals each read against your
own normal, the regularity of your sleep, and what drives what in your own day-to-day data. The more you log, the
narrower the intervals get and the more the app can tell you about yourself.

You lift in [openGym](https://github.com/DuarteSantos8/openGym); Health plans the training and reads it back. The plan
goes to openGym as one file, the sets come back through openGym's backup folder and Health Connect, and they join the
Amazfit and Polar H9 data that decides how hard each day should be.

## Two ways to run it

- **Android app**: the full experience. Download `health.apk` from the
  [latest release](https://github.com/yoyo196204-hub/Health/releases/latest). Steps, sleep, heart rate, workouts and weight arrive
  by themselves from Health Connect each time the app opens, and again whenever you pull down on any tab. The Polar H9
  connects over the phone's own Bluetooth and is remembered. Haptics come from the phone's vibration engine (composed
  clicks where the phone supports them). Reminders for the morning check, the weekly waist and the evening food log
  arrive as notifications, only when the thing is still undone. A home-screen widget shows today's recovery, food left and sleep as three rings with the kcal left; it updates when you leave the app and after each sync, and a tap opens Today. Long-press the app icon for three shortcuts: Log food (the meal due now), Weigh in, and Morning check. A daily backup can go to a folder you choose. The app has
  **no internet permission**, so nothing in it can leave the phone.
- **In Chrome** (`index.html`, served by GitHub Pages): the same screens, with the H9 over Web Bluetooth and
  Amazfit data from a Gadgetbridge or Zepp export. "Move my data to the app" in You hands everything to the Android app
  in one step.

## Installing and updating, from the phone

Every version is built on GitHub and signed with the app's one permanent key, so each new version installs
straight over the last and keeps everything in it. No computer is involved at any point.

- **Update**: open the [latest release](https://github.com/yoyo196204-hub/Health/releases/latest) on the phone,
  tap `health.apk`, then Update. Do this on each device you use.
- **Only ever install from the Releases page.** A build made anywhere else is named "Health test", has its own ID
  and installs separately; it cannot replace or touch the real app.
- **Moving from version 2** (one time only): version 2 was signed with a key that no longer exists, so version 3
  is a separate app and installs next to it. In the old app: You › Backup › Export. In the new app: Today ›
  Import a backup, pick that file, check your history is there, then uninstall the old app. Allow Health
  Connect, pick the backup folder and connect the H9 again in the new app.

## Training in openGym

[openGym](https://github.com/DuarteSantos8/openGym) and Health work as a pair, through files on the phone (neither
app needs the internet for it). openGym is where you lift: its animations, rest timer, watch app and 5,600 exercises.
Health stays the brain: the plan, recovery, food, weight, and the analysis of everything you lift.

**Health → openGym: your plan.** You › Training › Train in openGym makes `Health plan for openGym.json`: your
programme as Health has it today (gym or home kit, shoulder care, anything pain has taken out), with rep ranges, double
progression, the next loads, rest times, the cues and the weekdays, and also:

- up to three **backup exercises** per slot from openGym's catalogue, hand-picked for the same main muscle and clear of
  the shoulder's provocative positions (only dumbbell, band or floor ones at home), for when a machine is taken;
- a **warm-up ramp** before each session's first big lift;
- an **8-week block** that runs the routines in rotation (a missed day never skips a session) with an effort target of
  RPE 8. There is no planned deload week: in a randomised trial a mid-programme deload week cost strength and gained no
  muscle (Coleman 2024). Stalls drop a load 10%, and a low HRV week makes the day an easy one.

openGym's double progression is the same rule as Health's, so the loads keep moving the same way there.

1. Health: You › Training › **Save the plan file** (in the app, with openGym's folder linked: **Put it there**).
2. openGym: **Plan** › share icon (top right) › **Import a plan file** › pick `Health plan for openGym.json`.
3. Turn on **Use this weekly schedule**, then **Add to my plan**. The routines are named "Day A (Health)" and so on.
   To run the block: Plan › menu › Programmes › the Health block › Start programme.
4. When the plan changes (another programme, home or gym, shoulder care, an exercise out after pain), Health says so on
   Today and in Me. Delete the old "(Health)" routines in openGym, then import the new file. New loads alone need no new
   file: openGym works those out itself.

**openGym → Health: what you lifted**, two ways that work together:

- **Health Connect**: in openGym, Settings › Integrations › Health Connect › turn on workouts and heart rate from your
  watch. Each finished openGym workout appears in Health straight away, with the heart rate the Bip saved during it.
- **openGym's backup folder** brings the sets themselves: every completed work set (no warm-ups, no unticked sets), timed holds, cardio,
and the weigh-ins you typed in openGym. Sessions count in Today › History (the week, the sessions, strength per lift, the muscle map) and in Health's next targets.
After a session with shoulder-loading exercises, Today asks how the shoulder felt; pain swaps the exercise next time
and the plan file says it needs sending again.
A day you logged in Health is never overwritten; a session that came from openGym follows openGym's later edits, moves
and deletions, and keeps any shoulder report you gave it in Health. Change a set of it in Health and it becomes
Health's own.

- **Android app, automatic**: in openGym, Settings › Data & backup › turn on **Auto-backup on changes**. In Health,
  You › Data sources › openGym › **Link openGym's folder** and choose Documents › openGym (the picker opens there).
  The first read shows what would come in; after you accept it, Health reads openGym's newest backup by itself each
  time it opens, and only when it has changed.
- **By hand, anywhere**: openGym's **Export backup** or **Export as CSV** (workouts), then You › Data sources ›
  openGym › Choose an openGym file. A copy is kept first, so it can be undone.

Exercises in Health's plan go to the same exercise in openGym's library and come back as Health's own. Anything else
you log in openGym arrives with its name and the muscles it trains, from `opengym-ids.js` (see Credits).

## Screens

| Tab | What it is for |
| --- | --- |
| Today | Three rings: recovery (0–100, in its green/yellow/red zone), calories left, and last night's sleep; what is due today as a row of one-tap actions (weigh in, the morning check, the next meal); the one thing your data most wants you to know; Fuel: eaten against the target, protein, carbs, fat and fibre, the four meals as tiles (kcal and protein in each, the one due now lit, one tap to add), and one concrete suggestion; weight trend and steps; last night with its stages, heart rate asleep and regularity; the shoulder check after an openGym session; training as one card with two buttons: Session (the next openGym session as a sheet: its exercises, loads, today's recovery guidance and the shoulder routine) and History (the week against the WHO, training load against the usual week, the sessions with their sets and watch heart rate, strength per lift, the muscle map); a line when the plan in openGym is out of date. When resting heart rate is clearly above your usual and HRV below your normal range on two nights in a row, each against your own baseline (Mishra 2020, Radin 2020, Hirten 2021), a gentle "Take it easy today" with its reasons; never a diagnosis, and only read once both have 14 baseline values (Heart › Recovery says which are missing) |
| Food | The diary. The week as a strip of rings (green within 10% of target, red over it, saffron under); swipe across the page for the day before or after. What is left as a ring, with eaten, target and the burn the model has learned; the four macros; a suggestion. Each meal as a card: tap an entry to change it, hold it, or swipe it left to remove it (with undo); an empty meal offers "same as yesterday" and your usual foods, one tap each. Then where the day's protein and energy went, meal by meal, and the week as bars against the target |
| Heart | One part at a time, picked at the top. **Recovery**: recovery as one number, with each part it is made of (HRV, resting heart rate, sleep, breathing) drawn against your own normal (tap one to go to it); the H9 morning check (1–5 minutes, lying or sitting) with live beats, skin contact and signal quality, and a result with its tachogram, Poincaré plot and every measure; morning HRV against your normal range; resting and sleeping heart rate. **Sleep**: 14 nights as a chart and one line (length, regularity, and the one thing to change), night by night (each opening a day in detail), and the watch's overnight HRV and breathing rate against their own baselines. **Cardio**: cardio with the H9 (live trace, zones, α1), the cardio of the last 14 days, the aerobic threshold it gives, and watch-vs-strap agreement |
| Insights | One part at a time, picked at the top (the headlines are Today's insight deck). **Energy**: the burn learned from your scale and log, its 95% interval over time against what you ate, what this week's balance means in kilograms, and how you eat across the week (logging, consistency, weekdays against weekends, protein at each meal). **Body**: weigh-ins with the filtered trend, body fat from your waist, strength, and where the trend leads, each date with its 95% range. **Long game**: one line each for fitness, steps, resting heart rate, waist ÷ height, sleep length and regularity, social jetlag, strength and active minutes, read against the cohort studies (tap one for its study), with the one change worth the most named first. **Links**: only the links that are real in your own data, each with its effect in real units, its interval drawn around zero, and how to test it; the rest behind one line |
| The log button (every tab) | Everything you might log, from anywhere: each meal (the one due now first), quick kcal, plates, search, a pack by barcode; weight, waist, cardio, your day; and the strap: the morning check, breathing, a spot check, a Live session, the resonance finder and the stand-up test |
| Weigh in / waist | A big number set with steppers, a ruler you drag, or the keyboard; it starts at your trend, says how far from it you are, and asks before keeping a reading that looks like a typo |
| Automation (Android app) | The remembered strap connects by itself when the app opens with it on your chest, and before 11 with no check yet that day the morning check starts by itself; both can be turned off under the morning check. On a day without a morning check the watch's night stands in for it in the verdict, and the verdict says what it rests on |
| Lab (from the log button) | Breathe (resonance, cyclic sighing, box; with or without the strap, haptic cues per breath), the resonance finder, the orthostatic test, spot checks, and Live: an open-ended session with RMSSD, SDNN, pNN50, SD1/SD2, breathing rate and α1 moving as you watch, marks for what you are doing, each marked stretch read on its own and against your earlier ones, and the beats saved as a CSV file for other HRV software; every session kept |
| A day in detail (tap a night, or Your day) | The watch's heart rate across 24 hours with sleep and workouts marked, the night stage by stage, and every number against your previous four weeks |
| Beat by beat (from any morning check or Lab session) | The recording beat by beat: one finger reads each beat (time to the millisecond, RR, bpm, change from the last, and what correction it needed), a pinch zooms, the strip below moves the window; RMSSD, SDNN, pNN50, SD1/SD2, the Poincaré plot and the spectrum are worked out again for the stretch on screen |
| Data checks (You, and a line on Insights when something needs a look) | About twenty fixed-rule checks across every dataset: food energy against its own macros, sleep stages against the night's total, watch resting and workout heart rate against the strap (Bland–Altman), saved RMSSD against its own beats, steps against distance, active against total energy, duplicate workouts, load typos, wear time, and how fresh the watch data is. Each gives its numbers and lists the records that failed. Below them, the last 50 errors in the app itself, with Copy; kept only on the phone |
| Pack by barcode (the log button, or the barcode button in Add food's search) | Type the number under the bars; as soon as it is whole the pack is looked up on the phone in 16,000 packaged foods from Open Food Facts (every Indian product with a nutrition panel, and the most-scanned ones worldwide) and in your own foods. It shows the panel per 100 g, and three things that matter on a fixed budget: protein per 100 kcal, energy density, and the share of energy from sugars, with ultra-processing (NOVA 4) said plainly; then what one serving is of what is left today. Choose amount opens the usual amount sheet. A pack that is not in the list is entered once from its label with its barcode, and is known from then on. Packs also come up by name in the food search, under their own heading. Fling the card away for the next |
| Adding food | A switch between the four meals at the top; search that understands Marathi, Hindi and English names (roti, chawal, anda, chaas, aloo, kombdi…) and forgives a typo; chips for Usual, Recent (exactly as you last logged it), Plates (yours first), Quick add, Mine, and every group from home food to Pune street food, pizza and Chinese, bakery and Irani café, and upvas. Tap adds one (the list keeps its order while you add, so nothing jumps from under your finger); hold any food, or swipe it right, for any amount: steppers, a ruler you drag (a light detent each quarter; a flick keeps it rolling), or by weight, into any meal. The bar at the bottom shows the meal and the day as you go |
| A logged food (tap it) | Type any amount, step it, or drag its ruler, weigh it, change the meal, change its own numbers (it then becomes your own entry and the library food stays as it was), move or copy it to another day, or save it as your own food |
| You (the face at the top of every tab) | Your numbers, and a page each for goal, training, profile, data sources, all your data (see, change or delete any record), backup and data, feel, and the evidence |

Gestures: swipe sideways to change tab (on Food: to change day), swipe right on a page to go back, swipe a row left to delete it (with undo), hold or swipe right on a food for its amount, drag any ruler, hold a stepper to repeat, fling a banner, a callout, a result card or a toast away, fling the insight card on Today for the next one, drag a sheet down from anywhere on it (once its content is at the top) or tap outside it to close.

Everything a finger moves is physical (`motion.js`): it follows the finger exactly, and on release it carries the finger's speed into a spring, so a flick travels and a slow drag settles back with a small overshoot. Every CSS transition uses the same springs (sampled into `linear()` easings). A sheet is a layer: as it rises the page sinks back under it, a little smaller against black under a darkening scrim, and comes forward again as you pull the sheet down; only the page's transform and the scrim's opacity change while you drag, so the drag never makes the page restyle or repaint. Cards sink a little when pressed, and the title of a tab drifts up slower than the page so the cards slide over it. Heart and Insights show one part at a time from a row that stays at the top.

Haptics follow one vocabulary everywhere: a press under the finger, a tick when a choice changes, a light detent for each step of a ruler, a double pulse for something saved, a rising triple when protein reaches its target, and a firm double when the day passes its calorie target or a value is refused.

The screen is redrawn as a patch, not from scratch: only what changed is touched, so rings ease to their new length,
numbers count to their new value, and the scroll, the keyboard and anything half-typed stay where they are. Moving
between tabs reuses what was already worked out from the data; anything that changes the data recalculates it. A new screen is drawn at once and fades in over a sixth of a second: no snapshot of the old screen first, no cards arriving one by one.

## How the numbers are made

- **Watch data, and how fresh it is**: the watch's app (Zepp, or Gadgetbridge, the open-source app that runs an
  Amazfit watch without Zepp) passes the watch's data to Health Connect only when it syncs with the watch, so Today shows
  two times: when the watch app last wrote to Health Connect, and when Health last read it. Health reads Health Connect
  on opening (after two minutes away), every five minutes while open, on pull-down, and twice on coming back from
  "Open Zepp" or "Open Gadgetbridge". Steps, distance, sleep, resting heart rate, HRV and heart samples come from the
  watch app's own records on any day it wrote them, so they match the watch rather than Health Connect's merge of every
  app (on Android 14+ the phone counts steps too); the merged step count is kept beside it and Data checks lists days
  where they differ. On a day two watch apps wrote (the day you move from Zepp to Gadgetbridge), the one with more of
  that day counts; the one named on screen is the one still writing.
  In Gadgetbridge: Settings › External integrations › Health Connect, turn it on, allow every type, and turn on Sync
  after device sync.
- **Food**: every food carries protein, available carbohydrate, fat and fibre, and the grams in its household unit, so a
  portion can be weighed. Home dishes are recipe estimates; packaged foods come from their label panels (Open Food Facts,
  barcode given), or only what the maker states when that is all there is (carbs and fat then stay unknown, never
  guessed); raw ingredients from IFCT 2017 or USDA. Pune and eating-out food (misal, tarri pohe, bun maska, mastani, pizza by the slice, burgers, hakka noodles, Kolhapuri and Malvani non-veg, upvas dishes) are estimates for a typical portion, never a brand's figures. Every panel is checked against its own macros (4/4/9, fibre 2) in the
  tests, and your own foods and entries are checked the same way as you type them.

- **Wear time**: a day counts only with the watch on the wrist for 10 hours, and a week only with 4 such days, the rule
  accelerometer studies use (Troiano 2008). Non-wear is any hour or more with no heart rate in the day's 5-minute curve
  (the last 45 days); older days keep the worn minutes their sync or history file gave (a minute with a step or a
  heart rate), and a day with neither is unknown: kept, never called valid. Short days are left out of step averages,
  the burn model's steps, the long game and the links; a night with an hour or more off the wrist inside it is left
  out of every sleep figure. A night or a day you typed always counts. Each screen that leaves days out says how many.
- **Weight trend**: each weigh-in moves a smoothed line a tenth of the way; the weekly rate is the Theil–Sen
  slope (median of pairwise slopes) over 21 days, so one heavy evening cannot swing it. A weigh-in far from
  the trend asks whether it was a typo.
- **Your burn** (`energy.js`): a Kalman filter tracks two hidden numbers, your true weight under the scale's noise and
  the energy you burn a day. Each morning weigh-in pulls on both; each completely logged day says what went in; the steps
  above or below your usual move that day's burn. A kilogram of change is not taken as 7,700 kcal: the share that is fat
  depends on how much fat there is (Forbes: dFFM/dFM = 10.4/FM), fat holds 9,440 kcal/kg and lean tissue with its water
  1,816 (Hall 2008), and body fat comes from your waist and height (Relative Fat Mass, calibrated against DXA in 12,581
  adults, Woolcott 2018). The scale's own day-to-day noise is measured from your weigh-ins, and a reading far outside it
  counts for a tenth. Days without a complete log add uncertainty, not bias. The same principle, run with a metabolic
  model on weigh-ins alone, came within 40 kcal/d of doubly labelled water on average over two years in the CALERIE trial
  (Sanghvi 2015). Because the burn is learned from your own log, if the log runs low the burn comes out low by the same
  amount, and the target built on it still lands where it should.
- **Calories**: Mifflin-St Jeor plus steps and training to start, moving to the learned burn as its interval narrows
  (none of it at ±300 kcal, all of it at ±150), never further than 25% from the formula. The deficit is your pace times
  the energy in a kilogram of your own change. The target is recalculated on Mondays and moves by at most 150 kcal per
  update; changing goal, pace or profile recalculates at once. Pace is a setting: maintain, slow 0.4%, steady 0.6%,
  faster 0.8% a week, never more than a quarter of daily burn.
- **The recovery number** (`insights.js`): the verdict decides the zone, by the rules the HRV-guided training trials
  used (the 7-day average of ln RMSSD against your own range of ± half a standard deviation, read with resting heart rate,
  sleep and breathing): green 67–99, yellow 34–66, red 1–33. Where the day sits in its zone comes from how far each signal
  is from your own normal, in standard deviations, weighted by its evidence: HRV 45%, sleep 25%, resting heart rate 20%,
  breathing in sleep 10%. Every part is shown beside the number.
- **The long game** (`markers.js`): eight markers that large cohorts tie to how long people live, all from data the app
  already has. **Fitness** is VO2peak from the HUNT non-exercise model (Nes 2011; men 100.27 − 0.296·age + 0.226·PA −
  0.369·waist − 0.155·resting HR, women 74.736 − 0.247·age + 0.198·PA − 0.259·waist − 0.114·resting HR; SEE 5.7 and 5.1),
  with the activity index built from your own last four weeks of sessions (how often, median length, how hard by heart
  rate) instead of a questionnaire. Each MET higher went with 13% lower all-cause mortality across 33 cohorts (Kodama
  2009); a change is only called beyond 3.6 ml/kg/min, the model's error for change (Peterman 2020). What would move it
  (resting HR 5 bpm lower, waist 5 cm smaller, more sessions) is shown in ml/kg/min and cohort risk. **Steps**: the
  4-week median on the Paluch 2022 curve (quartile medians 3,553 / 5,801 / 7,842 / 10,901 at HR 1 / 0.60 / 0.55 / 0.47,
  straight lines between, never extrapolated). **Resting heart rate**: 9% per 10 bpm (Zhang 2016, 46 cohorts).
  **Waist ÷ height** against 0.5. **Sleep**: 7–9 h (Cappuccio 2010; Watson 2015). **Strength**: minutes a week against
  the 30–60 where Momma 2022 found the most benefit. **Social jetlag**: mid-sleep on Saturday and Sunday mornings
  against workdays over six weeks (Wittmann 2006; Roenneberg 2012), also shown with sleep on Heart.
- **Goal dates**: each projected date carries the 95% range of the 21-day Theil–Sen rate (Sen 1968's distribution-free
  interval); a slow end that is not falling says "later" rather than inventing a date.
- **Sleep regularity**: the Sleep Regularity Index (Phillips 2017), minute by minute from each night's onset and wake
  time over consecutive nights: the chance of being in the same state 24 hours apart, from −100 to 100. Shown against the
  UK Biobank median of 81, where regularity predicted mortality more strongly than sleep length (Windred 2024).
- **Sleep stages**: watches measure total sleep and its timing reasonably, and deep, light and REM only moderately
  (de Zambotti 2019; Chinoy 2021). Every sleep conclusion, link and recovery input rests on total sleep, its timing
  and regularity, and the heart rate asleep; stages are drawn as the watch scored them and never compared or judged.
  A test reshuffles every night's stages and checks that no conclusion moves.
- **What moves what**: each pair (sleep and morning HRV, bedtime and HRV, hard sets and next-morning HRV, sleep and the
  calories eaten, steps and appetite, calories and carbs and the next morning's scale, the day's food and heart rate
  asleep, the last meal's time and heart rate asleep, steps and sleep) is read as a single-person study: each series as
  its deviation from its own 15-day running mean, lagged the way the physiology runs, with the effective number of days
  cut by both series' autocorrelation, and the effect in real units with a 95% interval. A link is "clear" only when the
  interval leaves out zero; each says whether it agrees with the research and how to test it on yourself.
- **Every strap reading** (`hrv.js`): artefacts corrected with thresholds that adapt to your own beat-to-beat spread
  (Lipponen & Tarvainen 2019), so slow breathing is never mistaken for noise; RMSSD, SDNN, pNN50, Poincaré SD1/SD2, the
  Lomb–Scargle spectrum (HF from one minute, LF from two) and breathing rate from the rhythm in the beats. Each packet
  is timestamped where Bluetooth delivers it, and beat times come from the intervals themselves.
- **Watch against strap**: after 5 paired mornings the watch's resting heart rate is shifted to the strap's; after 3
  paired workouts its workout heart rate is shifted by the average difference. Wrist error grows with effort and arm
  movement (Bent 2020), so once 6 paired workouts span at least 30 bpm the watch is mapped to the strap by a straight
  line (least squares, strap on watch; a slope outside 0.6–1.4 keeps the shift), with its residual error in Data checks.
  Heart › Cardio has the calibration protocol: wear both for 3 sessions of 5 min rest, 10 easy, 10 moderate, 3–5 hard.
- **Heart-rate recovery**: after a strap cardio session, the fall in heart rate over one still minute, read against your own.
- **Aerobic threshold**: during strap cardio, α1 of detrended fluctuation analysis over each two minutes of beats,
  every 30 seconds, windows with over 5% corrected beats dropped; the heart rate where α1 crosses 0.75 (Rogers 2021).
- **Overnight watch data**: the Bip's HRV and breathing rate each against their own 4-week baseline, never mixed with
  the strap; they can nudge a day to "listen to your body", never to "keep it easy".
- **Training load**: each session's Edwards zone TRIMP (minutes at 50–59% of maximum heart rate × 1, up to ≥90% × 5;
  from Banister's training impulse), from the strap's trace, or the watch's heart rate once it is matched to the strap.
  Today › History shows the last 7 days against the usual week of the last 4 (once there are 4 weeks of records) and
  Foster's monotony as context; sessions with no usable heart rate are left out and named. The acute:chronic ratio is
  not shown as an injury risk (Impellizzeri 2020).
- **Lifting**: double progression on completed reps. Every set at the top of the range adds the smallest
  weight step; sets under the bottom hold the load; three such sessions drop it 10%. On a day Recovery says
  "keep it easy", the session offers one set fewer and no increases.
- **Shoulder care**: overhead pressing and flyes are swapped for movements that never reach the provocative
  end range; after a shoulder exercise you can report fine, niggle or pain. A niggle holds the load, pain
  swaps the exercise next time, pain twice takes it out of the plan until you bring it back.
- **Volume**: one set counts 1 for the muscle an exercise is for and 0.5 for one it trains on the way.

## Your older history (Gadgetbridge, Zepp export or Health Connect backup)

Health Connect brings the recent weeks from the watch app by itself, but only as far back as it has been writing to it,
and the app reads at most 120 days of it. A file fills in everything before that. In Health: You (the face at the top)
› Data sources › History files › **Choose a file**. The file is recognised by what is in it, not by its name.

### Gadgetbridge

Gadgetbridge keeps every minute the watch sends in one SQLite database. Data management › **Export zip** (the database
is inside as `database/Gadgetbridge`), or **Export Data** for the database alone (a file called just `Gadgetbridge`);
Auto export writes one every day. Pick either. Read on the phone by `gadgetbridge.js`:

- Each minute's steps and heart rate (`HUAMI_EXTENDED_ACTIVITY_SAMPLE` for Zepp OS watches such as the Bip 5 and Bip 6;
  `MI_BAND_ACTIVITY_SAMPLE` for older Amazfit and Mi Band watches). When two watches cover one day, the one worn more of
  it (minutes with a step or a heart rate) is that day's, so steps are never counted twice and two sensors never mixed.
- Each night from the watch's own sleep report, decoded as Gadgetbridge decodes it: the stages (light, deep, REM, awake)
  minute by minute, filed under the morning; a later report of the same night replaces the earlier one, and a second
  sleep that day is a nap.
- The day's resting heart rate (stamped with the watch's zone), overnight HRV (only the readings inside the night's
  sleep), blood oxygen, breathing rate in sleep, a paired scale's weight, and each workout's summary with its own
  watch's heart rate.
- Sleep, heart rate and workouts then go through the same code as a Health Connect backup (`hcbNight`, `hcbSleep`,
  `hcbHeart`), so an imported day and a synced day agree.

Gadgetbridge's sample tables are `WITHOUT ROWID` tables, which SQLite stores as index B-trees; `sqlite.js` reads those
too (interior cells hold rows, index pages keep less of a row before its overflow pages).
Tests: `python3 test/make-gb-fixture.py` writes `test/fixtures/gadgetbridge.zip`, 40 made-up days of a Bip 6 and an
older Bip in Gadgetbridge's exact table layout; the engine tests check the reader against Python's sqlite3.

### Zepp export

Zepp's own export brings steps, every night with its stages and times, heart rate through the day (a resting estimate
for each day), and a Zepp scale's weight and body fat.

1. Zepp › Profile › Settings › Account › Export data. Zepp emails a zip and shows its password.
2. Pick the zip itself; there is no need to unzip it. The password is asked for in the app.
3. Everything is read on the phone, file by file and line by line, so a large export does not run out of memory. Files
   are recognised by their columns, so a renamed folder or a newer layout still works; workouts, minute-by-minute steps
   and the profile are left aside.
4. A preview shows what each kind covers. Import keeps a copy first (one tap undoes it), never overwrites what you typed,
   and keeps anything you deleted deleted. Years of history go in whole.

Both locks Zepp-style zips use are opened: the traditional PKWARE one and WinZip AES (checked with its password
verifier and HMAC). Zip64 archives are read too.

### A Health Connect backup

Android can write everything Health Connect holds to one file: Settings › Security and privacy › Health Connect ›
Export (on some phones, Health Connect › Data and access › Export). The "Health Connect.zip" it saves, to Drive or the
phone, has every app's records as far back as Health Connect has them, so it reaches past the sync's 120 days and
also holds what Zepp never exported.

- Pick it the same way as a Zepp zip. Inside is an SQLite database; the app reads it itself (sqlite.js, the file
  format as sqlite.org documents it: pages, B-trees, overflow pages), with nothing installed and nothing uploaded.
- The records become days by the same rules as the daily sync (HealthReader.kt), so an imported day and a synced day
  agree: the watch app's figures where it wrote any, otherwise the fullest single app's (never two devices added
  together); a record that crosses midnight is shared between the days by time; a night is filed under the morning it
  ends, the watch's longest session is the main sleep, the rest naps; resting heart rate, overnight HRV, breathing rate
  and blood oxygen are the day's average; weight is the morning's first; heart rate gives the rate asleep and its low
  point, a resting estimate on days with no resting figure, the 24-hour curve for the last 45 days, and each workout's
  seconds at each bpm. A chest strap's heart rate is dropped on days the watch covered.
- Workouts from any app but this one come in, on days that have none yet; openGym's keep their routine's name.
- The database is unpacked whole into memory (about 2.5 times the zip's size), so a very large backup needs a phone
  with memory to spare (a 70 MB zip needs roughly 250 MB while it is read).
- Tests: `python3 test/make-hc-fixture.py` writes `test/fixtures/hc-backup.zip`, 120 made-up days in Android's own
  table layout; the engine tests check the reader against Python's sqlite3 row for row.

## Your data

- Saved on the phone, with a second private copy inside the app, yesterday's automatic backup, and the daily
  file in your backup folder.
- Anything that removes data (removing old data, erasing, importing) keeps a copy first and offers Undo;
  the removals themselves need a press and hold.
- You › All your data lists every record by kind: tap to change it, swipe left to delete it. Anything deleted that came
  from the watch or a scale stays deleted when the watch syncs again; a typed value always wins over the watch.
- A strap cardio session is saved every 15 seconds while it runs, so a crash or a closed app offers it back.
- You › Backup and data shows what is stored and can **remove data older than** 3, 6, 12 or 24 months, for food,
  weigh-ins, watch data or training separately.
- **openGym**: see [Training in openGym](#training-in-opengym).
- **Halftone**: You › Backup and data › Bring in Halftone takes a Halftone backup file and adds its sessions,
  shoulder reports, bodyweight and cardio. Halftone's five demonstration sessions are recognised and left out,
  and any day already in Health keeps Health's version.

## Code

Plain JavaScript, no build step. Scripts load in this order:

| File | Holds |
| --- | --- |
| `lib.js` | Dates, formatting, statistics (Theil–Sen, Bland–Altman agreement) |
| `errlog.js` | The error log: the last 50 errors on this phone (message, file:line, screen, time, version), loaded second so a failure while loading is caught too; a crash in the Kotlin code (`Crash.kt`) joins it the next time the app opens |
| `hrv.js` | Beat-to-beat analysis: artefact correction, every HRV measure, the spectrum, breathing rate, RSA, reading a value against your own |
| `data.js` | Foods, goal paces, the evidence library |
| `exercises.js` | The exercise library, programmes, home substitutes, shoulder rules, warm-up |
| `opengym-ids.js` | openGym's exercise numbers with their names and muscles (see Credits) |
| `body-data.js` | Muscle map outlines (from react-body-highlighter, MIT) |
| `store.js` | Storage, schema and migration, snapshots, removing old data, Halftone import |
| `model.js` | Nutrition, weight, heart, HRV, sleep and activity conclusions |
| `energy.js` | The burn learned from scale and log (Kalman filter), body fat, the energy in a kilogram of change |
| `insights.js` | Links in your own data, the Sleep Regularity Index, the recovery number, eating patterns, the day's headline |
| `markers.js` | The long game: fitness from the HUNT model, steps, resting heart rate, waist ÷ height, sleep, social jetlag, strength and active minutes against the cohort evidence, and the biggest lever |
| `train.js` | Which session is next, the plan, progression, volume |
| `native.js` | The bridge to the Android app; one merge path for every outside data source |
| `feel.js` | Haptics, screen transitions, sheets, undo toasts, press and hold, the ruler, swipes, pull to refresh |
| `motion.js` | The physics: springs, flick projection, rubber-banding; sheets as layers, fling to dismiss, the insight deck, pressing, scroll depth |
| `ui.js` | Shared building blocks: rings, meters, icons, the chart (with interval bands) and the muscle map |
| `styles.css`, `inter.woff2` | The design: flat surfaces in warm neutrals, each a solid tone edged by a hairline (no gradients, glows or bevels), one saffron accent and a colour per domain; a solid tab bar with the log button in its middle, so nothing floats over the page; Inter with optical sizing, bundled |
| `h9.js` | The strap: connection, the beat timeline, live trace, morning HRV check, cardio with α1, heart-rate recovery, crash-safe drafts |
| `beats.js` | The beat explorer |
| `lab.js` | The Lab: breathing pacer, resonance finder, orthostatic test, spot check, Live sessions and the beat export |
| `zip.js` | Reading a zip on the phone: its table of contents, the PKWARE and WinZip AES locks, inflating with the browser's own DecompressionStream, line by line |
| `watch.js` | History files: the Zepp export (the zip as emailed, or its CSV files, each recognised by its columns), and databases in or out of a zip, each reduced to days, previewed, merged |
| `sqlite.js`, `hcbackup.js`, `gadgetbridge.js` | Reading an SQLite file on the phone (rowid and WITHOUT ROWID tables); a Health Connect backup and a Gadgetbridge database made into days by the sync's rules |
| `opengym.js` | openGym: its backup and CSV coming in, the folder link, Health's plan as an openGym plan file with backups and the block |
| `view-*.js` | One file per screen; `view-food.js` is the diary and everything about adding and changing food, `view-review.js` is Insights, `view-recovery.js` is Heart, `view-records.js` is all your data and a day in detail, `view-checks.js` the data checks |
| `scan.js` | Packs by barcode: the offline lookup, and what a pack says per 100 kcal |
| `products.js`, `whole.js`, `indb.js` | Loaded only when a barcode or the food search needs them: the Open Food Facts list (built by `test/build-products.py`), everyday whole foods from OpenNutrition (`test/build-whole.py`) and Indian recipes from INDB (`test/build-indb.py`) |
| `app.js` | State, routing, events, and the patching renderer |

Exercise animations live in openGym. Tests: `node test/run.js` (the engine) and `node test/browser.js` (the screens in a real browser: that a finger scrolls every tab, fixed bars stay put, a Live session runs end to end; needs Playwright). Both run on GitHub before every build.

After changing any web file, run `node test/stamp.js`. It stamps every file in `index.html` and `sw.js` with a
version (`?v=…`), so a phone can never mix a new page with old files it still holds from before; the tests fail
if the stamp is out of date. If files from two versions ever do meet, the app stops before starting, says so,
and offers a clean reload instead of showing broken screens.

The Android project is in `android/`. Its build copies the web files from the repository root
into the app, so there is one copy of the code.

Builds run in GitHub Actions (`.github/workflows/android.yml`) on every push. On the default branch the APK is
signed with `android/release.p12`, its signature is checked against the permanent certificate
(SHA-256 `7d9dfafd…682c6650`), and it is published as a release. The key file is encrypted; its password is only
in the repository secret `HEALTH_KEYSTORE_PASSWORD` (keep a copy of it somewhere safe as well). Without that
password a build is signed with a throwaway key and becomes "Health test" (`app.health.personal.test`).

## Credits

The typeface is [Inter](https://github.com/rsms/inter) by Rasmus Andersson, under the SIL Open Font License 1.1
(`licenses/Inter-OFL.txt`), bundled so the app never fetches anything.

`opengym-ids.js` lists exercise numbers from [openGym](https://github.com/DuarteSantos8/openGym)'s catalogue, with only
the 1,324 entries whose names and muscles come from ExerciseDB v1 by AscendAPI via
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT; the notice is in the file).
No openGym code, descriptions, pictures or animations are copied into Health.

Packaged foods in `products.js` come from [Open Food Facts](https://world.openfoodfacts.org), under the Open Database
License (`licenses/OpenFoodFacts-ODbL.txt`). Indian recipes in `indb.js` (857 of the Indian Nutrient Databank's 1,014: dals, sabzis, rice, breads, snacks, sweets, drinks, each with its own serving) come from [INDB](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-) (Vijayakumar, Jaacks et al., 2024; `licenses/INDB.txt`), computed from IFCT 2017; recipes over 35 g fat per 100 g are left out, because INDB counts all of a deep fry's oil as eaten (built by `test/build-indb.py`). Everyday whole foods in `whole.js` (3,248: meats, fish, grains, fruit, vegetables, dairy, tofu and the like) come from
[OpenNutrition](https://www.opennutrition.app), under the Open Database License (`licenses/OpenNutrition-ODbL.txt`); only
foods traced to a national food table (USDA, Canadian Nutrient File, Australian Nutrient Database, Frida) are included.
Its barcoded products are North American and are not included.
