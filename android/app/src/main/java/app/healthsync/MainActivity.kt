package app.healthsync

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import java.util.TreeMap
import kotlin.reflect.KClass

/**
 * Reads daily steps, sleep and resting heart rate from Health Connect and hands them to the
 * Health web app through the URL fragment. The fragment never leaves the device: browsers do
 * not send it to the server, and this app holds no internet permission.
 */
class MainActivity : ComponentActivity() {

    private class Day {
        var steps: Long? = null
        var deep = 0L; var light = 0L; var rem = 0L; var awake = 0L
        var onset: Int? = null; var longest = 0L
        var rhrSum = 0L; var rhrN = 0
        val hr = ArrayList<Int>()
    }

    private val pSteps = HealthPermission.getReadPermission(StepsRecord::class)
    private val pSleep = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val pHr = HealthPermission.getReadPermission(HeartRateRecord::class)
    private val pRest = HealthPermission.getReadPermission(RestingHeartRateRecord::class)
    private val wanted = setOf(pSteps, pSleep, pHr, pRest)

    private lateinit var status: TextView
    private var days = 30
    private var busy = false

    private val ask = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        if (granted.any { it in wanted }) start() else say("No access was given. Tap Sync and allow steps, sleep and heart rate.")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val title = TextView(this).apply { text = "Health Sync"; textSize = 28f }
        status = TextView(this).apply { textSize = 16f; setPadding(0, pad / 2, 0, pad) }
        val sync = Button(this).apply { text = "Sync now"; setOnClickListener { start() } }
        val settings = Button(this).apply { text = "Health Connect settings"; setOnClickListener { openSettings() } }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL; setPadding(pad, pad, pad, pad)
            addView(title); addView(status); addView(sync); addView(settings)
        })
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val action = intent?.action
        if (action == "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" || action == "android.intent.action.VIEW_PERMISSION_USAGE") {
            say("This app reads steps, sleep and heart rate from Health Connect and passes daily totals to your Health app in the browser on this device. It has no internet access and stores nothing.")
            return
        }
        days = intent?.data?.getQueryParameter("days")?.toIntOrNull()?.coerceIn(1, 90) ?: 30
        start()
    }

    private fun say(text: String) { status.text = text }

    private fun openSettings() {
        try { startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)) }
        catch (e: ActivityNotFoundException) { say("Health Connect settings could not be opened.") }
    }

    private fun start() {
        if (busy) return
        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE -> {}
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> { say("Update Health Connect from the Play Store, then try again."); return }
            else -> { say("Health Connect is not available on this device."); return }
        }
        busy = true
        say("Reading the last $days days…")
        lifecycleScope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(this@MainActivity)
                val granted = client.permissionController.getGrantedPermissions()
                if (granted.none { it in wanted }) { busy = false; ask.launch(wanted); return@launch }
                send(read(client, granted))
            } catch (e: Exception) {
                say("Could not read Health Connect: ${e.message ?: e.javaClass.simpleName}")
            }
            busy = false
        }
    }

    private suspend fun <T : Record> readAll(client: HealthConnectClient, type: KClass<T>, range: TimeRangeFilter, each: (T) -> Unit) {
        var token: String? = null
        var pages = 0
        do {
            val page = client.readRecords(ReadRecordsRequest(type, range, pageSize = 1000, pageToken = token))
            page.records.forEach(each)
            token = page.pageToken
        } while (token != null && ++pages < 400)
    }

    private suspend fun read(client: HealthConnectClient, granted: Set<String>): TreeMap<LocalDate, Day> {
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val from = today.minusDays(days - 1L)
        val out = TreeMap<LocalDate, Day>()
        fun day(d: LocalDate): Day? = if (d < from || d > today) null else out.getOrPut(d) { Day() }
        val local = TimeRangeFilter.between(from.atStartOfDay(), today.plusDays(1).atStartOfDay())
        val instants = TimeRangeFilter.between(from.minusDays(1).atStartOfDay(zone).toInstant(), today.plusDays(1).atStartOfDay(zone).toInstant())

        if (pSteps in granted) {
            // Aggregation removes double counting when the phone and the watch both record steps.
            client.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(StepsRecord.COUNT_TOTAL), local, Period.ofDays(1))).forEach { g ->
                g.result[StepsRecord.COUNT_TOTAL]?.let { n -> if (n > 0) day(g.startTime.toLocalDate())?.steps = n }
            }
        }
        if (pSleep in granted) readAll(client, SleepSessionRecord::class, instants) { s ->
            val d = day(s.endTime.atZone(s.endZoneOffset ?: zone).toLocalDate()) ?: return@readAll
            var deep = 0L; var light = 0L; var rem = 0L; var awake = 0L
            for (st in s.stages) {
                val m = Duration.between(st.startTime, st.endTime).toMinutes()
                when (st.stage) {
                    SleepSessionRecord.STAGE_TYPE_DEEP -> deep += m
                    SleepSessionRecord.STAGE_TYPE_REM -> rem += m
                    SleepSessionRecord.STAGE_TYPE_LIGHT, SleepSessionRecord.STAGE_TYPE_SLEEPING -> light += m
                    SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED, SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> awake += m
                }
            }
            if (s.stages.isEmpty()) light = Duration.between(s.startTime, s.endTime).toMinutes()
            val total = deep + light + rem
            d.deep += deep; d.light += light; d.rem += rem; d.awake += awake
            if (total > d.longest) {
                d.longest = total
                val t = s.startTime.atZone(s.startZoneOffset ?: zone).toLocalTime()
                val m = t.hour * 60 + t.minute
                d.onset = if (m > 720) m - 1440 else m   // minutes from midnight; before midnight is negative
            }
        }
        if (pRest in granted) readAll(client, RestingHeartRateRecord::class, instants) { r ->
            day(r.time.atZone(r.zoneOffset ?: zone).toLocalDate())?.let { it.rhrSum += r.beatsPerMinute; it.rhrN++ }
        }
        if (pHr in granted) {
            var samples = 0
            readAll(client, HeartRateRecord::class, instants) { r ->
                if (samples > 400_000) return@readAll
                for (s in r.samples) {
                    val d = day(s.time.atZone(r.startZoneOffset ?: zone).toLocalDate()) ?: continue
                    if (d.rhrN == 0 && s.beatsPerMinute in 30..220) { d.hr.add(s.beatsPerMinute.toInt()); samples++ }
                }
            }
        }
        return out
    }

    private fun send(data: TreeMap<LocalDate, Day>) {
        val d = JSONObject()
        var nSteps = 0; var nSleep = 0; var nHr = 0
        for ((date, v) in data) {
            val sleep = v.deep + v.light + v.rem
            // Without a resting value from the watch, use the lowest 5% of the day's readings.
            val rhr: Int? = when {
                v.rhrN > 0 -> (v.rhrSum / v.rhrN).toInt()
                v.hr.size >= 30 -> v.hr.sorted()[(v.hr.size * 0.05).toInt()]
                else -> null
            }
            if (v.steps == null && sleep < 30 && rhr == null) continue
            if (v.steps != null) nSteps++
            if (sleep >= 30) nSleep++
            if (rhr != null) nHr++
            d.put(date.toString(), JSONArray().apply {
                put(v.steps ?: JSONObject.NULL); put(v.deep); put(v.light); put(v.rem); put(v.awake)
                put(v.onset ?: JSONObject.NULL); put(rhr ?: JSONObject.NULL)
            })
        }
        if (d.length() == 0) {
            say("Health Connect has no steps, sleep or heart rate for the last $days days. In the Zepp app, turn on Health Connect under Profile, allow every data type, sync the watch, then try again.")
            return
        }
        val json = JSONObject().put("v", 1).put("d", d).toString()
        val b64 = Base64.encodeToString(json.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        say("Steps: $nSteps days. Sleep: $nSleep nights. Resting heart rate: $nHr days. Opening Health…")
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.PWA_URL + "#sync=" + b64))) }
        catch (e: ActivityNotFoundException) { say("No browser could open the Health app.") }
    }
}
