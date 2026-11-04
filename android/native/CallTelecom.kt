package sa.aykdmh.app

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.Connection
import android.telecom.CallAudioState
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import kotlinx.coroutines.delay
import java.util.concurrent.ConcurrentHashMap

enum class CallAudioRoute { EARPIECE, SPEAKER, WIRED, BLUETOOTH }

data class CallRoutePreference(val speaker: Boolean, val preferHeadset: Boolean = false)

/**
 * The phone's own call system (AYK-145): our calls are reported to Android as real calls
 * (a self-managed ConnectionService), so the system gives them a call's priority, pauses music,
 * routes the sound like a phone call and lets a Bluetooth headset or car answer and hang up.
 * Everything still works without it: on a phone that refuses, the call simply runs on its own.
 */
object CallTelecom {
    private const val ACCOUNT_ID = "aykdmh_calls"
    const val EXTRA_CALL_ID = "aykdmh_call_id"
    private val connections = ConcurrentHashMap<Long, CallConnection>()
    private val pending = ConcurrentHashMap.newKeySet<Long>()
    private val activeCalls = ConcurrentHashMap.newKeySet<Long>()
    private val sdkOwned = ConcurrentHashMap.newKeySet<Long>()
    private val closed = linkedSetOf<Long>()
    private val preferences = ConcurrentHashMap<Long, CallRoutePreference>()
    var onAnswer: ((Long) -> Unit)? = null
    var onReject: ((Long) -> Unit)? = null
    var onHangUp: ((Long) -> Unit)? = null
    @Volatile var onAudioRouteChanged: ((Long, CallAudioRoute?) -> Unit)? = null

    @Synchronized private fun prepare(callId: Long): Boolean {
        if (sdkOwned.contains(callId) || pending.contains(callId) || connections.containsKey(callId)) return false
        closed.remove(callId)
        sdkOwned.remove(callId)
        pending.add(callId)
        return true
    }

    private fun handle(context: Context) =
        PhoneAccountHandle(ComponentName(context, CallConnectionService::class.java), ACCOUNT_ID)

    private fun register(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return runCatching {
            val telecom = context.getSystemService(TelecomManager::class.java)
            val account = PhoneAccount.builder(handle(context), context.getString(R.string.callTitle))
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .build()
            telecom.registerPhoneAccount(account)
            true
        }.getOrDefault(false)
    }

    /** A call is ringing here: Android shows it through our own ringing screen. */
    fun reportIncoming(context: Context, callId: Long, name: String): Boolean {
        if (!register(context)) return false
        if (!prepare(callId)) return false
        return runCatching {
            val extras = Bundle().apply {
                putLong(EXTRA_CALL_ID, callId)
                putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, Uri.fromParts("aykdmh", name, null))
            }
            context.getSystemService(TelecomManager::class.java).addNewIncomingCall(handle(context), extras)
            true
        }.onFailure { pending.remove(callId) }.getOrDefault(false)
    }

    /** We start a call: Android knows a call is in progress. */
    fun reportOutgoing(context: Context, callId: Long, name: String): Boolean {
        if (!register(context)) return false
        if (!prepare(callId)) return false
        return runCatching {
            val extras = Bundle().apply {
                putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle(context))
                putBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS, Bundle().apply { putLong(EXTRA_CALL_ID, callId) })
            }
            context.getSystemService(TelecomManager::class.java)
                .placeCall(Uri.fromParts("aykdmh", name, null), extras)
            true
        }.onFailure { pending.remove(callId) }.getOrDefault(false)
    }

    @Synchronized internal fun created(callId: Long, connection: CallConnection) {
        pending.remove(callId)
        // A late callback must not create a second audio owner or revive an ended call.
        if (closed.contains(callId) || sdkOwned.contains(callId)) {
            connection.setDisconnected(DisconnectCause(DisconnectCause.CANCELED))
            connection.destroy()
            return
        }
        connections[callId] = connection
        if (activeCalls.contains(callId)) connection.setActive()
        preferences[callId]?.let { connection.requestRoute(it) }
        onAudioRouteChanged?.invoke(callId, connection.confirmedRoute)
    }

    @Synchronized fun active(callId: Long) {
        if (closed.contains(callId) || sdkOwned.contains(callId)) return
        activeCalls.add(callId)
        connections[callId]?.setActive()
    }

    fun hasConnection(callId: Long) = connections.containsKey(callId)
    fun route(callId: Long) = connections[callId]?.confirmedRoute

    fun defaultRoute(callId: Long, video: Boolean) {
        val preference = CallRoutePreference(true, preferHeadset = true)
        preferences[callId] = preference
        connections[callId]?.requestRoute(preference)
    }

    fun requestSpeaker(callId: Long, speaker: Boolean): Boolean {
        val connection = connections[callId] ?: return false
        connection.requestRoute(CallRoutePreference(speaker))
        return true
    }

    internal fun audioStateChanged(callId: Long, source: CallConnection) {
        if (connections[callId] === source) onAudioRouteChanged?.invoke(callId, source.confirmedRoute)
    }

    internal fun failed(callId: Long) { pending.remove(callId) }

    // Decide the audio owner before starting LiveKit. A handset that rejects or
    // times out Telecom uses AudioSwitch; its late Telecom connection is discarded.
    suspend fun awaitConnection(callId: Long): Boolean {
        repeat(40) {
            if (hasConnection(callId)) return true
            if (!pending.contains(callId)) return chooseSdk(callId)
            delay(50)
        }
        return chooseSdk(callId)
    }

    @Synchronized private fun chooseSdk(callId: Long): Boolean {
        if (hasConnection(callId)) return true
        if (closed.contains(callId)) return false
        pending.remove(callId)
        sdkOwned.add(callId)
        return false
    }

    @Synchronized fun ended(callId: Long, remote: Boolean = false) {
        closed.add(callId)
        while (closed.size > 32) closed.remove(closed.first())
        pending.remove(callId)
        sdkOwned.remove(callId)
        activeCalls.remove(callId)
        preferences.remove(callId)
        connections.remove(callId)?.apply {
            setDisconnected(DisconnectCause(if (remote) DisconnectCause.REMOTE else DisconnectCause.LOCAL))
            destroy()
        }
        onAudioRouteChanged?.invoke(callId, null)
    }
}

class CallConnection(private val callId: Long) : Connection() {
    private var audioState: CallAudioState? = null
    private var requested: CallRoutePreference? = null
    private var dispatched = false
    val confirmedRoute: CallAudioRoute?
        get() = when (audioState?.route) {
            CallAudioState.ROUTE_SPEAKER -> CallAudioRoute.SPEAKER
            CallAudioState.ROUTE_EARPIECE -> CallAudioRoute.EARPIECE
            CallAudioState.ROUTE_WIRED_HEADSET -> CallAudioRoute.WIRED
            CallAudioState.ROUTE_BLUETOOTH -> CallAudioRoute.BLUETOOTH
            else -> null
        }

    internal fun requestRoute(preference: CallRoutePreference) {
        requested = preference
        dispatched = false
        dispatchRoute()
    }

    @Suppress("DEPRECATION")
    private fun dispatchRoute() {
        val preference = requested ?: return
        val state = audioState ?: return // Android will report the supported routes asynchronously.
        if (dispatched) return
        val privateRoutes = listOf(CallAudioState.ROUTE_BLUETOOTH, CallAudioState.ROUTE_WIRED_HEADSET,
            CallAudioState.ROUTE_EARPIECE, CallAudioState.ROUTE_SPEAKER)
        val order = when {
            preference.preferHeadset && preference.speaker -> listOf(CallAudioState.ROUTE_BLUETOOTH,
                CallAudioState.ROUTE_WIRED_HEADSET, CallAudioState.ROUTE_SPEAKER, CallAudioState.ROUTE_EARPIECE)
            preference.speaker -> listOf(CallAudioState.ROUTE_SPEAKER)
            else -> privateRoutes
        }
        val target = order.firstOrNull { state.supportedRouteMask and it != 0 } ?: return
        dispatched = true
        if (target != state.route) runCatching { setAudioRoute(target) }
            .onFailure { Log.w("AykCallAudio", "System audio route request failed") }
    }

    @Suppress("DEPRECATION")
    override fun onCallAudioStateChanged(state: CallAudioState) {
        super.onCallAudioStateChanged(state)
        audioState = state
        dispatchRoute()
        CallTelecom.audioStateChanged(callId, this)
    }
    init {
        connectionProperties = PROPERTY_SELF_MANAGED
        audioModeIsVoip = true
        connectionCapabilities = CAPABILITY_MUTE or CAPABILITY_SUPPORT_HOLD
    }

    override fun onShowIncomingCallUi() { /* our ringing screen is already shown by CallAlert */ }
    override fun onAnswer() { CallTelecom.onAnswer?.invoke(callId) }
    override fun onAnswer(videoState: Int) { onAnswer() }
    override fun onReject() { CallTelecom.onReject?.invoke(callId) }
    override fun onDisconnect() { CallTelecom.onHangUp?.invoke(callId); CallTelecom.ended(callId) }
    override fun onAbort() { CallTelecom.ended(callId) }
}

class CallConnectionService : ConnectionService() {
    private fun callIdOf(request: ConnectionRequest?): Long {
        val extras = request?.extras ?: return -1
        return extras.getLong(CallTelecom.EXTRA_CALL_ID, -1).takeIf { it > 0 }
            ?: extras.getBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS)?.getLong(CallTelecom.EXTRA_CALL_ID, -1) ?: -1
    }

    override fun onCreateIncomingConnection(account: PhoneAccountHandle?, request: ConnectionRequest?): Connection {
        val callId = callIdOf(request)
        return CallConnection(callId).apply {
            setAddress(request?.address, TelecomManager.PRESENTATION_ALLOWED)
            setRinging()
            CallTelecom.created(callId, this)
        }
    }

    override fun onCreateOutgoingConnection(account: PhoneAccountHandle?, request: ConnectionRequest?): Connection {
        val callId = callIdOf(request)
        return CallConnection(callId).apply {
            setAddress(request?.address, TelecomManager.PRESENTATION_ALLOWED)
            setDialing()
            CallTelecom.created(callId, this)
        }
    }

    override fun onCreateIncomingConnectionFailed(account: PhoneAccountHandle?, request: ConnectionRequest?) {
        CallTelecom.failed(callIdOf(request))
    }

    override fun onCreateOutgoingConnectionFailed(account: PhoneAccountHandle?, request: ConnectionRequest?) {
        CallTelecom.failed(callIdOf(request))
    }
}
