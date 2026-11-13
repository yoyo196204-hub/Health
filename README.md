# Health

A personal fat-loss, training and recovery app for one person, built on published evidence and on that
person's own data. Every number on screen has a "why" link to the reasoning and the studies behind it.

You lift in [openGym](https://github.com/DuarteSantos8/openGym); Health plans the training and reads it back. The plan
goes to openGym as one file, the sets come back through openGym's backup folder and Health Connect, and they join the
Amazfit and Polar H9 data that decides how hard each day should be.

## Two ways to run it

- **Android app**: the full experience. Download `health.apk` from the
  [latest release](https://github.com/yoyo196204-hub/Health/releases/latest). Steps, sleep, heart rate, workouts and weight arrive
  by themselves from Health Connect each time the app opens, and again whenever you pull down on any tab. The Polar H9
  connects over the phone's own Bluetooth and is remembered. Haptics come from the phone's vibration engine (composed
  clicks where the phone supports them). Reminders for the morning check, the weekly waist and the evening food log
  arrive as notifications, only when the thing is still undone. A daily backup can go to a folder you choose. The app has
  **no internet permission**, so nothing in it can leave the phone.
- **In Chrome** (`index.html`, served by GitHub Pages): the same screens, with the H9 over Web Bluetooth and
  Amazfit data from a Zepp CSV export. "Move my data to the app" in Me hands everything to the Android app
  in one step.

## Installing and updating, from the phone

Every version is built on GitHub and signed with the app's one permanent key, so each new version installs
straight over the last and keeps everything in it. No computer is involved at any point.

- **Update**: open the [latest release](https://github.com/yoyo196204-hub/Health/releases/latest) on the phone,
  tap `health.apk`, then Update. Do this on each device you use.
- **Only ever install from the Releases page.** A build made anywhere else is named "Health test", has its own ID
  and installs separately; it cannot replace or touch the real app.
- **Moving from version 2** (one time only): version 2 was signed with a key that no longer exists, so version 3
  is a separate app and installs next to it. In the old app: Me › Backup › Export. In the new app: Today ›
  Import a backup, pick that file, check your history is there, then uninstall the old app. Allow Health
  Connect, pick the backup folder and connect the H9 again in the new app.

## Training in openGym

[openGym](https://github.com/DuarteSantos8/openGym) and Health work as a pair, through files on the phone (neither
app needs the internet for it). openGym is where you lift: its animations, rest timer, watch app and 5,600 exercises.
Health stays the brain: the plan, recovery, food, weight, and the analysis of everything you lift.

**Health → openGym: your plan.** Me › Training › Train in openGym makes `Health plan for openGym.json`: your
programme as Health has it today (gym or home kit, shoulder care, anything pain has taken out), with rep ranges, double
progression, the next loads, rest times, the cues and the weekdays, and also:

- up to three **backup exercises** per slot from openGym's catalogue, hand-picked for the same main muscle and clear of
  the shoulder's provocative positions (only dumbbell, band or floor ones at home), for when a machine is taken;
- a **warm-up ramp** before each session's first big lift;
- an **8-week block** that runs the routines in rotation (a missed day never skips a session) with an effort target of
  RPE 8. There is no planned deload week: in a randomised trial a mid-programme deload week cost strength and gained no
  muscle (Coleman 2024). Stalls drop a load 10%, and a low HRV week makes the day an easy one.

openGym's double progression is the same rule as Health's, so the loads keep moving the same way there.

1. Health: Me › Training › **Save the plan file** (in the app, with openGym's folder linked: **Put the plan in the openGym folder**).
2. openGym: **Plan** › share icon (top right) › **Import a plan file** › pick `Health plan for openGym.json`.
3. Turn on **Use this weekly schedule**, then **Add to my plan**. The routines are named "Day A (Health)" and so on.
   To run the block: Plan › menu › Programmes › the Health block › Start programme.
4. When the plan changes (another programme, home or gym, shoulder care, an exercise out after pain), Health says so on
   Train and in Me. Delete the old "(Health)" routines in openGym, then import the new file. New loads alone need no new
   file: openGym works those out itself.

**openGym → Health: what you lifted**, two ways that work together:

- **Health Connect**: in openGym, Settings › Integrations › Health Connect › turn on workouts and heart rate from your
  watch. Each finished openGym workout appears in Health straight away, with the heart rate the Bip saved during it.
- **openGym's backup folder** brings the sets themselves: every completed work set (no warm-ups, no unticked sets), timed holds, cardio,
and the weigh-ins you typed in openGym. Sessions count in Review, the muscle map, strength and Health's next targets.
After a session with shoulder-loading exercises, Training asks how the shoulder felt; pain swaps the exercise next time
and the plan file says it needs sending again.
A day you logged in Health is never overwritten; a session that came from openGym follows openGym's later edits, moves
and deletions, and keeps any shoulder report you gave it in Health. Change a set of it in Health and it becomes
Health's own.

- **Android app, automatic**: in openGym, Settings › Data & backup › turn on **Auto-backup on changes**. In Health,
  Me › Data sources › openGym › **Link openGym's folder** and choose Documents › openGym (the picker opens there).
  The first read shows what would come in; after you accept it, Health reads openGym's newest backup by itself each
  time it opens, and only when it has changed.
- **By hand, anywhere**: openGym's **Export backup** or **Export as CSV** (workouts), then Me › Data sources ›
  openGym › Choose an openGym file. A copy is kept first, so it can be undone.

Exercises in Health's plan go to the same exercise in openGym's library and come back as Health's own. Anything else
you log in openGym arrives with its name and the muscles it trains, from `opengym-ids.js` (see Credits).

## Screens

| Tab | What it is for |
| --- | --- |
| Today | What is due (morning check, weigh-in, weekly waist, shoulder check, a plan to resend); calories, protein and fibre left; one concrete suggestion; weight, steps, sleep; what is next in openGym and how hard to go; the meals |
| Recovery | One verdict for the day; the H9 morning check with its live beats and a result card; HRV against your normal range, read with morning heart rate; resting and sleeping heart rate; sleep; the watch's overnight HRV and breathing rate against their own baselines; watch-vs-strap agreement |
| Training | The next openGym session with today's recovery guidance; the shoulder check; sessions with their sets and watch heart rate; strength per lift; the muscle map; cardio with the H9 (live trace, zones, α1) and the aerobic threshold it gives |
| Review | The week as a matrix, the actions it triggers, the energy ledger, body trend and projections, links in your own data |
| Me | Your numbers, and a page each for goal, training, profile, data sources, backup and data, feel, and the evidence |

## How the numbers are made

- **Weight trend**: each weigh-in moves a smoothed line a tenth of the way; the weekly rate is the Theil–Sen
  slope (median of pairwise slopes) over 21 days, so one heavy evening cannot swing it. A weigh-in far from
  the trend asks whether it was a typo.
- **Calories**: Mifflin-St Jeor plus steps and training, moving gradually to the burn your own complete logging
  days imply. The target is recalculated on Mondays and moves by at most 150 kcal per update; changing goal,
  pace or profile recalculates at once. Pace is a setting: maintain, slow 0.4%, steady 0.6%, faster 0.8% a week,
  never more than a quarter of daily burn.
- **Aerobic threshold**: during strap cardio, α1 of detrended fluctuation analysis over each two minutes of beats,
  every 30 seconds, windows with over 5% corrected beats dropped; the heart rate where α1 crosses 0.75 (Rogers 2021).
- **Overnight watch data**: the Bip's HRV and breathing rate each against their own 4-week baseline, never mixed with
  the strap; they can nudge a day to "listen to your body", never to "keep it easy".
- **Lifting**: double progression on completed reps. Every set at the top of the range adds the smallest
  weight step; sets under the bottom hold the load; three such sessions drop it 10%. On a day Recovery says
  "keep it easy", the session offers one set fewer and no increases.
- **Shoulder care**: overhead pressing and flyes are swapped for movements that never reach the provocative
  end range; after a shoulder exercise you can report fine, niggle or pain. A niggle holds the load, pain
  swaps the exercise next time, pain twice takes it out of the plan until you bring it back.
- **Volume**: one set counts 1 for the muscle an exercise is for and 0.5 for one it trains on the way.

## Your data

- Saved on the phone, with a second private copy inside the app, yesterday's automatic backup, and the daily
  file in your backup folder.
- Anything that removes data (removing old data, erasing, importing) keeps a copy first and offers Undo;
  the removals themselves need a press and hold.
- Me › Backup and data shows what is stored and can **remove data older than** 3, 6, 12 or 24 months, for food,
  weigh-ins, watch data or training separately.
- **openGym**: see [Training in openGym](#training-in-opengym).
- **Halftone**: Me › Backup and data › Bring in Halftone takes a Halftone backup file and adds its sessions,
  shoulder reports, bodyweight and cardio. Halftone's five demonstration sessions are recognised and left out,
  and any day already in Health keeps Health's version.

## Code

Plain JavaScript, no build step. Scripts load in this order:

| File | Holds |
| --- | --- |
| `lib.js` | Dates, formatting, statistics (Theil–Sen, Bland–Altman agreement) |
| `data.js` | Foods, goal paces, the evidence library |
| `exercises.js` | The exercise library, programmes, home substitutes, shoulder rules, warm-up |
| `opengym-ids.js` | openGym's exercise numbers with their names and muscles (see Credits) |
| `body-data.js` | Muscle map outlines (from react-body-highlighter, MIT) |
| `store.js` | Storage, schema and migration, snapshots, removing old data, Halftone import |
| `model.js` | Nutrition, weight, heart, HRV, sleep and activity conclusions |
| `train.js` | Which session is next, the plan, progression, volume |
| `native.js` | The bridge to the Android app; one merge path for every outside data source |
| `feel.js` | Haptics, screen transitions, sheets, undo toasts, press and hold, pull to refresh |
| `ui.js` | Shared building blocks, the chart and the muscle map |
| `h9.js` | The strap: connection, live trace, morning HRV check, cardio with α1 |
| `watch.js` | Zepp CSV import |
| `opengym.js` | openGym: its backup and CSV coming in, the folder link, Health's plan as an openGym plan file with backups and the block |
| `view-*.js` | One file per screen |
| `app.js` | State, routing, events |

Exercise animations live in openGym. Tests: `node test/run.js`.

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

`opengym-ids.js` lists exercise numbers from [openGym](https://github.com/DuarteSantos8/openGym)'s catalogue, with only
the 1,324 entries whose names and muscles come from ExerciseDB v1 by AscendAPI via
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT; the notice is in the file).
No openGym code, descriptions, pictures or animations are copied into Health.
