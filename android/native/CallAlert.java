package sa.aykdmh.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

/**
 * An incoming call shown like a phone call (AYK-068): a notification on the "Incoming calls"
 * channel with the phone's ringtone repeating (FLAG_INSISTENT) and a full-screen intent that
 * opens {@link CallActivity} over other apps and on the lock screen. Answer / Decline reuse the
 * actions Chrome attached to the site's notification, so the site handles them as before.
 */
final class CallAlert {
    static final String CHANNEL_ID = "incoming_calls";
    static final String ACTION_STOP = "sa.aykdmh.app.CALL_STOP";
    private static final int RING_SECONDS = 50;

    private CallAlert() {}

    static boolean isCallTag(String tag) {
        return tag != null && tag.contains("call-");
    }

    /** The ringing notification carries two actions (Answer, Decline); a missed call has none. */
    static boolean isIncomingCall(String tag, Notification n) {
        return isCallTag(tag) && n != null && n.actions != null && n.actions.length >= 2;
    }

    /** One notification per call (AYK-094): "…call-58-r2" from Chrome and "call-58" from FCM. */
    static String canonical(String tag) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("call-(\\d+)").matcher(tag == null ? "" : tag);
        return m.find() ? "call-" + m.group(1) : tag;
    }

    private static int idFor(String tag) {
        return 0x5A000000 | (canonical(tag).hashCode() & 0x00FFFFFF);
    }

    /** Opens the site in the app at this path (answer / decline / the chat). */
    private static PendingIntent openSite(Context context, String path, int request) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://aykdmh.com" + path))
                .setClass(context, LauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(context, request, intent, flags);
    }

    /** An incoming call from Firebase (AYK-094): the app rings by itself, even when closed. */
    static void ringPush(Context context, String callId, String conversationId, String title, String text) {
        String chat = conversationId != null && conversationId.matches("\\d+") ? "/chat/" + conversationId : "/chat";
        int base = idFor("call-" + callId);
        show(context, "call-" + callId, title, text,
                openSite(context, chat + "?answer=" + callId, base + 1),
                openSite(context, chat + "?decline=" + callId, base + 2));
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                context.getString(R.string.callChannelName), NotificationManager.IMPORTANCE_HIGH);
        Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        channel.setSound(ringtone, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] {0, 800, 400, 800, 400});
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setBypassDnd(true);
        manager.createNotificationChannel(channel);
    }

    static void ring(Context context, String tag, Notification source) {
        Bundle extras = source.extras;
        CharSequence title = extras != null ? extras.getCharSequence(Notification.EXTRA_TITLE) : null;
        CharSequence text = extras != null ? extras.getCharSequence(Notification.EXTRA_TEXT) : null;
        show(context, tag, title, text, source.actions[0].actionIntent, source.actions[1].actionIntent);
    }

    private static void show(Context context, String rawTag, CharSequence title, CharSequence text,
                             PendingIntent answer, PendingIntent decline) {
        ensureChannel(context);
        String tag = canonical(rawTag);

        Intent screen = new Intent(context, CallActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION)
                .putExtra(CallActivity.EXTRA_TAG, tag)
                .putExtra(CallActivity.EXTRA_TITLE, title)
                .putExtra(CallActivity.EXTRA_TEXT, text)
                .putExtra(CallActivity.EXTRA_ANSWER, answer)
                .putExtra(CallActivity.EXTRA_DECLINE, decline);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent fullScreen = PendingIntent.getActivity(context, idFor(tag), screen, flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID) : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(text)
                .setCategory(Notification.CATEGORY_CALL)
                .setPriority(Notification.PRIORITY_MAX)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(fullScreen)
                .setFullScreenIntent(fullScreen, true)
                .addAction(new Notification.Action.Builder(null, context.getString(R.string.callDecline), decline).build())
                .addAction(new Notification.Action.Builder(null, context.getString(R.string.callAnswer), answer).build());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
                    .setVibrate(new long[] {0, 800, 400, 800, 400});
        } else {
            builder.setTimeoutAfter(RING_SECONDS * 1000L);
        }
        Notification call = builder.build();
        call.flags |= Notification.FLAG_INSISTENT; // repeat the ringtone until answered or stopped
        context.getSystemService(NotificationManager.class).notify(tag, idFor(tag), call);
    }

    static void stop(Context context, String rawTag) {
        String tag = canonical(rawTag);
        context.getSystemService(NotificationManager.class).cancel(tag, idFor(tag));
        context.sendBroadcast(new Intent(ACTION_STOP).setPackage(context.getPackageName()).putExtra(CallActivity.EXTRA_TAG, tag));
    }
}
