# Health

A personal fat-loss, training and recovery app for one person, built on published evidence and on that
person's own data. Every number on screen has a "why" link to the reasoning and the studies behind it.

## Two ways to run it

- **Android app** (`health.apk`): the full experience. Steps, sleep, heart rate, workouts and weight arrive
  by themselves from Health Connect each time the app opens. The Polar H9 connects over the phone's own
  Bluetooth and is remembered. A daily backup can go to a folder you choose. The app has **no internet
  permission**, so nothing in it can leave the phone.
- **In Chrome** (`index.html`, served by GitHub Pages): the same screens, with the H9 over Web Bluetooth and
  Amazfit data from a Zepp CSV export. "Move my data to the app" in Me hands everything to the Android app
  in one step.

## Screens

| Tab | What it is for |
| --- | --- |
| Today | Calories, protein and fibre left; one concrete suggestion; weight, steps, sleep; the meals |
| Train | The A/B/C lifting session, cardio with the H9, every watch workout, WHO minutes, sets per muscle |
| Recovery | One verdict for the day; the H9 morning check; HRV against your normal range; resting and sleeping heart rate; sleep; watch-vs-strap agreement |
| Review | The week as a matrix, the actions it triggers, the energy ledger, body trend and projections, links in your own data |
| Me | Targets, data sources, profile, backup, the evidence library |

## Code

Plain JavaScript, no build step. Scripts load in this order:

| File | Holds |
| --- | --- |
| `lib.js` | Dates, formatting, statistics (including Bland–Altman agreement) |
| `data.js` | Foods, the training plan, the evidence library |
| `store.js` | Storage, schema sanitiser, backups |
| `model.js` | Every conclusion drawn from the data: targets, zones, calibration, HRV, sleep, activity, projections |
| `native.js` | The bridge to the Android app; one merge path for every outside data source |
| `ui.js` | Shared building blocks and the chart |
| `h9.js` | The strap: connection, live workout, morning HRV check |
| `watch.js` | Zepp CSV import |
| `view-*.js` | One file per screen |
| `app.js` | State, routing, events |

The Android project is in `android/`. Its build copies the web files from the repository root into the
app, so there is one copy of the code. Build with `gradle -p android assembleRelease` and copy
`android/app/build/outputs/apk/release/app-release.apk` to `health.apk`.
