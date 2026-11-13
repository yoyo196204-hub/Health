package app.health

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONArray

/**
 * Reminders: the page works out what is due over the next week (a morning check not yet done, a waist not measured
 * this week, an evening look at the food log) and hands over the list each time the app is opened or left. Each is an
 * inexact alarm, so no special permission is needed and Android may deliver it a few minutes late to save battery.
 * The list is kept, so the alarms come back after a restart of the phone.
 */
object Remind {
    const val CHANNEL = "reminders"
    private const val ACTION = "app.health.REMIND"
    private fun prefs(c: Context) = c.getSharedPreferences("remind", 0)

    fun allowed(c: Context) = Build.VERSION.SDK_INT < 33 || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Replaces every reminder with this list: [{id, at, title, text, hash}]. */
    fun plan(c: Context, json: String) {
        val list = try { JSONArray(json) } catch (e: Exception) { return }
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val old = prefs(c).getStringSet("ids", emptySet()) ?: emptySet()
        for (id in old) am.cancel(pending(c, id, null, null, null))
        val ids = HashSet<String>()
        val now = System.currentTimeMillis()
        for (i in 0 until minOf(list.length(), 30)) {
            val o = list.optJSONObject(i) ?: continue
            val id = o.optString("id").take(40)
            val at = o.optLong("at")
            if (id.isEmpty() || at <= now) continue
            ids += id
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(c, id, o.optString("title").take(60), o.optString("text").take(240), o.optString("hash").take(20)))
        }
        prefs(c).edit().putStringSet("ids", ids).putString("list", json.take(40_000)).apply()
    }

    private fun pending(c: Context, id: String, title: String?, text: String?, hash: String?): PendingIntent {
        val i = Intent(c, RemindReceiver::class.java).setAction(ACTION).setData(android.net.Uri.parse("health-remind://$id"))
        if (title != null) i.putExtra("title", title).putExtra("text", text).putExtra("hash", hash)
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    fun channel(c: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = c.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Morning check, weigh-in, waist and food log" })
    }

    fun show(c: Context, id: String, title: String, text: String, hash: String) {
        if (!allowed(c)) return
        channel(c)
        val open = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("hash", hash)
        val tap = PendingIntent.getActivity(c, id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = (if (Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(c, CHANNEL) else @Suppress("DEPRECATION") android.app.Notification.Builder(c))
            .setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(text)
            .setStyle(android.app.Notification.BigTextStyle().bigText(text)).setContentIntent(tap).setAutoCancel(true).build()
        try { c.getSystemService(NotificationManager::class.java).notify(id.hashCode(), n) } catch (e: SecurityException) { /* not allowed */ }
    }

    /** After a restart of the phone, the alarms that are still ahead are set again. */
    fun restore(c: Context) { prefs(c).getString("list", null)?.let { plan(c, it) } }
}

class RemindReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        when (i.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Remind.restore(c)
            else -> {
                val id = i.data?.host ?: return
                Remind.show(c, id, i.getStringExtra("title") ?: "Health", i.getStringExtra("text") ?: "", i.getStringExtra("hash") ?: "today")
            }
        }
    }
}
