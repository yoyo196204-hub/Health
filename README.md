# Health

A personal fat-loss, training and recovery app for one person, built on published evidence and on that
person's own data. Every number on screen has a "why" link to the reasoning and the studies behind it.

Version 3 folds in the training engine from Halftone: an exercise library with demonstration clips, double
progression, shoulder care, swaps, a rest timer, plate maths and a muscle map.

## Two ways to run it

- **Android app**: the full experience. Download `health.apk` from the
  [latest release](https://github.com/yoyo196204-hub/Health/releases/latest). Steps, sleep, heart rate, workouts and weight arrive
  by themselves from Health Connect each time the app opens. The Polar H9 connects over the phone's own
  Bluetooth and is remembered. Haptics use the phone's own engine, and the rest timer vibrates even with the
  screen off. A daily backup can go to a folder you choose. The app has **no internet permission**, so
  nothing in it can leave the phone.
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

## Screens

| Tab | What it is for |
| --- | --- |
| Today | Calories, protein and fibre left; one concrete suggestion; weight, steps, sleep; what training is next; the meals (tap any entry to change or remove it) |
| Train | Today's session one exercise at a time: demo, the load and reps to aim for and why, one tap per set, rest timer, swaps, plate maths, shoulder check. The week's muscle map, cardio with the H9 or typed in |
| Recovery | One verdict for the day; the H9 morning check; HRV against your normal range; resting and sleeping heart rate; sleep; watch-vs-strap agreement |
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
| `body-data.js` | Muscle map outlines (from react-body-highlighter, MIT) |
| `store.js` | Storage, schema and migration, snapshots, removing old data, Halftone import |
| `model.js` | Nutrition, weight, heart, HRV, sleep and activity conclusions |
| `train.js` | Which session is next, today's plan, progression, volume |
| `native.js` | The bridge to the Android app; one merge path for every outside data source |
| `feel.js` | Haptics, screen transitions, sheets, undo toasts, press and hold |
| `ui.js` | Shared building blocks, the chart and the muscle map |
| `h9.js` | The strap: connection, live workout, morning HRV check |
| `watch.js` | Zepp CSV import |
| `view-*.js` | One file per screen |
| `app.js` | State, routing, events |

Exercise demonstrations are in `media/`. Engine tests: `node test/run.js`.

The Android project is in `android/`. Its build copies the web files and `media/` from the repository root
into the app, so there is one copy of the code.

Builds run in GitHub Actions (`.github/workflows/android.yml`) on every push. On the default branch the APK is
signed with `android/release.p12`, its signature is checked against the permanent certificate
(SHA-256 `7d9dfafd…682c6650`), and it is published as a release. The key file is encrypted; its password is only
in the repository secret `HEALTH_KEYSTORE_PASSWORD` (keep a copy of it somewhere safe as well). Without that
password a build is signed with a throwaway key and becomes "Health test" (`app.health.personal.test`).
