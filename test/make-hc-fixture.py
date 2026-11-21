#!/usr/bin/env python3
# Writes test/fixtures/hc-backup.zip: a made-up Health Connect backup with the tables, columns and units Android
# uses in its export (health_connect_export.db), for the backup reader's tests. No real person's data is in it.
#   python3 test/make-hc-fixture.py
import sqlite3, zipfile, os, random, datetime, tempfile

# The table definitions exactly as Android writes them (from the platform's Health Connect storage code).
SCHEMA = [
    """CREATE TABLE application_info_table (row_id INTEGER PRIMARY KEY, package_name TEXT NOT NULL UNIQUE, app_name TEXT, app_icon BLOB, record_types_used TEXT)""",
    """CREATE TABLE steps_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, start_time INTEGER, start_zone_offset INTEGER, end_time INTEGER, end_zone_offset INTEGER, local_date INTEGER, count INTEGER, local_date_time_start_time INTEGER AS (start_time + 1000 * start_zone_offset), local_date_time_end_time INTEGER AS (end_time + 1000 * end_zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE distance_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, start_time INTEGER, start_zone_offset INTEGER, end_time INTEGER, end_zone_offset INTEGER, local_date INTEGER, distance REAL, local_date_time_start_time INTEGER AS (start_time + 1000 * start_zone_offset), local_date_time_end_time INTEGER AS (end_time + 1000 * end_zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE active_calories_burned_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, start_time INTEGER, start_zone_offset INTEGER, end_time INTEGER, end_zone_offset INTEGER, local_date INTEGER, energy REAL, local_date_time_start_time INTEGER AS (start_time + 1000 * start_zone_offset), local_date_time_end_time INTEGER AS (end_time + 1000 * end_zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE total_calories_burned_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, start_time INTEGER, start_zone_offset INTEGER, end_time INTEGER, end_zone_offset INTEGER, local_date INTEGER, energy REAL, local_date_time_start_time INTEGER AS (start_time + 1000 * start_zone_offset), local_date_time_end_time INTEGER AS (end_time + 1000 * end_zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE sleep_session_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, start_time INTEGER, start_zone_offset INTEGER, end_time INTEGER, end_zone_offset INTEGER, local_date INTEGER, notes TEXT, title TEXT, local_date_time_start_time INTEGER AS (start_time + 1000 * start_zone_offset), local_date_time_end_time INTEGER AS (end_time + 1000 * end_zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE sleep_stages_table (parent_key INTEGER NOT NULL, stage_start_time INTEGER NOT NULL, stage_end_time INTEGER NOT NULL, stage_type INTEGER NOT NULL,  FOREIGN KEY (parent_key) REFERENCES sleep_session_record_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE resting_heart_rate_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, time INTEGER, zone_offset INTEGER, local_date INTEGER, beats_per_minute INTEGER, local_date_time INTEGER AS (time + 1000 * zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE heart_rate_variability_rmssd_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, time INTEGER, zone_offset INTEGER, local_date INTEGER, heart_rate_variability_millis REAL NOT NULL, local_date_time INTEGER AS (time + 1000 * zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE oxygen_saturation_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, time INTEGER, zone_offset INTEGER, local_date INTEGER, percentage REAL, local_date_time INTEGER AS (time + 1000 * zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE respiratory_rate_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, time INTEGER, zone_offset INTEGER, local_date INTEGER, rate REAL, local_date_time INTEGER AS (time + 1000 * zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE weight_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, time INTEGER, zone_offset INTEGER, local_date INTEGER, weight REAL, local_date_time INTEGER AS (time + 1000 * zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE body_fat_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, time INTEGER, zone_offset INTEGER, local_date INTEGER, percentage REAL, local_date_time INTEGER AS (time + 1000 * zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE vo2_max_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, time INTEGER, zone_offset INTEGER, local_date INTEGER, measurement_method INTEGER, vo2_milliliters_per_minute_kilogram REAL, local_date_time INTEGER AS (time + 1000 * zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE exercise_session_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, start_time INTEGER, start_zone_offset INTEGER, end_time INTEGER, end_zone_offset INTEGER, local_date INTEGER, notes TEXT, exercise_type INTEGER, title TEXT, has_route INTEGER, local_date_time_start_time INTEGER AS (start_time + 1000 * start_zone_offset), local_date_time_end_time INTEGER AS (end_time + 1000 * end_zone_offset), planned_exercise_session_id BLOB NULL REFERENCES planned_exercise_session_record_table(uuid) ON DELETE SET NULL, session_rate_of_perceived_exertion REAL,  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE heart_rate_record_table (row_id INTEGER PRIMARY KEY AUTOINCREMENT, uuid BLOB NOT NULL UNIQUE, last_modified_time INTEGER, client_record_id TEXT, client_record_version TEXT, device_info_id INTEGER, app_info_id INTEGER, recording_method INTEGER, dedupe_hash BLOB UNIQUE, start_time INTEGER, start_zone_offset INTEGER, end_time INTEGER, end_zone_offset INTEGER, local_date INTEGER, local_date_time_start_time INTEGER AS (start_time + 1000 * start_zone_offset), local_date_time_end_time INTEGER AS (end_time + 1000 * end_zone_offset),  FOREIGN KEY (device_info_id) REFERENCES device_info_table(row_id) ON DELETE CASCADE,  FOREIGN KEY (app_info_id) REFERENCES application_info_table(row_id) ON DELETE CASCADE)""",
    """CREATE TABLE heart_rate_record_series_table (parent_key INTEGER, beats_per_minute INTEGER, epoch_millis INTEGER,  FOREIGN KEY (parent_key) REFERENCES heart_rate_record_table(row_id) ON DELETE CASCADE)""",
]
OFF = 3600                        # the zone the records were written in: UTC+1
END = datetime.date(2026, 6, 30)  # the last day; 120 days in all
DAYS = 120
ZEPP, FIT, OPENGYM, ANDROID, POLAR, ME = 1, 2, 3, 4, 5, 6


def ms(d, h=0, m=0, s=0):
    z = datetime.timezone(datetime.timedelta(seconds=OFF))
    return int(datetime.datetime(d.year, d.month, d.day, h, m, s, tzinfo=z).timestamp() * 1000)


def main():
    random.seed(7)
    path = os.path.join(tempfile.mkdtemp(), 'health_connect_export.db')
    c = sqlite3.connect(path)
    c.execute('PRAGMA page_size = 4096')
    for s in SCHEMA:
        c.execute(s)
    icon = bytes(random.getrandbits(8) for _ in range(9000))  # an app icon long enough to spill onto overflow pages
    for row in [(ZEPP, 'com.huami.watch.hmwatchmanager', 'Zepp'), (FIT, 'com.google.android.apps.fitness', 'Fit'),
                (OPENGYM, 'ch.duartesantos.opengym', 'openGym'), (ANDROID, 'android', 'Android System'),
                (POLAR, 'fi.polar.polarflow', 'Polar Flow'), (ME, 'app.health.personal', 'Health')]:
        c.execute("INSERT INTO application_info_table (row_id, package_name, app_name, app_icon) VALUES (?,?,?,?)", row + (icon if row[0] == ZEPP else None,))
    n = [0]

    def uid():
        n[0] += 1
        return n[0].to_bytes(16, 'big')

    def interval(table, app, s, e, col=None, v=None, **more):
        cols = {'uuid': uid(), 'app_info_id': app, 'start_time': s, 'start_zone_offset': OFF, 'end_time': e, 'end_zone_offset': OFF, **more}
        if col:
            cols[col] = v
        c.execute(f'INSERT INTO {table} ({", ".join(cols)}) VALUES ({", ".join("?" * len(cols))})', list(cols.values()))
        return c.execute('SELECT last_insert_rowid()').fetchone()[0]

    def point(table, app, t, col, v):
        c.execute(f'INSERT INTO {table} (uuid, app_info_id, time, zone_offset, {col}) VALUES (?,?,?,?,?)', (uid(), app, t, OFF, v))

    first = END - datetime.timedelta(days=DAYS - 1)
    for i in range(DAYS):
        d = first + datetime.timedelta(days=i)
        prev = d - datetime.timedelta(days=1)
        # Steps: the watch in four parts; the phone counts more of the same day; on day 10 only the phone counted.
        if i != 10:
            for h, v in [(8, 2000), (12, 2500), (17, 3000), (20, 1000 + i)]:
                interval('steps_record_table', ZEPP, ms(d, h), ms(d, h, 50), 'count', v)
            interval('distance_record_table', ZEPP, ms(d, 8), ms(d, 21), 'distance', 6400.0)
        interval('steps_record_table', FIT, ms(d, 7), ms(d, 22), 'count', 12000)
        # A walk that crosses midnight into the next day: 600 steps, a third of them before midnight.
        if i == 40:
            interval('steps_record_table', ZEPP, ms(d, 23, 50), ms(d, 23, 50) + 30 * 60000, 'count', 600)
        # Energy in calories: the watch writes only its workouts, the phone the whole day.
        interval('active_calories_burned_record_table', ZEPP, ms(d, 18), ms(d, 19), 'energy', 150000.0)
        interval('active_calories_burned_record_table', ANDROID, ms(d, 0), ms(d, 23, 59), 'energy', 600000.0)
        interval('total_calories_burned_record_table', ANDROID, ms(d, 0), ms(d, 23, 59), 'energy', 2400000.0)
        # The night ending this morning, 23:00 to 06:30, in stages (4 light, 5 deep, 6 REM, 1 awake).
        sid = interval('sleep_session_record_table', ZEPP, ms(prev, 23), ms(d, 6, 30))
        t = ms(prev, 23)
        for typ, mins in [(4, 30), (5, 60), (4, 60), (6, 30), (1, 10), (4, 90), (5, 30), (6, 60), (4, 80)]:
            c.execute('INSERT INTO sleep_stages_table VALUES (?,?,?,?)', (sid, t, t + mins * 60000, typ))
            t += mins * 60000
        # The phone guessed a longer night too; the watch's is the one that counts.
        if i % 3 == 0:
            interval('sleep_session_record_table', FIT, ms(prev, 22), ms(d, 8))
        # A 40-minute nap on the last day.
        if i == DAYS - 1:
            interval('sleep_session_record_table', ZEPP, ms(d, 14), ms(d, 14, 40))
        # Readings: the watch's, and on some days a different figure from the phone that must not be mixed in.
        # Day 20 has only the phone's resting figure; day 21 has none at all.
        if i not in (20, 21):
            point('resting_heart_rate_record_table', ZEPP, ms(d, 7), 'beats_per_minute', 55 + i % 5)
        if i % 4 == 0:
            point('resting_heart_rate_record_table', FIT, ms(d, 9), 'beats_per_minute', 70)
        point('heart_rate_variability_rmssd_record_table', ZEPP, ms(d, 3), 'heart_rate_variability_millis', 60.0 + i % 10)
        point('heart_rate_variability_rmssd_record_table', ZEPP, ms(d, 4), 'heart_rate_variability_millis', 70.0 + i % 10)
        point('respiratory_rate_record_table', ZEPP, ms(d, 4), 'rate', 14.5)
        if i % 2 == 0:
            point('oxygen_saturation_record_table', ZEPP, ms(d, 4), 'percentage', 97.0)
        # A weigh-in each week, in grams: the morning reading, then a later, heavier one.
        if i % 7 == 0:
            point('weight_record_table', FIT, ms(d, 21), 'weight', 81500.0)
            point('weight_record_table', FIT, ms(d, 7, 15), 'weight', 80000.0 - i * 20)
            point('body_fat_record_table', FIT, ms(d, 7, 15), 'percentage', 22.5)
        if i % 30 == 0:
            point('vo2_max_record_table', ZEPP, ms(d, 18), 'vo2_milliliters_per_minute_kilogram', 45.0)
            point('vo2_max_record_table', ZEPP, ms(d, 19), 'vo2_milliliters_per_minute_kilogram', 46.0)
        # Workouts: a walk each evening from the watch, a gym session every fourth day from openGym.
        interval('exercise_session_record_table', ZEPP, ms(d, 18), ms(d, 18, 45), exercise_type=53)
        if i % 4 == 0:
            interval('exercise_session_record_table', OPENGYM, ms(d, 10), ms(d, 11), exercise_type=45, title='  Push day A  ')
        # One this app wrote itself (left out), and one of a kind with no name here (called by its title).
        if i == DAYS - 2:
            interval('exercise_session_record_table', ME, ms(d, 12), ms(d, 12, 30), exercise_type=58, title='Mine')
            interval('exercise_session_record_table', FIT, ms(d, 15), ms(d, 15, 20), exercise_type=999, title='Frisbee')
    # Heart rate for the last 30 days: the watch every 5 minutes through each day and night and every 15 seconds in the
    # evening walk; a chest strap in the same walk (dropped, the watch covered the day).
    for i in range(DAYS - 30, DAYS):
        d = first + datetime.timedelta(days=i)
        prev = d - datetime.timedelta(days=1)
        hid = interval('heart_rate_record_table', ZEPP, ms(prev, 23), ms(d, 23))
        walk = (ms(d, 18), ms(d, 18, 45))
        rows = []
        for k in range(0, 24 * 60, 5):
            t = ms(prev, 23) + k * 60000
            if walk[0] <= t <= walk[1]:
                continue
            rows.append((hid, 50 + (k // 5) % 6 if t < ms(d, 6, 30) else 72 + (k // 5) % 9, t))
        rows += [(hid, 110 + (k // 20) % 20, walk[0] + k * 15000) for k in range(45 * 4)]
        c.executemany('INSERT INTO heart_rate_record_series_table VALUES (?,?,?)', rows)
        pid = interval('heart_rate_record_table', POLAR, walk[0], walk[1])
        c.executemany('INSERT INTO heart_rate_record_series_table VALUES (?,?,?)', [(pid, 160, walk[0] + k * 1000) for k in range(0, 45 * 60, 30)])
    # Day 21 had no resting figure and no watch heart rate: only a strap, around midday.
    d21 = first + datetime.timedelta(days=21)
    pid = interval('heart_rate_record_table', POLAR, ms(d21, 12), ms(d21, 13, 40))
    c.executemany('INSERT INTO heart_rate_record_series_table VALUES (?,?,?)', [(pid, 60 + k % 40, ms(d21, 12) + k * 60000) for k in range(100)])
    c.commit()
    c.close()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'hc-backup.zip')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(path, 'health_connect_export.db')
    print(out, os.path.getsize(path), 'bytes unpacked,', os.path.getsize(out), 'packed')


main()
