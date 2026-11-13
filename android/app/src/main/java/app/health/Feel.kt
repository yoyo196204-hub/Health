package app.health

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
import java.io.File

/**
 * What the page cannot do well on its own: crisp system haptics, a rest timer that still buzzes with the
 * screen off, and a private copy of the data in the app's own files.
 */
class Feel(private val a: MainActivity) {
    private val restEnd = Runnable { vibrate(longArrayOf(0, 180, 110, 180, 110, 320)) }

    /** The page's haptic vocabulary mapped onto the phone's own effects, which respect the system touch setting. */
    fun haptic(kind: String) = a.main.post {
        val v = a.web
        fun play(c: Int) = v.performHapticFeedback(c)
        when (kind) {
            "tick" -> play(HapticFeedbackConstants.CLOCK_TICK)
            "ok" -> play(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
            "done" -> {
                val c = if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
                play(c); a.main.postDelayed({ play(c) }, 110); a.main.postDelayed({ play(HapticFeedbackConstants.LONG_PRESS) }, 240)
            }
            "warn" -> play(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS)
            "heavy" -> play(HapticFeedbackConstants.LONG_PRESS)
            else -> play(HapticFeedbackConstants.VIRTUAL_KEY)
        }
    }

    /** Buzz when rest is over. Runs on the main thread's clock, so it fires while the app is in the background. */
    fun restAlarm(ms: Long) = a.main.post {
        a.main.removeCallbacks(restEnd)
        if (ms > 0) a.main.postDelayed(restEnd, ms.coerceAtMost(15 * 60_000L))
    }
    fun restCancel() = a.main.post { a.main.removeCallbacks(restEnd) }

    private fun vibrate(pattern: LongArray) {
        val vib = if (Build.VERSION.SDK_INT >= 31) (a.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager?)?.defaultVibrator
            else @Suppress("DEPRECATION") (a.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator?)
        try { vib?.vibrate(VibrationEffect.createWaveform(pattern, -1)) } catch (e: Exception) { /* no vibrator */ }
    }

    // ---- the private copy ----
    private val file get() = File(a.filesDir, "state.json")
    private val lock = Any()

    fun mirrorRead(): String? = synchronized(lock) { try { file.takeIf { it.exists() && it.length() > 2 }?.readText() } catch (e: Exception) { null } }

    /** Written to a temporary file and renamed over the old one, so a crash mid-write never leaves half a file. */
    fun mirrorWrite(json: String) = synchronized(lock) {
        if (json.length < 2 || json.length > 40_000_000) return@synchronized
        try {
            val tmp = File(a.filesDir, "state.json.tmp")
            tmp.writeText(json)
            if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file) }
        } catch (e: Exception) { /* best effort: localStorage is still the main copy */ }
    }
}
