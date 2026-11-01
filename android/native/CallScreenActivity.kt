package sa.aykdmh.app

import android.Manifest
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.twilio.audioswitch.AudioDevice
import io.livekit.android.AudioOptions
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.RoomOptions
import io.livekit.android.audio.AudioSwitchHandler
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The call itself, in the phone's own engine (AYK-145), like a phone call: voice through the
 * earpiece with the proximity sensor (screen off at the ear), or the speaker, a wired or Bluetooth
 * headset; video full screen with our own picture in a corner; it keeps going in other apps and
 * with the screen off. Started by the ring notification (answer) or by the site (calling).
 *
 * Intent: the URI aykdmhcall://call/<id>?user=&key=&type=audio|video&name=&code=&dir=in|out
 * or the same values as extras.
 */
class CallScreenActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val ui = Handler(Looper.getMainLooper())
    private var call: NativeCall? = null
    private var room: Room? = null
    private var audio: AudioSwitchHandler? = null
    private var proximity: PowerManager.WakeLock? = null
    private var ringback: ToneGenerator? = null
    private var connectedAt = 0L
    private var micOn = true
    private var camOn = true
    private var speakerOn = false
    private var ended = false

    private lateinit var status: TextView
    private lateinit var remoteView: TextureViewRenderer
    private lateinit var localView: TextureViewRenderer
    private lateinit var avatar: View
    private lateinit var micBtn: TextView
    private lateinit var speakerBtn: TextView
    private lateinit var camBtn: TextView

    companion object {
        @Volatile var current: CallScreenActivity? = null
        private const val PERMISSIONS = 7

        fun parse(intent: Intent?): NativeCall? {
            val data: Uri? = intent?.data
            fun value(name: String) = data?.getQueryParameter(name) ?: intent?.getStringExtra(name)
            val id = (data?.lastPathSegment ?: intent?.getStringExtra("call_id"))?.toLongOrNull() ?: return null
            val user = value("user")?.toLongOrNull() ?: return null
            val key = value("key") ?: return null
            return NativeCall(id, user, key, value("type") == "video", value("name") ?: "", value("code") ?: "", value("dir") != "in")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        val parsed = parse(intent) ?: run { finish(); return }
        current?.takeIf { it !== this }?.let { other -> if (other.call?.callId == parsed.callId) { finish(); return } }
        call = parsed
        current = this
        CallAlert.stop(this, "call-${parsed.callId}")
        buildScreen(parsed)
        val needed = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (parsed.video) needed += Manifest.permission.CAMERA
        if (Build.VERSION.SDK_INT >= 33) needed += Manifest.permission.POST_NOTIFICATIONS
        val missing = needed.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (Build.VERSION.SDK_INT >= 23 && missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), PERMISSIONS) else begin()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            status.text = getString(R.string.callNeedsMic)
            end(local = true, reason = "failed")
            return
        }
        begin()
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            getSystemService(KeyguardManager::class.java)?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        volumeControlStream = AudioManager.STREAM_VOICE_CALL
    }

    // ---------- the screen ----------

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun roundButton(label: String, color: Int, size: Int = 64, onClick: () -> Unit) = TextView(this).apply {
        text = label
        textSize = 24f
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(color) }
        layoutParams = LinearLayout.LayoutParams(dp(size), dp(size)).apply { setMargins(dp(10), 0, dp(10), 0) }
        setOnClickListener { onClick() }
    }

    private fun buildScreen(c: NativeCall) {
        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#0B1B33")) }
        remoteView = TextureViewRenderer(this).apply { visibility = View.GONE }
        root.addView(remoteView, FrameLayout.LayoutParams(-1, -1))
        localView = TextureViewRenderer(this).apply { visibility = View.GONE }
        root.addView(localView, FrameLayout.LayoutParams(dp(110), dp(160), Gravity.TOP or Gravity.END).apply { setMargins(0, dp(48), dp(16), 0) })

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(96), dp(24), dp(48))
        }
        avatar = TextView(this).apply {
            text = c.peerName.trim().take(1).ifEmpty { "☎" }
            textSize = 40f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#1E6FD9")) }
            layoutParams = LinearLayout.LayoutParams(dp(110), dp(110))
        }
        column.addView(avatar)
        column.addView(TextView(this).apply {
            text = c.peerName.ifEmpty { getString(R.string.callTitle) }
            textSize = 28f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, dp(20), 0, 0)
        })
        if (c.peerCode.isNotEmpty()) column.addView(TextView(this).apply {
            text = c.peerCode
            textSize = 15f
            setTextColor(Color.parseColor("#B8C7DC"))
            gravity = Gravity.CENTER
        })
        status = TextView(this).apply {
            text = getString(if (c.outgoing) R.string.callRinging else R.string.callConnecting)
            textSize = 17f
            setTextColor(Color.parseColor("#D6E2F0"))
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, 0)
        }
        column.addView(status)
        column.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))

        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        micBtn = roundButton("🎙", Color.parseColor("#33FFFFFF")) { toggleMic() }
        speakerBtn = roundButton("🔈", Color.parseColor("#33FFFFFF")) { toggleSpeaker() }
        camBtn = roundButton("📷", Color.parseColor("#33FFFFFF")) { toggleCamera() }
        controls.addView(micBtn)
        controls.addView(speakerBtn)
        if (c.video) {
            controls.addView(camBtn)
            controls.addView(roundButton("🔄", Color.parseColor("#33FFFFFF")) { switchCamera() })
        }
        column.addView(controls)
        column.addView(roundButton("✆", Color.parseColor("#E5484D"), 76) { end(local = true) }.apply {
            rotation = 135f
            (layoutParams as LinearLayout.LayoutParams).topMargin = dp(28)
        })
        root.addView(column, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
    }

    private fun setStatus(res: Int) = ui.post { if (!ended) status.text = getString(res) }

    private val ticker = object : Runnable {
        override fun run() {
            if (ended || connectedAt == 0L) return
            val s = (SystemClock.elapsedRealtime() - connectedAt) / 1000
            status.text = String.format(java.util.Locale.US, "%02d:%02d", s / 60, s % 60)
            ui.postDelayed(this, 1000)
        }
    }

    // ---------- the call ----------

    private fun begin() {
        val c = call ?: return
        CallOngoingService.start(this, c.peerName.ifEmpty { getString(R.string.callTitle) }, c.video)
        if (c.outgoing) CallTelecom.reportOutgoing(this, c.callId, c.peerName)
        CallTelecom.onHangUp = { id -> if (id == c.callId) ui.post { end(local = true) } }
        speakerOn = c.video
        scope.launch {
            try {
                if (!c.outgoing) CallApi.accept(c)
                val join = CallApi.join(c)
                val handler = AudioSwitchHandler(applicationContext)
                audio = handler
                val r = LiveKit.create(
                    appContext = applicationContext,
                    options = RoomOptions(adaptiveStream = true, dynacast = true),
                    overrides = LiveKitOverrides(audioOptions = AudioOptions(audioHandler = handler)),
                )
                room = r
                r.initVideoRenderer(remoteView)
                r.initVideoRenderer(localView)
                localView.setMirror(true)
                launch { r.events.collect { onRoomEvent(it) } }
                r.connect(join.url, join.token)
                r.localParticipant.setMicrophoneEnabled(true)
                if (c.video) {
                    r.localParticipant.setCameraEnabled(true)
                    (r.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack)?.let {
                        it.addRenderer(localView)
                        localView.visibility = View.VISIBLE
                    }
                }
                applySpeaker()
                if (r.remoteParticipants.isEmpty()) {
                    if (c.outgoing) startRingback() else setStatus(R.string.callConnecting)
                } else onConnected()
            } catch (e: Exception) {
                setStatus(R.string.callFailed)
                ui.postDelayed({ end(local = true, reason = "failed") }, 1500)
            }
        }
    }

    private fun onRoomEvent(event: RoomEvent) {
        when (event) {
            is RoomEvent.ParticipantConnected -> onConnected()
            is RoomEvent.TrackSubscribed -> {
                onConnected()
                (event.track as? VideoTrack)?.let { track ->
                    track.addRenderer(remoteView)
                    remoteView.visibility = View.VISIBLE
                    avatar.visibility = View.GONE
                }
            }
            is RoomEvent.TrackUnsubscribed -> if (event.track is VideoTrack) {
                remoteView.visibility = View.GONE
                avatar.visibility = View.VISIBLE
            }
            is RoomEvent.ParticipantDisconnected -> end(local = false)
            is RoomEvent.Reconnecting -> setStatus(R.string.callReconnecting)
            is RoomEvent.Reconnected -> if (connectedAt > 0) ui.post(ticker)
            is RoomEvent.Disconnected -> end(local = false)
            else -> Unit
        }
    }

    private fun onConnected() {
        if (connectedAt != 0L || ended) return
        stopRingback()
        connectedAt = SystemClock.elapsedRealtime()
        call?.let { CallTelecom.active(it.callId) }
        ui.post(ticker)
        updateProximity()
    }

    // The tone the caller hears while the other phone rings, at a phone's level.
    private fun startRingback() {
        setStatus(R.string.callRinging)
        runCatching {
            ringback = ToneGenerator(AudioManager.STREAM_VOICE_CALL, 80).also { it.startTone(ToneGenerator.TONE_SUP_RINGTONE) }
        }
    }

    private fun stopRingback() { runCatching { ringback?.stopTone(); ringback?.release() }; ringback = null }

    // ---------- controls ----------

    private fun toggleMic() {
        micOn = !micOn
        micBtn.alpha = if (micOn) 1f else 0.45f
        scope.launch { runCatching { room?.localParticipant?.setMicrophoneEnabled(micOn) } }
    }

    private fun toggleSpeaker() {
        speakerOn = !speakerOn
        applySpeaker()
    }

    private fun applySpeaker() {
        val handler = audio ?: return
        val devices = handler.availableAudioDevices
        val target = if (speakerOn) devices.firstOrNull { it is AudioDevice.Speakerphone }
        else devices.firstOrNull { it is AudioDevice.BluetoothHeadset }
            ?: devices.firstOrNull { it is AudioDevice.WiredHeadset }
            ?: devices.firstOrNull { it is AudioDevice.Earpiece }
        handler.selectDevice(target)
        speakerBtn.text = if (speakerOn) "🔊" else "🔈"
        speakerBtn.alpha = if (speakerOn) 1f else 0.7f
        updateProximity()
    }

    private fun toggleCamera() {
        camOn = !camOn
        camBtn.alpha = if (camOn) 1f else 0.45f
        localView.visibility = if (camOn) View.VISIBLE else View.GONE
        scope.launch { runCatching { room?.localParticipant?.setCameraEnabled(camOn) } }
    }

    private fun switchCamera() {
        (room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack)?.switchCamera()
    }

    // At the ear, the screen goes dark so a cheek does not press buttons (voice calls on the earpiece).
    @Suppress("DEPRECATION")
    private fun updateProximity() {
        val wantOn = call?.video == false && !speakerOn && !ended
        if (wantOn && proximity == null) {
            val power = getSystemService(PowerManager::class.java)
            if (power.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
                proximity = power.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "aykdmh:call").also { it.acquire(4 * 60 * 60 * 1000L) }
            }
        } else if (!wantOn) {
            proximity?.let { if (it.isHeld) it.release() }
            proximity = null
        }
    }

    // ---------- the end ----------

    private fun end(local: Boolean, reason: String? = null) {
        if (ended) return
        ended = true
        ui.removeCallbacks(ticker)
        stopRingback()
        val c = call
        if (c != null) {
            CallTelecom.ended(c.callId, remote = !local)
            if (local) CoroutineScope(Dispatchers.IO).launch { CallApi.hangUp(c, reason) }
        }
        room?.disconnect()
        room?.release()
        room = null
        proximity?.let { if (it.isHeld) it.release() }
        proximity = null
        CallOngoingService.stop(this)
        status.text = getString(R.string.callEnded)
        ui.postDelayed({ finish() }, 900)
    }

    override fun onBackPressed() { moveTaskToBack(true) } // the call keeps going; the notification brings it back

    override fun onDestroy() {
        if (!ended) end(local = true)
        if (current === this) current = null
        scope.cancel()
        super.onDestroy()
    }
}
