package sa.aykdmh.app;

import android.content.Context;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Firebase Cloud Messaging (AYK-094): reaches the app even when it is closed. An incoming call
 * rings like a phone call (continuous ringtone, full screen over other apps and the lock screen);
 * "call_end" or "missed_call" stops it. A new message is shown as a notification (AYK-122). The token is kept here and passed to the site at launch.
 */
public class FcmService extends FirebaseMessagingService {
    static final String PREFS = "aykdmh_push";
    static final String KEY_TOKEN = "fcm_token";

    static void saveToken(Context context, String token) {
        if (token == null || token.isEmpty()) return;
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_TOKEN, token).apply();
    }

    static String token(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TOKEN, null);
    }

    @Override
    public void onNewToken(String token) {
        saveToken(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        if ("message".equals(data.get("kind"))) {
            MessageAlert.show(this, data.get("tag"), data.get("title"), data.get("body"), data.get("url"));
            return;
        }
        String callId = data.get("call_id");
        if (callId == null || !callId.matches("\\d+")) return;
        if ("call".equals(data.get("kind"))) {
            CallAlert.ringPush(this, callId, data.get("conversation_id"), data.get("title"), data.get("body"));
        } else {
            CallAlert.stop(this, "call-" + callId);
        }
    }
}
