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
    @JavascriptInterface fun backupWrite(json: String) { a.files.backup(json) }
    @JavascriptInterface fun share(title: String, text: String) = a.main.post {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text)
        try { a.startActivity(Intent.createChooser(send, title)) } catch (e: Exception) { /* nothing to share with */ }
    }
    @JavascriptInterface fun openZepp() = a.main.post { a.zeppIntent()?.let { try { a.startActivity(it) } catch (e: Exception) { } } }
}
