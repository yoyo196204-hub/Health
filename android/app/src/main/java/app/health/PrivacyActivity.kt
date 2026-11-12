package app.health

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

/** What Health Connect shows when you ask why this app wants access. */
class PrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        setContentView(TextView(this).apply {
            setPadding(pad, pad, pad, pad)
            textSize = 16f
            text = "Health reads steps, sleep, heart rate, workouts, weight and related figures from Health Connect " +
                "to set your daily targets and show your trends. It only reads; it never writes or deletes. " +
                "The app has no internet permission, so nothing it reads can leave this phone."
        })
    }
}
