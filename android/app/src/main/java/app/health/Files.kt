package app.health

import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import org.json.JSONObject
import java.time.LocalDate
import java.util.concurrent.Executors

/**
 * Saving an export where you choose, and a daily backup into a folder you pick once.
 * The folder is outside the app, so the backup survives uninstalling or replacing the app.
 */
class Files(private val a: MainActivity) {
    private val io = Executors.newSingleThreadExecutor()
    private val prefs get() = a.getSharedPreferences("files", 0)
    private var pendingText: String? = null
    private var pendingName = ""

    fun save(name: String, text: String) {
        pendingText = text; pendingName = name
        try { a.createJson.launch(name) } catch (e: Exception) { pendingText = null; result(false, "No file picker on this phone.") }
    }
    fun saved(uri: Uri?) {
        val text = pendingText ?: return
        pendingText = null
        if (uri == null) return result(false, "Not saved")
        io.execute {
            try { a.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(text.toByteArray()) }; result(true, "", pendingName) }
            catch (e: Exception) { result(false, "Could not save: ${e.message}") }
        }
    }
    private fun result(ok: Boolean, msg: String, name: String = "") =
        a.emit("file-saved", JSONObject().put("ok", ok).put("msg", msg).put("name", name).toString())

    fun pickFolder() { try { a.pickFolder.launch(null) } catch (e: Exception) { backupEvent(JSONObject().put("msg", "No folder picker on this phone.")) } }
    fun folderPicked(uri: Uri?) {
        if (uri == null) return
        try {
            a.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            prefs.edit().putString("tree", uri.toString()).apply()
            backupEvent(JSONObject().put("folder", folderName()).put("picked", true).put("msg", "Backups will go to ${folderName()}"))
        } catch (e: Exception) { backupEvent(JSONObject().put("msg", "That folder cannot be used. Pick another, such as Documents.")) }
    }
    private fun tree(): Uri? {
        val u = prefs.getString("tree", null)?.let(Uri::parse) ?: return null
        return if (a.contentResolver.persistedUriPermissions.any { it.uri == u && it.isWritePermission }) u else null
    }
    fun folderName(): String? = tree()?.let { DocumentsContract.getTreeDocumentId(it).substringAfterLast(':').substringAfterLast('/').ifBlank { "your phone's storage" } }

    /** Writes "Health backup.json", replaced daily, and one file per month that is kept. */
    fun backup(json: String, manual: Boolean = false) = io.execute {
        val t = tree() ?: return@execute backupEvent(JSONObject().put("folder", JSONObject.NULL))
        try {
            for (name in listOf("Health backup.json", "Health backup ${LocalDate.now().toString().take(7)}.json")) {
                val doc = find(t, name) ?: DocumentsContract.createDocument(a.contentResolver, DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t)), "application/json", name)
                a.contentResolver.openOutputStream(doc!!, "wt")!!.use { it.write(json.toByteArray()) }
            }
            backupEvent(JSONObject().put("written", true).put("folder", folderName()).put("manual", manual))
        } catch (e: Exception) { backupEvent(JSONObject().put("msg", "Backup failed: ${e.message}. Choose the folder again in Me.")) }
    }
    private fun find(t: Uri, name: String): Uri? {
        val kids = DocumentsContract.buildChildDocumentsUriUsingTree(t, DocumentsContract.getTreeDocumentId(t))
        a.contentResolver.query(kids, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
            while (c.moveToNext()) if (c.getString(1) == name) return DocumentsContract.buildDocumentUriUsingTree(t, c.getString(0))
        }
        return null
    }
    private fun backupEvent(o: JSONObject) = a.emit("backup", o.toString())
}
