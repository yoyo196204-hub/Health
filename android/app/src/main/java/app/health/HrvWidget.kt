package app.health

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.math.ln

/**
 * The HRV widget: the last four weeks of morning checks against your normal range, the way the trials read it.
 * The shaded band is your range (baseline mean ± ½ SD of ln RMSSD), the dots are the mornings, and the line is the
 * 7-day average, which is what gets compared with the band. The page works everything out and hands it over; the
 * widget only draws. A tap opens the strap's Trends.
 */
class HrvWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) { ids.forEach { m.updateAppWidget(it, views(c)) } }

    companion object {
        private const val PREFS = "widget"

        fun push(c: Context, json: String) {
            if (json.length > 8000) return
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("hrv", json).apply()
            val m = AppWidgetManager.getInstance(c)
            val ids = m.getAppWidgetIds(ComponentName(c, HrvWidget::class.java))
            if (ids.isNotEmpty()) { val v = views(c); ids.forEach { m.updateAppWidget(it, v) } }
        }

        private fun views(c: Context): RemoteViews {
            val raw = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("hrv", null)
            val d = try { raw?.let { JSONObject(it) } } catch (e: Exception) { null }
            val v = RemoteViews(c.packageName, R.layout.widget_today)
            v.setImageViewBitmap(R.id.widget_rings, draw(c, d))
            v.setTextViewText(R.id.widget_line, d?.optString("line")?.ifBlank { null } ?: "Open Health after a morning check")
            val open = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("hash", "strap-trends")
            v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(c, 7002, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            return v
        }

        private fun draw(c: Context, d: JSONObject?): Bitmap {
            val night = (c.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
            val ink = if (night) 0xFFF3F1EC.toInt() else 0xFF191814.toInt()
            val soft = if (night) 0xFF9A968C.toInt() else 0xFF6B675F.toInt()
            val accent = if (night) 0xFFA194FF.toInt() else 0xFF6A57DC.toInt()
            val band = if (night) 0x33A194FF else 0x266A57DC
            val col = when (d?.optString("state")) { "low" -> if (night) 0xFFFF615A.toInt() else 0xFFD9413A.toInt(); "high" -> if (night) 0xFFEFC04A.toInt() else 0xFFBF8E00.toInt(); else -> if (night) 0xFF3DCF7F.toInt() else 0xFF15994F.toInt() }
            val w = 900; val h = 330
            val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val cv = Canvas(b)
            val title = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 36f; color = ink; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
            val big = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 64f; color = col; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); textAlign = Paint.Align.RIGHT }
            val small = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 28f; color = soft; textAlign = Paint.Align.RIGHT }
            cv.drawText("Morning HRV", 6f, 44f, title)
            val roll = d?.optDouble("roll", Double.NaN) ?: Double.NaN
            cv.drawText(if (roll.isNaN()) "–" else "${roll.toInt()}", w - 70f, 60f, big)
            cv.drawText("ms", w - 6f, 60f, small)
            val pts = d?.optJSONArray("pts")
            val lo = d?.optDouble("lo", Double.NaN) ?: Double.NaN; val hi = d?.optDouble("hi", Double.NaN) ?: Double.NaN
            if (pts == null || pts.length() < 2) return b
            // ln scale, as the band is defined
            val vals = ArrayList<Double>()
            for (i in 0 until pts.length()) { val p = pts.getJSONObject(i); listOf("v", "r").forEach { k -> p.optDouble(k, Double.NaN).takeIf { !it.isNaN() && it > 0 }?.let { vals.add(ln(it)) } } }
            if (!lo.isNaN()) { vals.add(ln(lo)); vals.add(ln(hi)) }
            if (vals.isEmpty()) return b
            var y0 = vals.min(); var y1 = vals.max(); val pad = (y1 - y0).coerceAtLeast(0.1) * 0.15; y0 -= pad; y1 += pad
            val top = 90f; val bot = h - 10f; val left = 6f; val right = w - 6f; val n = pts.length()
            fun X(i: Int) = left + (right - left) * i / (n - 1)
            fun Y(v: Double) = (bot - (bot - top) * ((ln(v) - y0) / (y1 - y0))).toFloat()
            if (!lo.isNaN()) cv.drawRoundRect(RectF(left, Y(hi), right, Y(lo)), 10f, 10f, Paint().apply { color = band })
            val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = soft; alpha = 60; strokeWidth = 2f; pathEffect = DashPathEffect(floatArrayOf(6f, 8f), 0f) }
            cv.drawLine(left, bot, right, bot, grid)
            val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = soft }
            val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent; style = Paint.Style.STROKE; strokeWidth = 7f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
            val path = Path(); var started = false
            for (i in 0 until n) {
                val p = pts.getJSONObject(i)
                p.optDouble("v", Double.NaN).takeIf { !it.isNaN() && it > 0 }?.let { cv.drawCircle(X(i), Y(it), 7f, dot) }
                val r = p.optDouble("r", Double.NaN)
                if (!r.isNaN() && r > 0) { if (!started) { path.moveTo(X(i), Y(r)); started = true } else path.lineTo(X(i), Y(r)) } else started = false
            }
            cv.drawPath(path, line)
            return b
        }
    }
}
