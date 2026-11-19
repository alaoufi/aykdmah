package sa.aykdmh.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * "Decline" on the ring notification (AYK-145): stops the ringing and tells the server, with no
 * need to open the app. watch() also connects the ringing call to Android's call system, so a
 * Bluetooth headset or a car can answer or decline it.
 */
class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val call = CallScreenActivity.parse(intent) ?: return
        decline(context.applicationContext, call)
    }

    companion object {
        @JvmStatic fun decline(context: Context, call: NativeCall) {
            CallAlert.stop(context, "call-${call.callId}")
            CallTelecom.ended(call.callId)
            CoroutineScope(Dispatchers.IO).launch { CallApi.hangUp(call) }
        }

        @JvmStatic fun watch(context: Context, uri: Uri) {
            val app = context.applicationContext
            val call = CallScreenActivity.parse(Intent(Intent.ACTION_VIEW, uri)) ?: return
            CallTelecom.onAnswer = { id ->
                if (id == call.callId) app.startActivity(Intent(Intent.ACTION_VIEW, uri)
                    .setClass(app, CallScreenActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            CallTelecom.onReject = { id -> if (id == call.callId) decline(app, call) }
            CallTelecom.reportIncoming(app, call.callId, call.peerName.ifEmpty { call.peerCode })
            CoroutineScope(Dispatchers.IO).launch { CallApi.ringing(call) }
        }
    }
}
