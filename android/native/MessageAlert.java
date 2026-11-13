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

import java.util.HashMap;
import java.util.Map;

/**
 * A new message from Firebase (AYK-122): shown by the app itself, even when it is closed and
 * whether or not Chrome was allowed to notify. One notification per conversation; a newer
 * message replaces the older one. When the same message also arrives through Chrome (web
 * push), whichever comes second within two minutes is dropped, so it never shows twice.
 */
final class MessageAlert {
    static final String CHANNEL_ID = "messages";
    private static final long SAME_MESSAGE_MS = 2 * 60 * 1000;
    private static final Map<String, Long> shown = new HashMap<>();

    private MessageAlert() {}

    /** "chat-12" from the site's tag, which Chrome may prefix with its own text. */
    static String chatTag(String tag) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("chat-(\\d+)").matcher(tag == null ? "" : tag);
        return m.find() ? "chat-" + m.group(1) : null;
    }

    /** True when this conversation was just shown by the other route; records it otherwise. */
    static synchronized boolean alreadyShown(String chatTag, String body) {
        String text = body == null ? "" : body.trim();
        String key = chatTag + "|" + (text.length() > 40 ? text.substring(0, 40) : text);
        long now = System.currentTimeMillis();
        shown.entrySet().removeIf(e -> now - e.getValue() > SAME_MESSAGE_MS);
        if (shown.containsKey(key)) return true;
        shown.put(key, now);
        return false;
    }

    static void show(Context context, String tag, String title, String body, String url) {
        String chat = chatTag(tag);
        if (chat == null || alreadyShown(chat, body)) return;
        ensureChannel(context);
        String path = url != null && url.startsWith("/") ? url : "/" + chat.replace('-', '/');
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("https://aykdmh.com" + path))
                .setClass(context, LauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        int id = 0x5B000000 | (chat.hashCode() & 0x00FFFFFF);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID) : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(context, id, open, flags));
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }
        context.getSystemService(NotificationManager.class).notify(chat, id, builder.build());
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                context.getString(R.string.messageChannelName), NotificationManager.IMPORTANCE_HIGH);
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }
}
