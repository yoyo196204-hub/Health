package app.health

import android.content.Context
import java.io.File

/**
 * A crash in the app's own Kotlin code: its message and first app frame (file:line) are written to a private file
 * before Android ends the app, and the page puts them in its error log the next time it opens. Nothing leaves the phone.
 */
object Crash {
    private fun file(c: Context) = File(c.filesDir, "last-crash.txt")

    fun install(c: Context) {
        val app = c.applicationContext
        val before = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val frame = e.stackTrace.firstOrNull { it.className.startsWith("app.health") } ?: e.stackTrace.firstOrNull()
                val at = frame?.let { "${it.fileName ?: "?"}:${it.lineNumber}" } ?: ""
                val msg = "${e.javaClass.simpleName}: ${e.message ?: ""} (thread ${t.name})".take(300)
                file(app).writeText("${System.currentTimeMillis()}\n$at\n$msg")
            } catch (_: Throwable) { /* nothing more can be done */ }
            before?.uncaughtException(t, e)
        }
    }

    /** The last crash as "time\nfile:line\nmessage", once; null when there was none. */
    fun take(c: Context): String? {
        val f = file(c)
        if (!f.exists()) return null
        return try { f.readText() } catch (_: Throwable) { null } finally { f.delete() }
    }
}
