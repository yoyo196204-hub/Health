package app.health

import android.annotation.SuppressLint
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
@SuppressLint("InlinedApi")
class Feel(private val a: MainActivity) {
    private val vib: Vibrator? = if (Build.VERSION.SDK_INT >= 31) (a.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager?)?.defaultVibrator
        else @Suppress("DEPRECATION") (a.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator?)
    private val amp = vib?.hasAmplitudeControl() == true

    // Which haptic primitives this phone can play, each checked on its own: many phones have click and tick but not
    // the richer ones (slow rise, quick fall, thud, low tick).
    private val CLICK = VibrationEffect.Composition.PRIMITIVE_CLICK
    private val TICK = VibrationEffect.Composition.PRIMITIVE_TICK
    private val RISE = VibrationEffect.Composition.PRIMITIVE_SLOW_RISE
    private val FALL = VibrationEffect.Composition.PRIMITIVE_QUICK_FALL
    private val THUD = if (Build.VERSION.SDK_INT >= 31) VibrationEffect.Composition.PRIMITIVE_THUD else -1
    private val LOW = if (Build.VERSION.SDK_INT >= 31) VibrationEffect.Composition.PRIMITIVE_LOW_TICK else -1
    private val has: Set<Int> = supported()
    /**
     * A rotor (ERM) motor, as in the OnePlus Nord CE 5: no haptic primitives and no amplitude control. It spins up in
     * 20–40 ms, so very short pulses are not felt and close ones blur into one buzz. Such phones get the maker's own
     * tuned clicks, and the patterns below use longer pulses with wider gaps.
     */
    val rotor: Boolean = vib != null && has.isEmpty() && !amp
    private fun supported(): Set<Int> {
        val v = vib ?: return emptySet()
        if (Build.VERSION.SDK_INT < 30) return emptySet()
        return try {
            val all = listOf(CLICK, TICK, RISE, FALL, THUD, LOW).filter { it >= 0 }
            val ok = v.arePrimitivesSupported(*all.toIntArray())
            all.filterIndexed { i, _ -> ok[i] }.toSet()
        } catch (e: Throwable) { emptySet() }
    }

    /** A composition of (primitive, strength, delay ms); null unless every primitive in it is supported. */
    private fun compose(vararg parts: Triple<Int, Float, Int>): VibrationEffect? {
        if (Build.VERSION.SDK_INT < 30 || parts.any { it.first !in has }) return null
        val c = VibrationEffect.startComposition()
        for ((p, s, d) in parts) c.addPrimitive(p, s, d)
        return c.compose()
    }
    private fun predefined(id: Int): VibrationEffect? = if (Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(id) else null
    /** A shaped pulse train: durations and strengths 0–255, played as a buzz of one strength where amplitude cannot be set. */
    private fun wave(ms: LongArray, st: IntArray): VibrationEffect =
        if (amp) VibrationEffect.createWaveform(ms, st, -1) else VibrationEffect.createWaveform(ms, -1)

    /**
     * The vocabulary the page uses. press: a finger lands on something; tick: a value or choice changed, a gesture
     * crossed its threshold; swipe: a swipe committed; ok: saved; done: a session or check finished; warn: refused or a
     * cue that needs action; heavy: data removed; inhale / exhale / hold: the breathing pacer. Safe from any thread.
     */
    fun haptic(kind: String) {
        val v = vib ?: return
        if (!v.hasVibrator()) return
        val e: VibrationEffect = when (kind) {
            "press" -> compose(Triple(TICK, 1f, 0)) ?: predefined(VibrationEffect.EFFECT_TICK) ?: VibrationEffect.createOneShot(6, 120)
            // The ruler: one light detent per step, like a dial.
            "detent" -> compose(Triple(TICK, 0.55f, 0)) ?: predefined(VibrationEffect.EFFECT_TICK) ?: VibrationEffect.createOneShot(5, 90)
            "tick" -> compose(Triple(CLICK, 0.6f, 0)) ?: predefined(VibrationEffect.EFFECT_TICK) ?: VibrationEffect.createOneShot(10, 150)
            "swipe" -> compose(Triple(TICK, 0.8f, 0), Triple(CLICK, 0.7f, 40)) ?: predefined(VibrationEffect.EFFECT_CLICK) ?: VibrationEffect.createOneShot(12, 170)
            "ok" -> compose(Triple(CLICK, 1f, 0), Triple(TICK, 0.6f, 50)) ?: predefined(VibrationEffect.EFFECT_CLICK) ?: VibrationEffect.createOneShot(16, 210)
            "done" -> compose(Triple(RISE, 0.5f, 0), Triple(CLICK, 1f, 20), Triple(CLICK, 0.8f, 90), Triple(CLICK, 1f, 110))
                ?: compose(Triple(CLICK, 0.7f, 0), Triple(CLICK, 0.85f, 90), Triple(CLICK, 1f, 110))
                ?: if (rotor) VibrationEffect.createWaveform(longArrayOf(0, 32, 120, 32, 120, 48), -1)
                else wave(longArrayOf(0, 18, 70, 18, 70, 36), intArrayOf(0, 200, 0, 230, 0, 255))
            "warn" -> compose(Triple(THUD, 1f, 0), Triple(CLICK, 1f, 80)) ?: compose(Triple(CLICK, 1f, 0), Triple(CLICK, 1f, 70))
                ?: predefined(VibrationEffect.EFFECT_DOUBLE_CLICK) ?: wave(longArrayOf(0, 30, 55, 30), intArrayOf(0, 255, 0, 255))
            "heavy" -> compose(Triple(THUD, 1f, 0), Triple(CLICK, 1f, 30)) ?: predefined(VibrationEffect.EFFECT_HEAVY_CLICK) ?: VibrationEffect.createOneShot(30, 255)
            // The pacer: a swell for breathing in, a falling ease for breathing out, a soft low tick on a hold.
            "inhale" -> compose(Triple(RISE, 1f, 0)) ?: if (rotor) VibrationEffect.createWaveform(longArrayOf(0, 24, 140, 36), -1) else wave(longArrayOf(0, 60, 60, 60, 60, 60), intArrayOf(0, 40, 80, 120, 170, 220))
            "exhale" -> compose(Triple(FALL, 1f, 0), Triple(LOW, 0.5f, 120)) ?: compose(Triple(FALL, 1f, 0))
                ?: if (rotor) VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE) else wave(longArrayOf(0, 60, 60, 60, 60), intArrayOf(0, 200, 140, 80, 30))
            "hold" -> compose(Triple(LOW, 1f, 0)) ?: compose(Triple(TICK, 0.5f, 0)) ?: VibrationEffect.createOneShot(8, 90)
            else -> compose(Triple(TICK, 0.6f, 0)) ?: VibrationEffect.createOneShot(8, 100)
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
