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

    private suspend fun <T : Record> readAll(c: HealthConnectClient, type: KClass<T>, range: TimeRangeFilter, each: (T) -> Unit) {
        var token: String? = null
        var pages = 0
        do {
            val page = c.readRecords(ReadRecordsRequest(type, range, pageSize = 1000, pageToken = token))
            page.records.forEach(each)
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
        daily("steps", "st", StepsRecord.COUNT_TOTAL) { it.toDouble() }
        daily("distance", "di", DistanceRecord.DISTANCE_TOTAL) { it.inMeters }
        daily("active", "ak", ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL) { it.inKilocalories }
        daily("total", "tk", TotalCaloriesBurnedRecord.ENERGY_TOTAL) { it.inKilocalories }

        // Sleep: the night is filed under the morning it ends. The longest session is the main sleep; others are naps.
        class Night(val start: Instant, val end: Instant, val d: Long, val l: Long, val r: Long, val w: Long)
        val nights = HashMap<LocalDate, MutableList<Night>>()
        safe("sleep") {
            readAll(c, SleepSessionRecord::class, instants) { s ->
                var d = 0L; var l = 0L; var r = 0L; var w = 0L
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
                if (d + l + r >= 15) nights.getOrPut(s.endTime.atZone(s.endZoneOffset ?: zone).toLocalDate()) { ArrayList() }.add(Night(s.startTime, s.endTime, d, l, r, w))
            }
        }
        val mainSleep = HashMap<LocalDate, Night>()
        for ((date, list) in nights) {
            val m = list.maxByOrNull { it.d + it.l + it.r } ?: continue
            val o = day(date) ?: continue
            mainSleep[date] = m
            val on = m.start.atZone(zone).toLocalTime().let { it.hour * 60 + it.minute }.let { if (it > 720) it - 1440 else it }
            val off = m.end.atZone(zone).toLocalTime().let { it.hour * 60 + it.minute }
            val naps = list.filter { it !== m }.sumOf { it.d + it.l + it.r }
            o.put("sl", JSONObject().put("d", m.d).put("l", m.l).put("r", m.r).put("w", m.w).put("on", on).put("off", off)
                .put("bed", Duration.between(m.start, m.end).toMinutes()).put("nap", naps))
        }

        // Point readings: daily average, or the morning value for weight and body fat.
        safe("resting") { avg(c, RestingHeartRateRecord::class, instants, { dateOf(it.time) }, { it.beatsPerMinute.toDouble() }) { d, v -> day(d)?.put("rh", v.roundToInt()) } }
        safe("hrv") { avg(c, HeartRateVariabilityRmssdRecord::class, instants, { dateOf(it.time) }, { it.heartRateVariabilityMillis }) { d, v -> day(d)?.put("hv", Math.round(v * 10) / 10.0) } }
        safe("spo2") { avg(c, OxygenSaturationRecord::class, instants, { dateOf(it.time) }, { it.percentage.value }) { d, v -> day(d)?.put("o2", Math.round(v * 10) / 10.0) } }
        safe("breathing") { avg(c, RespiratoryRateRecord::class, instants, { dateOf(it.time) }, { it.rate }) { d, v -> day(d)?.put("br", Math.round(v * 10) / 10.0) } }
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
        var hrT = LongArray(0); var hrB = IntArray(0)
        safe("heart") {
            val t = ArrayList<Long>(); val b = ArrayList<Int>()
            readAll(c, HeartRateRecord::class, instants) { r ->
                if (t.size < 600_000) for (x in r.samples) if (x.beatsPerMinute in 30..230) { t += x.time.toEpochMilli(); b += x.beatsPerMinute.toInt() }
            }
            val order = t.indices.sortedBy { t[it] }
            hrT = LongArray(order.size) { t[order[it]] }; hrB = IntArray(order.size) { b[order[it]] }
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
            // 2. Sleeping heart rate: the average across the main sleep.
            for ((d, m) in mainSleep) {
                val r = samples(m.start.toEpochMilli(), m.end.toEpochMilli())
                if (r.last - r.first >= 20) day(d)?.optJSONObject("sl")?.put("hr", Math.round(r.map { hrB[it] }.average() * 10) / 10.0)
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
            return finish(days, from, today, sessions.map { it.json }, has("exercise") && !exFailed, win, granted, errors)
        }
        return finish(days, from, today, sessions.map { it.json }, has("exercise") && !exFailed, JSONArray(), granted, errors)
    }

    private fun finish(days: TreeMap<LocalDate, JSONObject>, from: LocalDate, to: LocalDate, ex: List<JSONObject>, exAllowed: Boolean,
                       win: JSONArray, granted: Set<String>, errors: JSONArray): JSONObject {
        val d = JSONObject()
        for ((k, v) in days) if (v.length() > 0) d.put(k.toString(), v)
        return JSONObject().put("from", from.toString()).put("to", to.toString()).put("days", d)
            .put("ex", if (exAllowed) JSONArray(ex) else JSONObject.NULL).put("win", win)
            .put("granted", JSONArray(perm.filterValues { it in granted }.keys)).put("errors", errors)
    }

    private suspend fun <T : Record> avg(c: HealthConnectClient, type: KClass<T>, range: TimeRangeFilter, date: (T) -> LocalDate, v: (T) -> Double, put: (LocalDate, Double) -> Unit) {
        val sums = HashMap<LocalDate, DoubleArray>()
        readAll(c, type, range) { r -> sums.getOrPut(date(r)) { DoubleArray(2) }.let { it[0] += v(r); it[1]++ } }
        for ((d, s) in sums) put(d, s[0] / s[1])
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

    private fun appName(pkg: String) = when (pkg) {
        MainActivity.ZEPP -> "Zepp"
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
