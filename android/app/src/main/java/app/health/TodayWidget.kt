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
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.widget.RemoteViews
import org.json.JSONObject
import java.time.LocalDate

/**
 * The home-screen widget: today's recovery, food left and sleep as three rings, and the kcal left below.
 * The page works the numbers out and hands them over (push) when the app goes to the background and after each
 * sync; the widget only draws them. On a new day, before the app has been opened, it shows dashes rather than
 * yesterday's figures as today's. A tap opens Today.
 */
class TodayWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) { ids.forEach { m.updateAppWidget(it, views(c)) } }

    companion object {
        private const val PREFS = "widget"

        /** New values from the page. */
        fun push(c: Context, json: String) {
            if (json.length > 4000) return
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("today", json).apply()
            val m = AppWidgetManager.getInstance(c)
            val ids = m.getAppWidgetIds(ComponentName(c, TodayWidget::class.java))
            if (ids.isNotEmpty()) { val v = views(c); ids.forEach { m.updateAppWidget(it, v) } }
        }

        private fun views(c: Context): RemoteViews {
            val raw = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("today", null)
            val d = try { raw?.let { JSONObject(it) } } catch (e: Exception) { null }
            val fresh = d != null && d.optString("day") == LocalDate.now().toString()
            val v = RemoteViews(c.packageName, R.layout.widget_today)
            v.setImageViewBitmap(R.id.widget_rings, rings(c, if (fresh) d else null))
            v.setTextViewText(R.id.widget_line, if (fresh) d!!.optString("line") else "Open Health to update today")
            val open = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("hash", "today")
            v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(c, 7001, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            return v
        }

        // The app's own colours (styles.css), light and dark.
        private class Pal(val ink: Int, val soft: Int, val track: Int, val good: Int, val mid: Int, val bad: Int, val fuel: Int, val sleep: Int)
        private val LIGHT = Pal(0xFF191814.toInt(), 0xFF6B675F.toInt(), 0x1F191814, 0xFF15994F.toInt(), 0xFFBF8E00.toInt(), 0xFFD9413A.toInt(), 0xFFD97A06.toInt(), 0xFF6A57DC.toInt())
        private val DARK = Pal(0xFFF3F1EC.toInt(), 0xFF9A968C.toInt(), 0x24FFFFFF, 0xFF3DCF7F.toInt(), 0xFFEFC04A.toInt(), 0xFFFF615A.toInt(), 0xFFF7A53A.toInt(), 0xFFA194FF.toInt())

        private fun rings(c: Context, d: JSONObject?): Bitmap {
            val night = (c.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
            val p = if (night) DARK else LIGHT
            val w = 900; val h = 330
            val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val cv = Canvas(b)
            val rec = d?.optJSONObject("rec"); val fuel = d?.optJSONObject("fuel"); val sleep = d?.optJSONObject("sleep")
            val recC = when (rec?.optString("z")) { "go" -> p.good; "care" -> p.mid; "easy" -> p.bad; else -> p.soft }
            val items = listOf(
                Triple(rec, recC, "Recovery"),
                Triple(fuel, if (fuel?.optBoolean("over") == true) p.bad else p.fuel, "kcal"),
                Triple(sleep, p.sleep, "Sleep"),
            )
            val stroke = 22f; val r = 105f; val cy = 125f
            val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; color = p.track }
            val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; strokeCap = Paint.Cap.ROUND }
            val big = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; textSize = 62f; color = p.ink; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
            val small = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; textSize = 30f; color = p.soft }
            val label = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; textSize = 34f; color = p.ink; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
            items.forEachIndexed { i, (o, col, name) ->
                val cx = w / 6f * (2 * i + 1)
                val box = RectF(cx - r, cy - r, cx + r, cy + r)
                cv.drawOval(box, track)
                val f = (o?.optDouble("f", 0.0) ?: 0.0).coerceIn(0.0, 1.0).toFloat()
                if (f > 0f) { arc.color = col; cv.drawArc(box, -90f, 360f * f, false, arc) }
                cv.drawText(o?.optString("v")?.ifBlank { null } ?: "–", cx, cy + 14f, big)
                cv.drawText(o?.optString("u") ?: "", cx, cy + 54f, small)
                cv.drawText(name, cx, h - 10f, label)
            }
            return b
        }
    }
}
