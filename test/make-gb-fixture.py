#!/usr/bin/env python3
# Writes test/fixtures/gadgetbridge.zip: a made-up Gadgetbridge "Export zip" (database/Gadgetbridge inside) for the
# Gadgetbridge reader's tests, with the tables exactly as Gadgetbridge creates them: its sample tables are WITHOUT
# ROWID, keyed by (TIMESTAMP, DEVICE_ID). No real person's data is in it.
#   python3 test/make-gb-fixture.py
#
# 40 days ending 30 June 2026, in UTC (the test's own zone): an Amazfit Bip 6 worn every day, and an older Amazfit Bip
# worn on four of those days for a few hours, which must not add its steps to the Bip 6's.
import sqlite3, zipfile, os, random, datetime, tempfile, struct, json

# The CREATE TABLE text Gadgetbridge's DAO generator writes (GBDaoGenerator + its dao.ftl template).
def samples(name, cols, timestamp='INTEGER'):
    body = '"TIMESTAMP" %s  NOT NULL ,"DEVICE_ID" INTEGER  NOT NULL ,"USER_ID" INTEGER NOT NULL ,' % timestamp + ''.join(cols)
    return 'CREATE TABLE "%s" (%sPRIMARY KEY ("TIMESTAMP" ,"DEVICE_ID" ) ON CONFLICT REPLACE) WITHOUT ROWID;' % (name, body)

SCHEMA = [
    'CREATE TABLE "USER" ("_id" INTEGER PRIMARY KEY AUTOINCREMENT ,"NAME" TEXT NOT NULL ,"BIRTHDAY" INTEGER NOT NULL ,"GENDER" INTEGER NOT NULL );',
    'CREATE TABLE "DEVICE" ("_id" INTEGER PRIMARY KEY AUTOINCREMENT ,"NAME" TEXT NOT NULL ,"MANUFACTURER" TEXT NOT NULL ,"IDENTIFIER" TEXT NOT NULL UNIQUE ,"TYPE" INTEGER NOT NULL ,"TYPE_NAME" TEXT NOT NULL ,"MODEL" TEXT,"ALIAS" TEXT,"PARENT_FOLDER" TEXT);',
    samples('MI_BAND_ACTIVITY_SAMPLE', ['"RAW_INTENSITY" INTEGER NOT NULL ,', '"STEPS" INTEGER NOT NULL ,', '"RAW_KIND" INTEGER NOT NULL ,', '"HEART_RATE" INTEGER NOT NULL ,']),
    samples('HUAMI_EXTENDED_ACTIVITY_SAMPLE', ['"RAW_INTENSITY" INTEGER NOT NULL ,', '"STEPS" INTEGER NOT NULL ,', '"RAW_KIND" INTEGER NOT NULL ,', '"HEART_RATE" INTEGER NOT NULL ,',
                                              '"UNKNOWN1" INTEGER,', '"SLEEP" INTEGER,', '"DEEP_SLEEP" INTEGER,', '"REM_SLEEP" INTEGER,']),
    samples('HUAMI_SLEEP_SESSION_SAMPLE', ['"DATA" BLOB,']),
    samples('HUAMI_HEART_RATE_RESTING_SAMPLE', ['"UTC_OFFSET" INTEGER NOT NULL ,', '"HEART_RATE" INTEGER NOT NULL ,']),
    samples('HUAMI_SPO2_SAMPLE', ['"TYPE_NUM" INTEGER NOT NULL ,', '"SPO2" INTEGER NOT NULL ,']),
    samples('HUAMI_SLEEP_RESPIRATORY_RATE_SAMPLE', ['"UTC_OFFSET" INTEGER NOT NULL ,', '"RATE" INTEGER NOT NULL ,']),
    samples('HUAMI_STRESS_SAMPLE', ['"TYPE_NUM" INTEGER NOT NULL ,', '"STRESS" INTEGER NOT NULL ,']),
    samples('GENERIC_HRV_VALUE_SAMPLE', ['"VALUE" INTEGER NOT NULL ,']),
    samples('HUAMI_PAI_SAMPLE', ['"UTC_OFFSET" INTEGER NOT NULL ,', '"PAI_LOW" REAL NOT NULL ,', '"PAI_MODERATE" REAL NOT NULL ,', '"PAI_HIGH" REAL NOT NULL ,', '"TIME_LOW" INTEGER NOT NULL ,',
                                 '"TIME_MODERATE" INTEGER NOT NULL ,', '"TIME_HIGH" INTEGER NOT NULL ,', '"PAI_TODAY" REAL NOT NULL ,', '"PAI_TOTAL" REAL NOT NULL ,']),
    samples('GENERIC_TEMPERATURE_SAMPLE', ['"TEMPERATURE" REAL NOT NULL ,', '"TEMPERATURE_TYPE" INTEGER NOT NULL ,', '"TEMPERATURE_LOCATION" INTEGER NOT NULL ,']),
    samples('GENERIC_WEIGHT_SAMPLE', ['"WEIGHT_KG" REAL NOT NULL ,', '"IMPEDANCE_OHM" INTEGER,']),
    'CREATE TABLE "BASE_ACTIVITY_SUMMARY" ("_id" INTEGER PRIMARY KEY AUTOINCREMENT ,"NAME" TEXT,"START_TIME" INTEGER NOT NULL ,"END_TIME" INTEGER NOT NULL ,"OVERRIDE_ACTIVITY_KIND" INTEGER NOT NULL ,"ACTIVITY_KIND" INTEGER NOT NULL ,"BASE_LONGITUDE" INTEGER,"BASE_LATITUDE" INTEGER,"BASE_ALTITUDE" INTEGER,"GPX_TRACK" TEXT,"RAW_DETAILS_PATH" TEXT,"HEADER_PHOTO" TEXT,"DEVICE_ID" INTEGER NOT NULL ,"USER_ID" INTEGER NOT NULL ,"SUMMARY_DATA" TEXT,"RAW_SUMMARY_DATA" BLOB);',
]
END = datetime.date(2026, 6, 30)
DAYS = 40
OLD, BIP6 = 1, 2
UTC = datetime.timezone.utc


def sec(d, h=0, m=0):
    return int(datetime.datetime(d.year, d.month, d.day, h, m, tzinfo=UTC).timestamp())


def night_blob(report, midnight, stages, avg_hr=58, score=81, size=0x254):
    # A Zepp OS sleep report as the watch sends it and Gadgetbridge stores it: the report time and the midnight the
    # stages count from (both seconds), the average heart rate and score, the number of stages at 0x54, then each
    # stage as start and end minute (counted from the midnight before, both ends included) and its type.
    b = bytearray(size)
    struct.pack_into('<II', b, 0, report, midnight)
    b[8] = b[9] = 1
    struct.pack_into('<HH', b, 0x0a, stages[0][0], stages[-1][1])
    b[0x15] = avg_hr; b[0x16] = score
    b[0x54] = len(stages)
    for i, (s, e, t) in enumerate(stages):
        struct.pack_into('<HHB', b, 0x56 + 5 * i, s, e, t)
    return bytes(b)


def main():
    random.seed(11)
    path = os.path.join(tempfile.mkdtemp(), 'Gadgetbridge')
    c = sqlite3.connect(path)
    c.execute('PRAGMA page_size = 4096')
    for s in SCHEMA:
        c.execute(s)
    c.execute('CREATE TABLE android_metadata (locale TEXT)')
    c.execute("INSERT INTO android_metadata VALUES ('en_GB')")
    c.execute('INSERT INTO USER VALUES (1, "anonymous", 0, 2)')
    c.execute('INSERT INTO DEVICE VALUES (?,?,?,?,?,?,?,?,?)', (OLD, 'Amazfit Bip', 'Huami', 'C1:00:00:00:00:01', 0, 'AMAZFITBIP', None, None, None))
    c.execute('INSERT INTO DEVICE VALUES (?,?,?,?,?,?,?,?,?)', (BIP6, 'Amazfit Bip 6', 'Huami', 'C2:00:00:00:00:02', 0, 'AMAZFITBIP6', None, None, None))
    first = END - datetime.timedelta(days=DAYS - 1)
    act = []
    for i in range(DAYS):
        d = first + datetime.timedelta(days=i)
        base = sec(d)
        # Every minute of the day from the Bip 6: steps between 07:00 and 21:00, heart rate all day, asleep until 06:30.
        for m in range(1440):
            t = base + m * 60
            steps = 10 if 7 * 60 <= m < 21 * 60 else 0        # 840 minutes x 10 = 8400 a day
            hr = 52 if m < 390 else 70 + (m % 7)
            if i == 5 and 600 <= m < 660:                     # day 6: no heart rate for an hour (watch off)
                hr = 255
            kind = 120 if m < 390 else 1
            act.append((t, BIP6, 1, 30, steps, kind, hr, 0, 0, 0, 0))
    c.executemany('INSERT INTO HUAMI_EXTENDED_ACTIVITY_SAMPLE VALUES (?,?,?,?,?,?,?,?,?,?,?)', act)
    # The old Bip, worn for three hours on four days alongside the Bip 6: its steps must not be added.
    old = []
    for i in (10, 11, 12, 13):
        base = sec(first + datetime.timedelta(days=i))
        for m in range(9 * 60, 12 * 60):
            old.append((base + m * 60, OLD, 1, 30, 50, 1, 90))
    c.executemany('INSERT INTO MI_BAND_ACTIVITY_SAMPLE VALUES (?,?,?,?,?,?,?)', old)

    # Sleep: each morning's report names the midnight inside the night, and its stages count from the midnight before
    # that, so they run from the evening before (minute 1380 is 23:00) to the morning (1440 + 390 = 06:30). On day 20 the watch sent a first, shorter report and then
    # a revised one; only the revision counts. On day 30 a nap from 14:00 to 14:44 comes as a second report.
    nights = []
    for i in range(1, DAYS):
        d = first + datetime.timedelta(days=i)
        mid = sec(d)                                             # the midnight inside the night; stages count from the one before
        st = [(1380, 1439, 4), (1440, 1529, 5), (1530, 1619, 4), (1620, 1634, 7), (1635, 1724, 8), (1725, 1829, 4)]
        if i == 20:
            nights.append((sec(d, 6, 40) * 1000, BIP6, 1, night_blob(sec(d, 6, 40), mid, st[:3])))
            nights.append((sec(d, 9, 0) * 1000, BIP6, 1, night_blob(sec(d, 9, 0), mid, st)))
        else:
            # Every seventh report is longer than an index page holds, so it continues on overflow pages.
            nights.append((sec(d, 6, 40) * 1000, BIP6, 1, night_blob(sec(d, 6, 40), mid, st, size=2600 if i % 7 == 0 else 0x254)))
        if i == 30:
            nights.append((sec(d, 15, 0) * 1000, BIP6, 1, night_blob(sec(d, 15, 0), mid, [(1440 + 840, 1440 + 884, 4)])))
    c.executemany('INSERT INTO HUAMI_SLEEP_SESSION_SAMPLE VALUES (?,?,?,?)', nights)

    # Resting heart rate once a day; the last day's at local midnight in UTC+5:30, which is 18:30 the day before in UTC.
    rest = [(sec(first + datetime.timedelta(days=i)) * 1000, BIP6, 1, 0, 50 + i % 5) for i in range(DAYS - 1)]
    rest.append(((sec(END) - 19800) * 1000, BIP6, 1, 22 * 900000, 49))
    c.executemany('INSERT INTO HUAMI_HEART_RATE_RESTING_SAMPLE VALUES (?,?,?,?,?)', rest)
    # Blood oxygen and breathing rate overnight, HRV every half hour of the night and two readings at noon.
    c.executemany('INSERT INTO HUAMI_SPO2_SAMPLE VALUES (?,?,?,?,?)', [(sec(first + datetime.timedelta(days=i), 3) * 1000, BIP6, 1, 0, 96 + i % 3) for i in range(DAYS)])
    c.executemany('INSERT INTO HUAMI_SLEEP_RESPIRATORY_RATE_SAMPLE VALUES (?,?,?,?,?)', [(sec(first + datetime.timedelta(days=i), 4) * 1000, BIP6, 1, 0, 14 + i % 2) for i in range(DAYS)])
    c.executemany('INSERT INTO HUAMI_STRESS_SAMPLE VALUES (?,?,?,?,?)', [(sec(first + datetime.timedelta(days=i), 12) * 1000, BIP6, 1, 0, 30) for i in range(DAYS)])
    # PAI twice a day (the later one is the day's), and wrist temperature at 02:00 and 04:00 in the night and once at noon.
    pai = []
    for i in range(DAYS):
        d = first + datetime.timedelta(days=i)
        pai.append((sec(d, 12) * 1000, BIP6, 1, 0, 1.0, 2.0, 0.0, 30, 20, 0, 3.0, 60.0 + i))
        pai.append((sec(d, 22) * 1000, BIP6, 1, 0, 1.0, 4.0, 1.0, 40, 30, 5, 6.0 + i % 3, 62.5 + i))
    c.executemany('INSERT INTO HUAMI_PAI_SAMPLE VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', pai)
    temp = []
    for i in range(1, DAYS):
        d = first + datetime.timedelta(days=i)
        temp += [(sec(d, 2) * 1000, BIP6, 1, 33.5 + (i % 4) * 0.1, 0, 0), (sec(d, 4) * 1000, BIP6, 1, 33.7 + (i % 4) * 0.1, 0, 0), (sec(d, 12) * 1000, BIP6, 1, 31.0, 0, 0)]
    c.executemany('INSERT INTO GENERIC_TEMPERATURE_SAMPLE VALUES (?,?,?,?,?,?)', temp)
    hrv = []
    for i in range(1, DAYS):
        d = first + datetime.timedelta(days=i)
        for k in range(14):                                      # 23:00 to 05:30, every half hour
            hrv.append(((sec(d) - 3600 + k * 1800) * 1000, BIP6, 1, 40 + k % 3))
        hrv.append((sec(d, 12) * 1000, BIP6, 1, 20))
        hrv.append((sec(d, 12, 30) * 1000, BIP6, 1, 22))
    c.executemany('INSERT INTO GENERIC_HRV_VALUE_SAMPLE VALUES (?,?,?,?)', hrv)
    # Two weigh-ins on one day: the morning's is the day's.
    c.executemany('INSERT INTO GENERIC_WEIGHT_SAMPLE VALUES (?,?,?,?,?)', [(sec(END, 7) * 1000, BIP6, 1, 81.4, None), (sec(END, 20) * 1000, BIP6, 1, 82.6, None)])

    # Workouts: a run, strength training, a walk with a kind Gadgetbridge does not name, and one from the old Bip.
    w = [
        ('Outdoor run', sec(END - datetime.timedelta(days=2), 18), sec(END - datetime.timedelta(days=2), 18, 30), 0x10, BIP6, {'active_calories': {'value': 310, 'unit': 'calories_unit'}, 'averageHR': {'value': 151, 'unit': 'bpm'}}),
        (None, sec(END - datetime.timedelta(days=1), 17), sec(END - datetime.timedelta(days=1), 17, 45), 0x00200000, BIP6, None),
        ('Evening stroll', sec(END, 19), sec(END, 19, 20), 0x7fff0000, BIP6, {'caloriesBurnt': {'value': 80, 'unit': 'calories_unit'}}),
        ('Old run', sec(first + datetime.timedelta(days=10), 9), sec(first + datetime.timedelta(days=10), 9, 40), 0x10, OLD, None),
    ]
    for n, (name, s, e, kind, dev, summ) in enumerate(w, 1):
        c.execute('INSERT INTO BASE_ACTIVITY_SUMMARY VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (n, name, s * 1000, e * 1000, 0, kind, None, None, None, None, None, None, dev, 1, json.dumps(summ) if summ else None, None))
    c.commit()
    c.close()
    out = os.path.join(os.path.dirname(__file__), 'fixtures', 'gadgetbridge.zip')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('gadgetbridge.json', json.dumps({'appVersionName': '0.89.0', 'backupVersion': 1}))
        z.write(path, 'database/Gadgetbridge')
        z.writestr('preferences/global.json', '{}')
    print(out, os.path.getsize(out), 'bytes')


main()
