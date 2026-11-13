package sa.aykdmh.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps a call alive while the person is in another app or the screen is off (AYK-145): a
 * foreground service of the "phone call" type, with the microphone (and the camera for video).
 * Its notification ("Call in progress") brings the call screen back.
 */
class CallOngoingService : Service() {
    companion object {
        private const val CHANNEL = "ongoing_call"
        private const val ID = 0x5C000001
        const val EXTRA_VIDEO = "video"
        const val EXTRA_TITLE = "title"

        fun start(context: Context, title: String, video: Boolean) {
            val intent = Intent(context, CallOngoingService::class.java)
                .putExtra(EXTRA_TITLE, title).putExtra(EXTRA_VIDEO, video)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
        }

        fun stop(context: Context) { context.stopService(Intent(context, CallOngoingService::class.java)) }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: getString(R.string.callOngoing)
        val video = intent?.getBooleanExtra(EXTRA_VIDEO, false) ?: false
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.callOngoing), NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(this, 0,
            Intent(this, CallScreenActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
        val notification = builder.setSmallIcon(R.drawable.ic_notification_icon)
            .setContentTitle(title)
            .setContentText(getString(R.string.callOngoing))
            .setCategory(Notification.CATEGORY_CALL)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (video) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            runCatching { startForeground(ID, notification, type) }
                .onFailure { runCatching { startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) } }
        } else {
            startForeground(ID, notification)
        }
        return START_NOT_STICKY
    }
}
