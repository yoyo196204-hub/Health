package app.health

import android.net.Uri
import android.content.Intent
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * openGym's backup folder. You pick it once; each time Health opens it looks there for openGym's newest automatic backup
 * (opengym-backup-YYYY-MM-DD.json, written by openGym's "Auto-backup on changes") and hands it to the page, which brings
 * the new workouts in. Health can also put its plan file there, next to openGym's backups, ready for openGym's import.
 * No storage permission is involved: the system folder picker grants access to that one folder and nothing else.
 */
class OpenGym(private val a: MainActivity) {
    private val io = Executors.newSingleThreadExecutor()
    private val prefs get() = a.getSharedPreferences("opengym", 0)
    @Volatile private var text: String? = null

    private class Doc(val id: String, val uri: Uri, val name: String, val mod: Long, val size: Long, val dir: Boolean)

    /** Opens the picker at Documents/openGym, where openGym keeps its backups unless you chose another folder there. */
    fun pick() {
        val start = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Documents/openGym")
        try { a.pickOgFolder.launch(start) } catch (e: Exception) { event(JSONObject().put("msg", "No folder picker on this phone.")) }
    }
    fun picked(uri: Uri?) {
        if (uri == null) return
        try {
            // Write access too, when the folder allows it, so Health can leave its plan file there.
            try { a.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
            catch (e: SecurityException) { a.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            prefs.edit().putString("tree", uri.toString()).apply()
            event(JSONObject().put("folder", folderName()).put("picked", true))
        } catch (e: Exception) { event(JSONObject().put("msg", "That folder cannot be used. Choose Documents › openGym.")) }
    }
    /** Forgets the folder. The access stays with the system: Health's own backup folder may be the same one. */
    fun unlink() { prefs.edit().remove("tree").apply() }

    private fun tree(): Uri? {
        val u = prefs.getString("tree", null)?.let(Uri::parse) ?: return null
        return if (a.contentResolver.persistedUriPermissions.any { it.uri == u && it.isReadPermission }) u else null
    }
    private fun folderName(): String? = tree()?.let { DocumentsContract.getTreeDocumentId(it).substringAfterLast(':').substringAfterLast('/').ifBlank { "your phone's storage" } }
    fun status(): String = JSONObject().put("folder", folderName() ?: JSONObject.NULL).put("app", a.packageManager.getLaunchIntentForPackage(PKG) != null).toString()

    private fun list(t: Uri, parent: String): List<Doc> {
        val out = ArrayList<Doc>()
        val cols = arrayOf(Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_LAST_MODIFIED, Document.COLUMN_SIZE, Document.COLUMN_MIME_TYPE)
        a.contentResolver.query(DocumentsContract.buildChildDocumentsUriUsingTree(t, parent), cols, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                val id = c.getString(0) ?: continue
                out.add(Doc(id, DocumentsContract.buildDocumentUriUsingTree(t, id), c.getString(1) ?: "", if (c.isNull(2)) 0 else c.getLong(2),
                    if (c.isNull(3)) 0 else c.getLong(3), c.getString(4) == Document.MIME_TYPE_DIR))
            }
        }
        return out
    }

    /**
     * Looks for openGym's newest backup. `seen` is "name|modified" of the one read last time: when nothing is newer,
     * nothing is read. The text waits in memory until the page takes it.
     */
    fun check(seen: String) = io.execute {
        val t = tree() ?: return@execute event(JSONObject().put("folder", JSONObject.NULL).put("error", true))
        try {
            val root = DocumentsContract.getTreeDocumentId(t)
            var docs = list(t, root)
            // Documents picked instead of Documents/openGym: look one level down as well.
            docs.firstOrNull { it.dir && it.name.equals("openGym", ignoreCase = true) }?.let { docs = docs + list(t, it.id) }
            val best = docs.filter { !it.dir && BACKUP.matches(it.name) && it.size in 0..MAX }
                .maxWithOrNull(compareBy<Doc>({ it.name.substring(15, 25) }, { it.mod })) ?: return@execute event(JSONObject().put("none", true))
            if ("${best.name}|${best.mod}" == seen) return@execute event(JSONObject().put("same", true))
            text = a.contentResolver.openInputStream(best.uri)!!.use { it.readBytes().toString(Charsets.UTF_8) }
            event(JSONObject().put("ready", true).put("file", best.name).put("mod", best.mod))
        } catch (e: Exception) {
            event(JSONObject().put("error", true).put("msg", "Could not read openGym's folder. Link it again in Me › Data sources."))
        }
    }
    fun take(): String? { val t = text; text = null; return t }

    /** Puts a file (Health's plan) in the openGym folder, replacing the one written there before. */
    fun write(name: String, body: String) = io.execute {
        val t = tree() ?: return@execute saved(false, "Link openGym's folder first, or save the plan elsewhere.")
        try {
            val root = DocumentsContract.getTreeDocumentId(t)
            val doc = list(t, root).firstOrNull { !it.dir && it.name == name }?.uri
                ?: DocumentsContract.createDocument(a.contentResolver, DocumentsContract.buildDocumentUriUsingTree(t, root), "application/json", name)
            a.contentResolver.openOutputStream(doc!!, "wt")!!.use { it.write(body.toByteArray()) }
            saved(true, "", "$name in ${folderName()}")
        } catch (e: Exception) { saved(false, "Health may only read that folder. Tap Save it elsewhere instead.") }
    }
    private fun saved(ok: Boolean, msg: String, name: String = "") =
        a.emit("file-saved", JSONObject().put("ok", ok).put("msg", msg).put("name", name).toString())

    fun open() = a.main.post { a.packageManager.getLaunchIntentForPackage(PKG)?.let { try { a.startActivity(it) } catch (e: Exception) { } } }

    private fun event(o: JSONObject) = a.emit("og", o.toString())

    companion object {
        const val PKG = "ch.duartesantos.opengym"
        val BACKUP = Regex("^opengym-backup-\\d{4}-\\d{2}-\\d{2}(-[2-9])?\\.json$")
        const val MAX = 40_000_000L
    }
}
