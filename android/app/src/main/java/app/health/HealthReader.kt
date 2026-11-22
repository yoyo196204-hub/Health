package app.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import java.util.TreeMap
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.reflect.KClass

/**
 * Reads everything Health Connect holds that the app can use, reduced to daily figures.
 * Every data type is read on its own: a type that is not allowed, or fails, is skipped and the rest still arrive.
 */
class HealthReader(private val a: MainActivity) {
    private val types: Map<String, KClass<out Record>> = linkedMapOf(
        "steps" to StepsRecord::class, "distance" to DistanceRecord::class,
        "active" to ActiveCaloriesBurnedRecord::class, "total" to TotalCaloriesBurnedRecord::class,
        "sleep" to SleepSessionRecord::class, "heart" to HeartRateRecord::class, "resting" to RestingHeartRateRecord::class,
        "hrv" to HeartRateVariabilityRmssdRecord::class, "weight" to WeightRecord::class, "bodyfat" to BodyFatRecord::class,
        "exercise" to ExerciseSessionRecord::class, "spo2" to OxygenSaturationRecord::class,
        "breathing" to RespiratoryRateRecord::class, "vo2" to Vo2MaxRecord::class,
    )
    private val perm = types.mapValues { HealthPermission.getReadPermission(it.value) }

    private fun sdk() = when (HealthConnectClient.getSdkStatus(a)) {
        HealthConnectClient.SDK_AVAILABLE -> "ok"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update"
        else -> "none"
    }
    private fun client() = HealthConnectClient.getOrCreate(a)
    private fun historyAvailable(c: HealthConnectClient) = try {
        c.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
    } catch (e: Throwable) { false }

    fun status() {
        val s = sdk()
        if (s != "ok") { a.emit("hc-status", JSONObject().put("sdk", s).toString()); return }
        a.lifecycleScope.launch {
            val out = JSONObject().put("sdk", "ok").put("all", types.size)
            try {
                val granted = client().permissionController.getGrantedPermissions()
                out.put("granted", JSONArray(perm.filterValues { it in granted }.keys))
                out.put("history", HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in granted)
            } catch (e: Exception) { out.put("granted", JSONArray()).put("error", e.message ?: "unknown") }
            a.emit("hc-status", out.toString())
        }
    }

    fun request() {
        when (sdk()) {
            "ok" -> {
                val want = perm.values.toMutableSet()
                if (historyAvailable(client())) want += HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
                try { a.healthPermissions.launch(want) } catch (e: Exception) { status() }
            }
            else -> status()
        }
    }

    fun read(json: String) {
        val req = try { JSONObject(json) } catch (e: Exception) { JSONObject() }
        val days = req.optInt("days", 30).coerceIn(1, 120)
        val windows = req.optJSONArray("windows") ?: JSONArray()
        a.lifecycleScope.launch(Dispatchers.IO) {
            val out = try { collect(days, windows) } catch (e: Throwable) {
                JSONObject().put("error", "Could not read Health Connect: ${e.message ?: e.javaClass.simpleName}")
            }
            a.emit("hc-data", out.toString())
        }
    }

    // Filled while reading: for each kind of data, when its newest record was written into Health Connect (by which
    // app), and which apps wrote anything. The write time is what tells "Zepp has not passed new data on yet" apart
    // from "this app has not read it yet"; the read time alone says nothing about how fresh the data is.
    private var wrote = HashMap<String, Pair<Long, String>>()
    private var origins = HashSet<String>()
    // When each app last wrote anything: the watch app named on screen is the one still writing.
    private var seen = HashMap<String, Long>()
    private val keyOf: Map<KClass<out Record>, String> = types.entries.associate { it.value to it.key }

    private suspend fun <T : Record> readAll(c: HealthConnectClient, type: KClass<T>, range: TimeRangeFilter, each: (T) -> Unit) {
        var token: String? = null
        var pages = 0
        val key = keyOf[type]
        do {
            val page = c.readRecords(ReadRecordsRequest(type, range, pageSize = 1000, pageToken = token))
            for (r in page.records) {
                val pkg = r.metadata.dataOrigin.packageName
                if (pkg != a.packageName) {
                    origins += pkg
                    val w = r.metadata.lastModifiedTime.toEpochMilli()
                    if (w > (seen[pkg] ?: 0L)) seen[pkg] = w
                    if (key != null && w > (wrote[key]?.first ?: 0L)) wrote[key] = w to pkg
                }
                each(r)
            }
            token = page.pageToken
        } while (token != null && ++pages < 300)
    }

    private suspend fun collect(n: Int, windows: JSONArray): JSONObject {
        val c = client()
        val granted = c.permissionController.getGrantedPermissions()
        fun has(t: String) = perm[t] in granted
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val from = today.minusDays(n - 1L)
        val days = TreeMap<LocalDate, JSONObject>()
        fun day(d: LocalDate): JSONObject? = if (d < from || d > today) null else days.getOrPut(d) { JSONObject() }
        fun dateOf(t: Instant) = t.atZone(zone).toLocalDate()
        val local = TimeRangeFilter.between(from.atStartOfDay(), today.plusDays(1).atStartOfDay())
        val instants = TimeRangeFilter.between(from.minusDays(1).atStartOfDay(zone).toInstant(), today.plusDays(1).atStartOfDay(zone).toInstant())
        val errors = JSONArray()
        suspend fun safe(name: String, block: suspend () -> Unit) {
            if (!has(name)) return
            try { block() } catch (e: Throwable) { errors.put("$name: ${e.message ?: e.javaClass.simpleName}") }
        }

        // Daily totals by aggregation, which removes double counting when the phone and the watch both record.
        suspend fun <T : Any> daily(name: String, key: String, metric: AggregateMetric<T>, value: (T) -> Double) = safe(name) {
            c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(metric), local, Period.ofDays(1))).forEach { g ->
                g.result[metric]?.let { v -> val x = value(v); if (x > 0) day(g.startTime.toLocalDate())?.put(key, Math.round(x * 10) / 10.0) }
            }
        }
        wrote = HashMap(); origins = HashSet(); seen = HashMap()
        daily("steps", "st", StepsRecord.COUNT_TOTAL) { it.toDouble() }
        daily("distance", "di", DistanceRecord.DISTANCE_TOTAL) { it.inMeters }
        daily("active", "ak", ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL) { it.inKilocalories }
        daily("total", "tk", TotalCaloriesBurnedRecord.ENERGY_TOTAL) { it.inKilocalories }

        // Each app's own steps and distance, day by day. Health Connect's daily total above merges every app by its
        // priority list, and on Android 14+ the phone itself counts steps: the merge then differs from what the watch
        // app shows. When the watch wrote steps for a day, its own count is used and the merge is kept beside it.
        // A record that crosses midnight is shared between the two days by time.
        fun spread(s: Instant, e: Instant, v: Double, put: (LocalDate, Double) -> Unit) {
            if (!e.isAfter(s)) { put(dateOf(s), v); return }
            val total = Duration.between(s, e).toMillis().toDouble()
            var t = s
            while (t.isBefore(e)) {
                val next = minOf(e, dateOf(t).plusDays(1).atStartOfDay(zone).toInstant())
                if (!next.isAfter(t)) break
                put(dateOf(t), v * Duration.between(t, next).toMillis() / total)
                t = next
            }
        }
        val stepBy = HashMap<LocalDate, HashMap<String, Double>>()
        val distBy = HashMap<LocalDate, HashMap<String, Double>>()
        var stepEnd = 0L
        safe("steps") {
            readAll(c, StepsRecord::class, instants) { r ->
                val pkg = r.metadata.dataOrigin.packageName
                if (r.endTime.toEpochMilli() > stepEnd) stepEnd = r.endTime.toEpochMilli()
                spread(r.startTime, r.endTime, r.count.toDouble()) { d, v -> stepBy.getOrPut(d) { HashMap() }.merge(pkg, v) { x, y -> x + y } }
            }
        }
        safe("distance") {
            readAll(c, DistanceRecord::class, instants) { r ->
                val pkg = r.metadata.dataOrigin.packageName
                spread(r.startTime, r.endTime, r.distance.inMeters) { d, v -> distBy.getOrPut(d) { HashMap() }.merge(pkg, v) { x, y -> x + y } }
            }
        }

        // Sleep: the night is filed under the morning it ends. The longest session is the main sleep; others are naps.
        // seg: the night as it happened, [minutes after the start, length, stage 1 awake, 2 light, 3 deep, 4 REM].
        class Night(val start: Instant, val end: Instant, val d: Long, val l: Long, val r: Long, val w: Long, val seg: JSONArray, val pkg: String)
        val nights = HashMap<LocalDate, MutableList<Night>>()
        safe("sleep") {
            readAll(c, SleepSessionRecord::class, instants) { s ->
                var d = 0L; var l = 0L; var r = 0L; var w = 0L
                val seg = JSONArray()
                var lastCode = 0; var lastStart = -1L; var lastLen = 0L
                for (st in s.stages.sortedBy { it.startTime }) {
                    val code = when (st.stage) {
                        SleepSessionRecord.STAGE_TYPE_DEEP -> 3
                        SleepSessionRecord.STAGE_TYPE_REM -> 4
                        SleepSessionRecord.STAGE_TYPE_LIGHT, SleepSessionRecord.STAGE_TYPE_SLEEPING -> 2
                        SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED, SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> 1
                        else -> 0
                    }
                    if (code == 0) continue
                    val off = Duration.between(s.startTime, st.startTime).toMinutes().coerceAtLeast(0)
                    val len = Duration.between(st.startTime, st.endTime).toMinutes()
                    if (len <= 0) continue
                    // Neighbouring pieces of the same stage become one.
                    if (code == lastCode && lastStart + lastLen >= off - 1) lastLen = off + len - lastStart
                    else {
                        if (lastCode != 0 && seg.length() < 200) seg.put(JSONArray().put(lastStart).put(lastLen).put(lastCode))
                        lastCode = code; lastStart = off; lastLen = len
                    }
                }
                if (lastCode != 0 && seg.length() < 200) seg.put(JSONArray().put(lastStart).put(lastLen).put(lastCode))
                for (st in s.stages) {
                    val m = Duration.between(st.startTime, st.endTime).toMinutes()
                    when (st.stage) {
                        SleepSessionRecord.STAGE_TYPE_DEEP -> d += m
                        SleepSessionRecord.STAGE_TYPE_REM -> r += m
                        SleepSessionRecord.STAGE_TYPE_LIGHT, SleepSessionRecord.STAGE_TYPE_SLEEPING -> l += m
                        SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED, SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> w += m
                    }
                }
                if (d + l + r == 0L) l = Duration.between(s.startTime, s.endTime).toMinutes() - w
                if (d + l + r >= 15) nights.getOrPut(s.endTime.atZone(s.endZoneOffset ?: zone).toLocalDate()) { ArrayList() }.add(Night(s.startTime, s.endTime, d, l, r, w, seg, s.metadata.dataOrigin.packageName))
            }
        }
        // The watch apps: the known wearable apps that wrote anything. Their own figures win wherever another app (the
        // phone's step counter, a phone sleep tracker) wrote the same kind of data for the same day; on a day two of
        // them wrote (the day you move from Zepp to Gadgetbridge), the one with more of it. The one named on screen is
        // the one that wrote last.
        val watches = WATCH.filter { it in origins }.toSet()
        val watch = watches.maxByOrNull { seen[it] ?: 0L }
        for ((d, by) in stepBy) {
            val o = day(d) ?: continue
            val w = by.filterKeys { it in watches }.values.maxOrNull() ?: continue
            if (w < 1) continue
            o.optDouble("st").takeIf { !it.isNaN() && Math.abs(it - w) >= 1 }?.let { o.put("sa", Math.round(it).toDouble()) }
            o.put("st", Math.round(w).toDouble())
        }
        for ((d, by) in distBy) { val o = day(d) ?: continue; by.filterKeys { it in watches }.values.maxOrNull()?.takeIf { it > 0 }?.let { o.put("di", Math.round(it * 10) / 10.0) } }
        val mainSleep = HashMap<LocalDate, Night>()
        for ((date, all) in nights) {
            val list = all.filter { it.pkg in watches }.ifEmpty { all }
            val m = list.maxByOrNull { it.d + it.l + it.r } ?: continue
            val o = day(date) ?: continue
            mainSleep[date] = m
            val on = m.start.atZone(zone).toLocalTime().let { it.hour * 60 + it.minute }.let { if (it > 720) it - 1440 else it }
            val off = m.end.atZone(zone).toLocalTime().let { it.hour * 60 + it.minute }
            val naps = list.filter { it !== m && it.end <= m.start || it !== m && it.start >= m.end }.sumOf { it.d + it.l + it.r }
            o.put("sl", JSONObject().put("d", m.d).put("l", m.l).put("r", m.r).put("w", m.w).put("on", on).put("off", off)
                .put("bed", Duration.between(m.start, m.end).toMinutes()).put("nap", naps).apply { if (m.seg.length() > 0) put("seg", m.seg) })
        }

        // Point readings: daily average, or the morning value for weight and body fat.
        safe("resting") { avg(c, watches, RestingHeartRateRecord::class, instants, { dateOf(it.time) }, { it.beatsPerMinute.toDouble() }) { d, v -> day(d)?.put("rh", v.roundToInt()) } }
        safe("hrv") { avg(c, watches, HeartRateVariabilityRmssdRecord::class, instants, { dateOf(it.time) }, { it.heartRateVariabilityMillis }) { d, v -> day(d)?.put("hv", Math.round(v * 10) / 10.0) } }
        safe("spo2") { avg(c, watches, OxygenSaturationRecord::class, instants, { dateOf(it.time) }, { it.percentage.value }) { d, v -> day(d)?.put("o2", Math.round(v * 10) / 10.0) } }
        safe("breathing") { avg(c, watches, RespiratoryRateRecord::class, instants, { dateOf(it.time) }, { it.rate }) { d, v -> day(d)?.put("br", Math.round(v * 10) / 10.0) } }
        safe("weight") { first(c, WeightRecord::class, instants, { it.time }) { r -> day(dateOf(r.time))?.put("wt", Math.round(r.weight.inKilograms * 10) / 10.0) } }
        safe("bodyfat") { first(c, BodyFatRecord::class, instants, { it.time }) { r -> day(dateOf(r.time))?.put("bf", Math.round(r.percentage.value * 10) / 10.0) } }
        safe("vo2") { first(c, Vo2MaxRecord::class, instants, { it.time }, latest = true) { r -> day(dateOf(r.time))?.put("vo", Math.round(r.vo2MillilitersPerMinuteKilogram * 10) / 10.0) } }

        // Workouts recorded by the watch (or any other app).
        class Session(val s: Instant, val e: Instant, val json: JSONObject)
        val sessions = ArrayList<Session>()
        // A failed read must not look like "no workouts": the page replaces the synced range with what comes back.
        var exFailed = false
        safe("exercise") {
            try {
                readAll(c, ExerciseSessionRecord::class, instants) { r ->
                    val pkg = r.metadata.dataOrigin.packageName
                    if (pkg == a.packageName || dateOf(r.startTime) < from) return@readAll
                    val j = JSONObject().put("s", r.startTime.toEpochMilli()).put("e", r.endTime.toEpochMilli())
                        .put("k", kind(r.exerciseType, r.title)).put("src", appName(pkg))
                    // openGym writes each finished workout here with the routine's name as its title.
                    if (pkg == OpenGym.PKG) { j.put("og", true); r.title?.takeIf { it.isNotBlank() }?.let { j.put("ti", it.take(60)) } }
                    sessions += Session(r.startTime, r.endTime, j)
                }
            } catch (e: Throwable) { exFailed = true; throw e }
        }

        // Heart-rate samples, sorted by time, used four ways below.
        var hrT = LongArray(0); var hrB = IntArray(0); var hrEnd = 0L
        safe("heart") {
            val t = ArrayList<Long>(); val b = ArrayList<Int>(); val src = ArrayList<String>()
            readAll(c, HeartRateRecord::class, instants) { r ->
                val p = r.metadata.dataOrigin.packageName
                if (t.size < 600_000) for (x in r.samples) if (x.beatsPerMinute in 30..230) { t += x.time.toEpochMilli(); b += x.beatsPerMinute.toInt(); src += p }
            }
            // A second device's samples on a day a watch covered would double-count minutes and mix two sensors: on
            // such a day only the samples of the watch app with the most of them are kept.
            val dates = t.map { dateOf(Instant.ofEpochMilli(it)) }
            val count = HashMap<LocalDate, HashMap<String, Int>>()
            for (i in t.indices) if (src[i] in watches) count.getOrPut(dates[i]) { HashMap() }.merge(src[i], 1) { x, y -> x + y }
            val dayWatch = count.mapValues { (_, m) -> m.maxByOrNull { it.value }?.key }
            val order = t.indices.filter { i -> dayWatch[dates[i]].let { it == null || it == src[i] } }.sortedBy { t[it] }
            hrT = LongArray(order.size) { t[order[it]] }; hrB = IntArray(order.size) { b[order[it]] }
            if (hrT.isNotEmpty()) hrEnd = hrT.last()
        }
        fun samples(s: Long, e: Long): IntRange {
            var lo = java.util.Arrays.binarySearch(hrT, s); if (lo < 0) lo = -lo - 1
            var hi = java.util.Arrays.binarySearch(hrT, e); if (hi < 0) hi = -hi - 2
            return lo..hi
        }
        if (hrT.isNotEmpty()) {
            // 1. Resting estimate where the watch wrote none: the 5th percentile of the day's readings.
            val byDay = HashMap<LocalDate, ArrayList<Int>>()
            for (i in hrT.indices) byDay.getOrPut(dateOf(Instant.ofEpochMilli(hrT[i]))) { ArrayList() }.add(hrB[i])
            for ((d, v) in byDay) { val o = day(d) ?: continue; if (!o.has("rh") && v.size >= 30) o.put("rp", v.sorted()[(v.size * 0.05).toInt()]) }
            // 2. Sleeping heart rate: the average across the main sleep, and its low point (the 5th percentile, so a
            //    single dropped reading cannot set it).
            for ((d, m) in mainSleep) {
                val r = samples(m.start.toEpochMilli(), m.end.toEpochMilli())
                if (r.last - r.first >= 20) {
                    val sl = day(d)?.optJSONObject("sl") ?: continue
                    val v = r.map { hrB[it] }
                    sl.put("hr", Math.round(v.average() * 10) / 10.0)
                    sl.put("lo", v.sorted()[(v.size * 0.05).toInt()])
                }
            }
            // 2b. The whole day's heart rate in 5-minute steps (the median of each), for the 24-hour curve.
            val bins = HashMap<LocalDate, Array<ArrayList<Int>?>>()
            for (i in hrT.indices) {
                val z = Instant.ofEpochMilli(hrT[i]).atZone(zone)
                val b = bins.getOrPut(z.toLocalDate()) { arrayOfNulls(288) }
                val slot = (z.hour * 60 + z.minute) / 5
                (b[slot] ?: ArrayList<Int>().also { b[slot] = it }).add(hrB[i])
            }
            for ((d, b) in bins) {
                val o = day(d) ?: continue
                val arr = JSONArray()
                var n = 0
                for (x in b) { if (x.isNullOrEmpty()) arr.put(0) else { val s2 = x.sorted(); arr.put(s2[s2.size / 2]); n++ } }
                if (n >= 12) o.put("hd", arr)
            }
            // 3. Each workout's heart rate as seconds at each bpm, so the page can apply your own zones.
            for (x in sessions) {
                val s = x.s.toEpochMilli(); val e = x.e.toEpochMilli(); val r = samples(s, e)
                val hist = TreeMap<Int, Double>()
                for (i in r) { val next = if (i + 1 <= r.last) hrT[i + 1] else e; hist.merge(hrB[i], min((next - hrT[i]) / 1000.0, 120.0)) { x, y -> x + y } }
                x.json.put("h", JSONArray(hist.filterValues { it >= 1 }.map { JSONArray().put(it.key).put(it.value.roundToInt()) }))
            }
            // 4. The watch's reading inside each strap workout, for calibration.
            val win = JSONArray()
            for (i in 0 until windows.length()) {
                val w = windows.optJSONArray(i) ?: continue
                val r = samples(w.optLong(0), w.optLong(1))
                if (r.last - r.first >= 9) win.put(JSONObject().put("s", w.optLong(0)).put("a", Math.round(r.map { hrB[it] }.average() * 10) / 10.0).put("n", r.last - r.first + 1))
            }
            return finish(days, from, today, sessions.map { it.json }, has("exercise") && !exFailed, win, granted, errors, fresh(watch, stepEnd, hrEnd, mainSleep.values.maxOfOrNull { it.end.toEpochMilli() } ?: 0L))
        }
        return finish(days, from, today, sessions.map { it.json }, has("exercise") && !exFailed, JSONArray(), granted, errors, fresh(watch, stepEnd, hrEnd, mainSleep.values.maxOfOrNull { it.end.toEpochMilli() } ?: 0L))
    }

    private fun finish(days: TreeMap<LocalDate, JSONObject>, from: LocalDate, to: LocalDate, ex: List<JSONObject>, exAllowed: Boolean,
                       win: JSONArray, granted: Set<String>, errors: JSONArray, fresh: JSONObject): JSONObject {
        val d = JSONObject()
        for ((k, v) in days) if (v.length() > 0) d.put(k.toString(), v)
        return JSONObject().put("from", from.toString()).put("to", to.toString()).put("days", d)
            .put("ex", if (exAllowed) JSONArray(ex) else JSONObject.NULL).put("win", win)
            .put("granted", JSONArray(perm.filterValues { it in granted }.keys)).put("errors", errors).put("fresh", fresh)
            .put("read", System.currentTimeMillis())
    }

    // How fresh the data is: per kind, when its newest record was written into Health Connect and by which app, and
    // for steps, heart rate and sleep the latest moment the data itself reaches.
    private fun fresh(watch: String?, stepEnd: Long, hrEnd: Long, sleepEnd: Long): JSONObject {
        val o = JSONObject()
        for ((k, v) in wrote) o.put(k, JSONObject().put("w", v.first).put("src", appName(v.second)))
        fun upTo(k: String, e: Long) { if (e > 0) (o.optJSONObject(k) ?: JSONObject().also { o.put(k, it) }).put("e", e) }
        upTo("steps", stepEnd); upTo("heart", hrEnd); upTo("sleep", sleepEnd)
        if (watch != null) o.put("watch", appName(watch))
        o.put("apps", JSONArray(origins.map { appName(it) }.distinct().sorted()))
        return o
    }

    // The day's average, from the watch apps alone on days they wrote any: a watch's and a phone's readings are not averaged together.
    private suspend fun <T : Record> avg(c: HealthConnectClient, watches: Set<String>, type: KClass<T>, range: TimeRangeFilter, date: (T) -> LocalDate, v: (T) -> Double, put: (LocalDate, Double) -> Unit) {
        val sums = HashMap<LocalDate, DoubleArray>()
        val mine = HashMap<LocalDate, DoubleArray>()
        readAll(c, type, range) { r ->
            sums.getOrPut(date(r)) { DoubleArray(2) }.let { it[0] += v(r); it[1]++ }
            if (r.metadata.dataOrigin.packageName in watches) mine.getOrPut(date(r)) { DoubleArray(2) }.let { it[0] += v(r); it[1]++ }
        }
        for ((d, s) in sums) { val m = mine[d]; put(d, if (m != null) m[0] / m[1] else s[0] / s[1]) }
    }
    // The earliest reading of each day (a morning weigh-in), or the latest when asked.
    private suspend fun <T : Record> first(c: HealthConnectClient, type: KClass<T>, range: TimeRangeFilter, time: (T) -> Instant, latest: Boolean = false, put: (T) -> Unit) {
        val pick = HashMap<LocalDate, T>()
        readAll(c, type, range) { r ->
            val d = time(r).atZone(ZoneId.systemDefault()).toLocalDate()
            val cur = pick[d]
            if (cur == null || (if (latest) time(r) > time(cur) else time(r) < time(cur))) pick[d] = r
        }
        pick.values.forEach(put)
    }

    private val WATCH = listOf(MainActivity.ZEPP, MainActivity.GADGETBRIDGE, MainActivity.GADGETBRIDGE_NIGHTLY, "com.mi.health", "com.xiaomi.wearable", "fi.polar.polarflow",
        "com.garmin.android.apps.connectmobile", "com.fitbit.FitbitMobile", "com.samsung.android.wear.shealth")

    private fun appName(pkg: String) = when (pkg) {
        MainActivity.ZEPP -> "Zepp"
        MainActivity.GADGETBRIDGE, MainActivity.GADGETBRIDGE_NIGHTLY -> "Gadgetbridge"
        "com.google.android.apps.fitness" -> "Google Fit"
        "com.sec.android.app.shealth" -> "Samsung Health"
        "com.mi.health", "com.xiaomi.wearable" -> "Mi Fitness"
        "fi.polar.polarflow" -> "Polar Flow"
        "com.google.android.apps.healthdata" -> "Health Connect"
        OpenGym.PKG -> "openGym"
        else -> pkg.substringAfterLast('.').replaceFirstChar { it.uppercase() }
    }

    private fun kind(type: Int, title: String?): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "Walk"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "Run"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING, ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "Cycle"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "Hike"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL, ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "Swim"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "Elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING, ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "Rowing"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING, ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "Stairs"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "Strength training"
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "Calisthenics"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "HIIT"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "Yoga"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "Pilates"
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING -> "Stretching"
        ExerciseSessionRecord.EXERCISE_TYPE_GUIDED_BREATHING -> "Breathing"
        ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON -> "Badminton"
        ExerciseSessionRecord.EXERCISE_TYPE_CRICKET -> "Cricket"
        ExerciseSessionRecord.EXERCISE_TYPE_SOCCER -> "Football"
        ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS -> "Table tennis"
        ExerciseSessionRecord.EXERCISE_TYPE_TENNIS -> "Tennis"
        ExerciseSessionRecord.EXERCISE_TYPE_SQUASH -> "Squash"
        ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL -> "Basketball"
        ExerciseSessionRecord.EXERCISE_TYPE_VOLLEYBALL -> "Volleyball"
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING -> "Dance"
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS, ExerciseSessionRecord.EXERCISE_TYPE_BOXING -> "Martial arts"
        else -> title?.takeIf { it.isNotBlank() }?.take(24) ?: "Workout"
    }
}
