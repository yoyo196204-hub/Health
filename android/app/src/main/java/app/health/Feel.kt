package app.health

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import java.io.File

/**
 * What the page cannot do well on its own: crisp haptics from the phone's own vibration engine, and a private copy
 * of the data in the app's own files.
 *
 * Haptics are played with the vibrator directly, not through the page's view: the view's haptic feedback is faint on
 * many phones and goes silent when the system "touch feedback" switch is off. The app has its own switch (Me › Feel),
 * and the phone's master vibration setting still applies. Where the phone has haptic primitives (Android 11 and later,
 * most recent phones) the patterns are composed from them, which feels like a click rather than a buzz; otherwise the
 * phone's predefined clicks, and on the oldest phones short pulses.
 */
class Feel(private val a: MainActivity) {
    private val vib: Vibrator? = if (Build.VERSION.SDK_INT >= 31) (a.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager?)?.defaultVibrator
        else @Suppress("DEPRECATION") (a.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator?)
    private val primitives = Build.VERSION.SDK_INT >= 30 && vib != null && try {
        vib.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK, VibrationEffect.Composition.PRIMITIVE_TICK)
    } catch (e: Throwable) { false }

    private fun compose(vararg parts: Triple<Int, Float, Int>): VibrationEffect? {
        if (!primitives || Build.VERSION.SDK_INT < 30) return null
        val c = VibrationEffect.startComposition()
        for ((p, s, d) in parts) c.addPrimitive(p, s, d)
        return c.compose()
    }
    private fun predefined(id: Int): VibrationEffect? = if (Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(id) else null

    /** tick, ok, done, warn, heavy: the same vocabulary the page uses. Safe from any thread. */
    fun haptic(kind: String) {
        val v = vib ?: return
        if (!v.hasVibrator()) return
        val click = VibrationEffect.Composition.PRIMITIVE_CLICK
        val tick = VibrationEffect.Composition.PRIMITIVE_TICK
        val e: VibrationEffect = when (kind) {
            "tick" -> compose(Triple(tick, 0.7f, 0)) ?: predefined(VibrationEffect.EFFECT_TICK) ?: VibrationEffect.createOneShot(8, 90)
            "ok" -> compose(Triple(click, 0.85f, 0)) ?: predefined(VibrationEffect.EFFECT_CLICK) ?: VibrationEffect.createOneShot(14, 180)
            "done" -> compose(Triple(click, 0.7f, 0), Triple(click, 0.85f, 90), Triple(click, 1f, 110))
                ?: VibrationEffect.createWaveform(longArrayOf(0, 16, 70, 16, 70, 34), intArrayOf(0, 200, 0, 220, 0, 255), -1)
            "warn" -> compose(Triple(click, 1f, 0), Triple(click, 1f, 70)) ?: predefined(VibrationEffect.EFFECT_DOUBLE_CLICK)
                ?: VibrationEffect.createWaveform(longArrayOf(0, 30, 55, 30), -1)
            "heavy" -> predefined(VibrationEffect.EFFECT_HEAVY_CLICK) ?: VibrationEffect.createOneShot(26, 255)
            else -> compose(Triple(tick, 0.5f, 0)) ?: VibrationEffect.createOneShot(8, 80)
        }
        try { v.vibrate(e) } catch (x: Exception) { /* no vibrator, or not allowed */ }
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
