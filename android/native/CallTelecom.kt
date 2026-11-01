package sa.aykdmh.app

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

/**
 * The phone's own call system (AYK-145): our calls are reported to Android as real calls
 * (a self-managed ConnectionService), so the system gives them a call's priority, pauses music,
 * routes the sound like a phone call and lets a Bluetooth headset or car answer and hang up.
 * Everything still works without it: on a phone that refuses, the call simply runs on its own.
 */
object CallTelecom {
    private const val ACCOUNT_ID = "aykdmh_calls"
    const val EXTRA_CALL_ID = "aykdmh_call_id"
    private val connections = mutableMapOf<Long, CallConnection>()
    var onAnswer: ((Long) -> Unit)? = null
    var onReject: ((Long) -> Unit)? = null
    var onHangUp: ((Long) -> Unit)? = null

    private fun handle(context: Context) =
        PhoneAccountHandle(ComponentName(context, CallConnectionService::class.java), ACCOUNT_ID)

    private fun register(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return runCatching {
            val telecom = context.getSystemService(TelecomManager::class.java)
            val account = PhoneAccount.builder(handle(context), context.getString(R.string.app_name))
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .build()
            telecom.registerPhoneAccount(account)
            true
        }.getOrDefault(false)
    }

    /** A call is ringing here: Android shows it through our own ringing screen. */
    fun reportIncoming(context: Context, callId: Long, name: String): Boolean {
        if (!register(context)) return false
        return runCatching {
            val extras = Bundle().apply {
                putLong(EXTRA_CALL_ID, callId)
                putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, Uri.fromParts("aykdmh", name, null))
            }
            context.getSystemService(TelecomManager::class.java).addNewIncomingCall(handle(context), extras)
            true
        }.getOrDefault(false)
    }

    /** We start a call: Android knows a call is in progress. */
    fun reportOutgoing(context: Context, callId: Long, name: String): Boolean {
        if (!register(context)) return false
        return runCatching {
            val extras = Bundle().apply {
                putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle(context))
                putBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS, Bundle().apply { putLong(EXTRA_CALL_ID, callId) })
            }
            context.getSystemService(TelecomManager::class.java)
                .placeCall(Uri.fromParts("aykdmh", name, null), extras)
            true
        }.getOrDefault(false)
    }

    internal fun created(callId: Long, connection: CallConnection) { connections[callId] = connection }

    fun active(callId: Long) { connections[callId]?.setActive() }

    fun ended(callId: Long, remote: Boolean = false) {
        connections.remove(callId)?.apply {
            setDisconnected(DisconnectCause(if (remote) DisconnectCause.REMOTE else DisconnectCause.LOCAL))
            destroy()
        }
    }
}

class CallConnection(private val callId: Long) : Connection() {
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
}
