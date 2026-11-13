package app.health

import android.content.Intent
import android.content.pm.PackageManager
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * window.HealthNative in the page. Calls arrive on a background thread and return at once;
 * anything slow answers later through MainActivity.emit().
 */
class Bridge(private val a: MainActivity) {
    @JavascriptInterface fun info(): String = JSONObject()
        .put("version", BuildConfig.VERSION_NAME)
        .put("zepp", a.zeppIntent() != null)
        .put("ble", a.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE))
        .toString()

    // Health Connect
    @JavascriptInterface fun hcStatus() = a.main.post { a.health.status() }
    @JavascriptInterface fun hcRequest() = a.main.post { a.health.request() }
    @JavascriptInterface fun hcRead(json: String) = a.main.post { a.health.read(json) }

    // The heart-rate strap
    @JavascriptInterface fun bleConnect(id: String) = a.main.post { a.strap.connect(id.ifBlank { null }) }
    @JavascriptInterface fun bleDisconnect() = a.main.post { a.strap.disconnect() }
    @JavascriptInterface fun bleForget() = a.main.post { a.strap.disconnect() }
    @JavascriptInterface fun keepAwake(on: Boolean) { a.keepAwake(on) }

    // Files, sharing and the daily backup
    @JavascriptInterface fun saveFile(name: String, mime: String, text: String) = a.main.post { a.files.save(name, text) }
    @JavascriptInterface fun backupStatus(): String = JSONObject().put("folder", a.files.folderName() ?: JSONObject.NULL).toString()
    @JavascriptInterface fun backupPick() = a.main.post { a.files.pickFolder() }
    @JavascriptInterface fun backupWrite(json: String, manual: Boolean) { a.files.backup(json, manual) }
    @JavascriptInterface fun share(title: String, text: String) = a.main.post {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text)
        try { a.startActivity(Intent.createChooser(send, title)) } catch (e: Exception) { /* nothing to share with */ }
    }
    // openGym: its backup folder, read each time the app opens; Health's plan file written next to it
    @JavascriptInterface fun ogStatus(): String = a.og.status()
    @JavascriptInterface fun ogPick() = a.main.post { a.og.pick() }
    @JavascriptInterface fun ogUnlink() { a.og.unlink() }
    @JavascriptInterface fun ogCheck(seen: String) { a.og.check(seen) }
    @JavascriptInterface fun ogTake(): String? = a.og.take()
    @JavascriptInterface fun ogWrite(name: String, text: String) { a.og.write(name, text) }
    @JavascriptInterface fun openOpenGym() { a.og.open() }
    // Haptics (played straight away, from this thread), the private copy and the theme
    @JavascriptInterface fun haptic(kind: String): Boolean { a.feel.haptic(kind); return true }
    // Reminders: the page's list of what is due, and the notification permission
    @JavascriptInterface fun remind(json: String) { Remind.plan(a, json) }
    @JavascriptInterface fun remindAllowed(): Boolean = Remind.allowed(a)
    @JavascriptInterface fun remindAsk() = a.main.post { a.askNotifications() }
    @JavascriptInterface fun mirrorRead(): String? = a.feel.mirrorRead()
    @JavascriptInterface fun mirrorWrite(json: String) { a.feel.mirrorWrite(json) }
    @JavascriptInterface fun setTheme(dark: Boolean) { a.setTheme(dark) }
    @JavascriptInterface fun openZepp() = a.main.post { a.zeppIntent()?.let { try { a.startActivity(it) } catch (e: Exception) { } } }
}
