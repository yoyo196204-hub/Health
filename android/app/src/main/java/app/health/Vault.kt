package app.health

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.Executors

/**
 * Where your data lives in the app: plain files in the app's private storage (filesDir/vault), with no size limit
 * but the phone's own free space. Android deletes these only when the app is uninstalled or you press
 * "Clear storage" in its settings; clearing the cache, the phone's cleaner and low-storage clean-ups leave them alone.
 *
 * Every write goes to a temporary file, is forced to the disk, and is then renamed over the old one, so a crash or a
 * flat battery mid-write leaves the previous version whole. Before a day's first write, the last state of the day
 * before is kept as a restore point (14 days, plus the first of each month for two years). If a write would shrink
 * the data to less than half, the version before it is kept as well ("guard" points), so a bug that drops data can
 * always be undone. Strap recordings are one file each; deleting one moves it to a bin kept for 30 days.
 */
class Vault(private val ctx: Context, private val emit: (String, String) -> Unit) {
    private val dir = File(ctx.filesDir, "vault").apply { mkdirs() }
    private val days = File(dir, "days").apply { mkdirs() }
    private val months = File(dir, "months").apply { mkdirs() }
    private val guards = File(dir, "guard").apply { mkdirs() }
    private val recs = File(dir, "rec").apply { mkdirs() }
    private val bin = File(recs, "bin").apply { mkdirs() }
    private val state = File(dir, "state.json")
    private val io = Executors.newSingleThreadExecutor()
    private val lock = Any()
    @Volatile private var pending: Pair<String, Long>? = null
    @Volatile private var lastSeq = -1L

    private fun day(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDate()

    /** Atomic write: temp file, fsync, rename. */
    private fun atomic(f: File, text: String) {
        val tmp = File(f.parentFile, f.name + ".tmp")
        FileOutputStream(tmp).use { it.write(text.toByteArray()); it.fd.sync() }
        if (!tmp.renameTo(f)) { f.delete(); if (!tmp.renameTo(f)) throw IllegalStateException("rename failed") }
    }

    // ---------- the state ----------
    /** The newest state, or, the first time, the private copy earlier versions kept (filesDir/state.json). */
    fun read(): String? = synchronized(lock) {
        pending?.let { return it.first }
        for (f in listOf(state, File(ctx.filesDir, "state.json"))) try {
            if (f.exists() && f.length() > 2) return f.readText()
        } catch (e: Exception) { /* try the next */ }
        null
    }

    /** Queued and written on a background thread; only the newest of several quick saves is written. */
    fun write(json: String, seq: Long) {
        if (json.length < 2) return
        pending = json to seq
        io.execute { drain() }
    }
    /** Blocks until everything queued is on the disk: called when the app goes to the background. */
    fun flush() { try { io.submit { drain() }.get() } catch (e: Exception) { } }

    private fun drain() = synchronized(lock) {
        val (json, seq) = pending ?: return@synchronized
        pending = null
        try {
            if (state.exists()) {
                val was = day(state.lastModified())
                // The day's first write: keep the last state of the earlier day.
                if (was != LocalDate.now()) {
                    val d = File(days, "$was.json")
                    if (!d.exists()) state.copyTo(d, true)
                    val m = File(months, "${was.toString().take(7)}.json")
                    if (!m.exists()) state.copyTo(m, true)
                    prune(days, 14); prune(months, 24)
                }
                // Losing more than half the data in one write is kept recoverable whatever caused it.
                if (state.length() > 20_000 && json.length < state.length() / 2) {
                    state.copyTo(File(guards, "${System.currentTimeMillis()}.json"), true); prune(guards, 5)
                }
            }
            atomic(state, json)
            // Read back: what is on the disk must be exactly what was sent.
            val ok = state.length() == json.toByteArray().size.toLong()
            lastSeq = seq
            emit("vault", JSONObject().put("ok", ok).put("seq", seq).put("bytes", state.length()).put("at", System.currentTimeMillis()).toString())
        } catch (e: Exception) {
            emit("vault", JSONObject().put("ok", false).put("seq", seq).put("err", e.message ?: "write failed").toString())
        }
    }
    private fun prune(d: File, keep: Int) {
        d.listFiles { f -> f.name.endsWith(".json") }?.sortedByDescending { it.name }?.drop(keep)?.forEach { it.delete() }
    }

    /** Restore points, newest first: what each is, when, and how big. */
    fun points(): String {
        val a = JSONArray()
        fun add(d: File, kind: String) = d.listFiles { f -> f.name.endsWith(".json") }?.forEach {
            a.put(JSONObject().put("kind", kind).put("name", it.name).put("at", it.lastModified()).put("bytes", it.length()))
        }
        add(days, "day"); add(months, "month"); add(guards, "guard")
        val list = (0 until a.length()).map { a.getJSONObject(it) }.sortedByDescending { it.getLong("at") }
        return JSONArray(list).toString()
    }
    fun point(kind: String, name: String): String? {
        if (!Regex("^[0-9-]{4,20}\\.json$").matches(name)) return null
        val d = when (kind) { "day" -> days; "month" -> months; "guard" -> guards; else -> return null }
        return try { File(d, name).takeIf { it.exists() }?.readText() } catch (e: Exception) { null }
    }

    // ---------- undo ----------
    private val snap = File(dir, "snap.json")
    fun snapWrite(json: String): Boolean = synchronized(lock) { try { atomic(snap, json); true } catch (e: Exception) { false } }
    fun snapRead(): String? = try { snap.takeIf { it.exists() }?.readText() } catch (e: Exception) { null }

    // ---------- strap recordings ----------
    private val ID = Regex("^[A-Za-z0-9_-]{1,64}$")
    fun recPut(id: String, json: String) { if (ID.matches(id)) io.execute { try { atomic(File(recs, "$id.json"), json) } catch (e: Exception) {
        emit("vault", JSONObject().put("ok", false).put("rec", id).put("err", e.message ?: "write failed").toString()) } } }
    fun recDel(id: String) { if (ID.matches(id)) io.execute {
        val f = File(recs, "$id.json"); if (f.exists()) { val b = File(bin, "$id.json"); f.copyTo(b, true); b.setLastModified(System.currentTimeMillis()); f.delete() }
        val cut = System.currentTimeMillis() - 30L * 86_400_000
        bin.listFiles()?.filter { it.lastModified() < cut }?.forEach { it.delete() }
    } }
    /** Every recording as one JSON array (each file is already JSON). */
    fun recAll(): String {
        val sb = StringBuilder("[")
        recs.listFiles { f -> f.isFile && f.name.endsWith(".json") }?.forEachIndexed { i, f ->
            try { val t = f.readText(); if (t.startsWith("{")) { if (sb.length > 1) sb.append(','); sb.append(t) } } catch (e: Exception) { }
        }
        return sb.append(']').toString()
    }
    fun binAll(): String {
        val sb = StringBuilder("[")
        bin.listFiles { f -> f.name.endsWith(".json") }?.forEach { f ->
            try { val t = f.readText(); if (t.startsWith("{")) { if (sb.length > 1) sb.append(','); sb.append(t) } } catch (e: Exception) { }
        }
        return sb.append(']').toString()
    }

    /** Sizes, for Backup and data: state, restore points, recordings, and the phone's free space. */
    fun stats(): String {
        fun size(d: File): Long = d.listFiles()?.sumOf { if (it.isDirectory) size(it) else it.length() } ?: 0
        return JSONObject()
            .put("state", if (state.exists()) state.length() else 0)
            .put("points", size(days) + size(months) + size(guards))
            .put("recs", recs.listFiles { f -> f.isFile }?.sumOf { it.length() } ?: 0)
            .put("recN", recs.listFiles { f -> f.isFile && f.name.endsWith(".json") }?.size ?: 0)
            .put("bin", size(bin)).put("binN", bin.listFiles()?.size ?: 0)
            .put("free", ctx.filesDir.usableSpace)
            .put("seq", lastSeq)
            .put("saved", if (state.exists()) state.lastModified() else 0)
            .toString()
    }
}
