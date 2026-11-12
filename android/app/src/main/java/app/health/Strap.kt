package app.health

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.widget.ArrayAdapter
import org.json.JSONObject
import java.util.UUID

/**
 * The heart-rate strap over the phone's own Bluetooth: the standard Heart Rate service (0x180D),
 * so any strap works; built and tested around the Polar H9. Packets go to the page unchanged,
 * where the same parser as in Chrome reads them.
 */
@SuppressLint("MissingPermission")
@Suppress("DEPRECATION")   // the pre-Android 13 GATT calls are still needed down to Android 9
class Strap(private val a: MainActivity) {
    private val hrService = uuid(0x180D)
    private val hrMeasure = uuid(0x2A37)
    private val batteryService = uuid(0x180F)
    private val batteryLevel = uuid(0x2A19)
    private val cccd = uuid(0x2902)

    private var gatt: BluetoothGatt? = null
    private var device: BluetoothDevice? = null
    private var name = "Strap"
    private var scanning: ScanCallback? = null
    private var picker: AlertDialog? = null
    private var userClosed = false
    private var connected = false
    private var retries = 0
    private val found = ArrayList<BluetoothDevice>()
    private val labels = ArrayList<String>()

    private fun uuid(short: Int) = UUID.fromString(String.format("%08x-0000-1000-8000-00805f9b34fb", short))
    private fun adapter() = (a.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter
    private fun state(s: String, extra: JSONObject.() -> Unit = {}) = a.emit("ble", JSONObject().put("state", s).apply(extra).toString())
    private fun fail(msg: String) { stopScan(); state("error") { put("msg", msg) } }

    private fun needed() = if (Build.VERSION.SDK_INT >= 31) arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

    /** Connects to the strap with this address if it is around; otherwise lets you choose from the straps in range. */
    fun connect(remembered: String?) {
        val missing = needed().filter { a.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) { a.askBluetooth(missing.toTypedArray()) { ok -> if (ok) connect(remembered) else fail("Bluetooth permission was not given.") }; return }
        val ad = adapter() ?: return fail("This phone has no Bluetooth.")
        if (!ad.isEnabled) { a.turnOnBluetooth { ok -> if (ok) connect(remembered) else fail("Bluetooth is off.") }; return }
        close()
        userClosed = false; retries = 0
        scan(remembered)
    }

    private fun scan(remembered: String?) {
        val scanner = adapter()?.bluetoothLeScanner ?: return fail("Bluetooth is not ready. Try again.")
        found.clear(); labels.clear()
        state("scanning")
        val cb = object : ScanCallback() {
            override fun onScanResult(type: Int, r: ScanResult) {
                val dev = r.device
                if (found.any { it.address == dev.address }) return
                found += dev
                labels += (r.scanRecord?.deviceName ?: dev.name ?: "Heart-rate strap") + "  ·  " + (r.rssi + 100).coerceIn(0, 100) / 10 + " bars"
                if (dev.address == remembered) { pick(dev); return }
                a.main.post { (picker?.listView?.adapter as? ArrayAdapter<*>)?.notifyDataSetChanged() }
            }
            override fun onScanFailed(code: Int) { fail("Bluetooth scan failed ($code). Turn Bluetooth off and on, then try again.") }
        }
        scanning = cb
        scanner.startScan(listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(hrService)).build()),
            ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
        // The remembered strap usually answers within a second or two; otherwise show the choice.
        a.main.postDelayed({ if (scanning === cb && device == null) showPicker() }, if (remembered != null) 4000 else 1200)
        a.main.postDelayed({ if (scanning === cb && device == null && found.isEmpty()) { picker?.dismiss(); fail("No strap found. Wet the electrodes and wear it: it only wakes up on skin.") } }, 20000)
    }

    private fun showPicker() {
        val adapter = ArrayAdapter(a, android.R.layout.simple_list_item_1, labels)
        picker = AlertDialog.Builder(a)
            .setTitle("Choose your strap")
            .setAdapter(adapter) { _, i -> found.getOrNull(i)?.let { pick(it) } }
            .setNegativeButton("Cancel") { _, _ -> disconnect() }
            .setOnCancelListener { if (device == null) disconnect() }
            .show()
    }

    private fun stopScan() {
        scanning?.let { cb -> try { adapter()?.bluetoothLeScanner?.stopScan(cb) } catch (e: Exception) { } }
        scanning = null
    }

    private fun pick(dev: BluetoothDevice) = a.main.post {
        if (device != null) return@post
        stopScan(); picker?.dismiss(); picker = null
        device = dev
        name = dev.name ?: "Strap"
        state("connecting") { put("name", name) }
        gatt = dev.connectGatt(a, false, callback, BluetoothDevice.TRANSPORT_LE)
    }

    fun disconnect() {
        userClosed = true
        stopScan(); picker?.dismiss(); picker = null
        val g = gatt
        if (g != null) g.disconnect() else state("disconnected")
        if (g != null && !connected) { g.close(); gatt = null; device = null; state("disconnected") }
    }

    fun close() {
        stopScan()
        gatt?.close(); gatt = null; device = null; connected = false
    }

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) { a.main.post { g.discoverServices() }; return }
            if (newState != BluetoothProfile.STATE_DISCONNECTED) return
            val was = connected
            connected = false
            g.close()
            if (gatt === g) gatt = null
            // A strap that drops mid-workout (sweat, a loose strap) gets three chances to come back on its own.
            val dev = device
            if (!userClosed && dev != null && retries < 3) {
                retries++
                state("connecting") { put("name", name) }
                a.main.postDelayed({ if (!userClosed && gatt == null) gatt = dev.connectGatt(a, true, this, BluetoothDevice.TRANSPORT_LE) }, 1500)
                return
            }
            device = null
            state("disconnected") { put("msg", if (userClosed) "" else if (was) "The strap disconnected." else "Could not reach the strap. Wet the electrodes and try again.") }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            val ch = g.getService(hrService)?.getCharacteristic(hrMeasure) ?: return run { fail("This device has no heart-rate service."); g.disconnect() }
            g.setCharacteristicNotification(ch, true)
            val d = ch.getDescriptor(cccd) ?: return
            if (Build.VERSION.SDK_INT >= 33) g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            else { d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE; g.writeDescriptor(d) }
        }

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
            connected = true; retries = 0
            state("connected") { put("name", name); put("id", g.device.address) }
            g.getService(batteryService)?.getCharacteristic(batteryLevel)?.let { g.readCharacteristic(it) }
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray) = beat(ch, value)
        @Deprecated("Android 12 and older")
        override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
            if (Build.VERSION.SDK_INT < 33) beat(ch, ch.value ?: return)
        }
        override fun onCharacteristicRead(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray, status: Int) = battery(ch, value)
        @Deprecated("Android 12 and older")
        override fun onCharacteristicRead(g: BluetoothGatt, ch: BluetoothGattCharacteristic, status: Int) {
            if (Build.VERSION.SDK_INT < 33) battery(ch, ch.value ?: return)
        }
    }

    private fun beat(ch: BluetoothGattCharacteristic, v: ByteArray) {
        if (ch.uuid == hrMeasure) a.emit("hr", v.joinToString(",", "[", "]") { (it.toInt() and 0xFF).toString() })
    }
    private fun battery(ch: BluetoothGattCharacteristic, v: ByteArray) {
        if (ch.uuid == batteryLevel && v.isNotEmpty()) state("battery") { put("battery", v[0].toInt() and 0xFF) }
    }
}
