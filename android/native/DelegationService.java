package sa.aykdmh.app;

import android.app.Notification;
import android.os.Handler;
import android.os.Looper;

import java.util.HashMap;
import java.util.Map;

/**
 * Receives the site's notifications from Chrome (Trusted Web Activity delegation).
 * An incoming-call notification (tag "call-…" with the Answer / Decline actions) is turned
 * into a real call alert: the phone's ringtone, repeating, and a full screen over other apps
 * and the lock screen (AYK-068). Everything else is shown as a normal notification.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {

    // A call's notification closed: stop ringing shortly after, unless its next round (every 8 s)
    // replaces it at once (AYK-097). Answered, declined or ended calls stop within 1.5 s.
    private static final long STOP_DELAY_MS = 1500;
    private static final Map<String, Runnable> pendingStops = new HashMap<>();
    private final Handler handler = new Handler(Looper.getMainLooper());

    private void cancelPendingStop(String tag) {
        Runnable stop = pendingStops.remove(CallAlert.canonical(tag));
        if (stop != null) handler.removeCallbacks(stop);
    }

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId,
                                                   Notification notification, String channelName) {
        if (CallAlert.isCallTag(platformTag)) cancelPendingStop(platformTag);
        if (CallAlert.isIncomingCall(platformTag, notification)) {
            CallAlert.ring(this, platformTag, notification);
            return true;
        }
        // The same tag now carries "missed call" (or anything else): stop ringing first.
        if (CallAlert.isCallTag(platformTag)) CallAlert.stop(this, platformTag);
        return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
    }

    @Override
    public void onCancelNotification(String platformTag, int platformId) {
        if (CallAlert.isCallTag(platformTag)) {
            String tag = CallAlert.canonical(platformTag);
            cancelPendingStop(tag);
            Runnable stop = () -> { pendingStops.remove(tag); CallAlert.stop(getApplicationContext(), tag); };
            pendingStops.put(tag, stop);
            handler.postDelayed(stop, STOP_DELAY_MS);
        }
        super.onCancelNotification(platformTag, platformId);
    }
}
