# Methods the web app calls through window.HealthNative must keep their names.
-keepclassmembers class app.health.Bridge { @android.webkit.JavascriptInterface <methods>; }
-keepattributes JavascriptInterface
