package app.health

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.health.connect.client.PermissionController
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.ByteArrayInputStream

/**
 * The whole app is the web app in assets/www, shown in a WebView. Native code adds what a browser
 * cannot do: read Health Connect, talk to the H9 over the phone's own Bluetooth, and write files.
 * The app has no internet permission, so the page can only ever reach its own bundled files.
 */
class MainActivity : ComponentActivity() {
    lateinit var web: WebView
    val main = Handler(Looper.getMainLooper())
    lateinit var health: HealthReader
    lateinit var strap: Strap
    lateinit var files: Files

    private var ready = false
    private val queued = ArrayList<String>()
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var afterBluetooth: ((Boolean) -> Unit)? = null

    // Activity results are registered up front, as Android requires.
    val pickFiles = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        fileCallback?.onReceiveValue(uris.toTypedArray()); fileCallback = null
    }
    val createJson = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { files.saved(it) }
    val pickFolder = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { files.folderPicked(it) }
    val healthPermissions = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { health.status() }
    private val bluetoothPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        afterBluetooth?.invoke(r.values.all { it }); afterBluetooth = null
    }
    private val bluetoothOn = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        afterBluetooth?.invoke(it.resultCode == RESULT_OK); afterBluetooth = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        health = HealthReader(this); strap = Strap(this); files = Files(this)

        // Draw edge to edge, and pad the page by the system bars and the keyboard so nothing hides behind them.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val root = FrameLayout(this).apply { setBackgroundColor(if (night) 0xFF14110D.toInt() else 0xFFF5EFE3.toInt()) }
        web = WebView(this)
        root.addView(web, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)
        WindowInsetsControllerCompat(window, root).apply { isAppearanceLightStatusBars = !night; isAppearanceLightNavigationBars = !night }

        val assets = WebViewAssetLoader.Builder().addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(req.url)
                    ?: WebResourceResponse("text/plain", "utf-8", 404, "Not here", emptyMap(), ByteArrayInputStream(ByteArray(0)))

            // Only the app's own pages load inside the app; anything else goes to the phone.
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                if (req.url.host == HOST) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, req.url)) } catch (e: Exception) { /* nothing can open it */ }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                ready = true
                queued.forEach { web.evaluateJavascript(it, null) }
                queued.clear()
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                // CSV and JSON files are labelled inconsistently by file managers; the page checks the content itself.
                return try { pickFiles.launch(arrayOf("*/*")); true } catch (e: Exception) { fileCallback = null; false }
            }
        }
        web.addJavascriptInterface(Bridge(this), "HealthNative")
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack()
                else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        })

        if (savedInstanceState == null) web.loadUrl("https://$HOST/www/index.html")
        else web.restoreState(savedInstanceState)
        handle(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    // Data handed over from the web app in Chrome arrives as app.health://import?d=<gzip, base64url>.
    private fun handle(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "app.health" && data.host == "import") {
            val d = data.getQueryParameter("d")
            if (!d.isNullOrEmpty() && d.length < 600_000) emit("import", JSONObject().put("d", d).toString())
        }
    }

    override fun onResume() {
        super.onResume()
        if (ready) emit("resume", "{}")
    }

    override fun onDestroy() {
        strap.close()
        web.destroy()
        super.onDestroy()
    }

    /** Sends an event to the page: window.__fromNative(name, data). Safe from any thread; queued until the page is ready. */
    fun emit(event: String, json: String) {
        val js = "window.__fromNative&&window.__fromNative(${JSONObject.quote(event)},$json)"
        main.post { if (ready) web.evaluateJavascript(js, null) else queued.add(js) }
    }

    fun keepAwake(on: Boolean) = main.post {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    fun askBluetooth(perms: Array<String>, then: (Boolean) -> Unit) { afterBluetooth = then; bluetoothPermissions.launch(perms) }

    @SuppressLint("MissingPermission")
    fun turnOnBluetooth(then: (Boolean) -> Unit) {
        afterBluetooth = then
        try { bluetoothOn.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)) } catch (e: Exception) { afterBluetooth = null; then(false) }
    }

    fun zeppIntent(): Intent? = packageManager.getLaunchIntentForPackage(ZEPP)

    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val ZEPP = "com.huami.watch.hmwatchmanager"
    }
}
