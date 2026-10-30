package sa.aykdmh.app;

import android.app.Notification;

/**
 * Receives the site's notifications from Chrome (Trusted Web Activity delegation).
 * An incoming-call notification (tag "call-…" with the Answer / Decline actions) is turned
 * into a real call alert: the phone's ringtone, repeating, and a full screen over other apps
 * and the lock screen (AYK-068). Everything else is shown as a normal notification.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId,
                                                   Notification notification, String channelName) {
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
        // Declined, answered elsewhere, or the caller hung up: stop the ring and close the screen.
        if (CallAlert.isCallTag(platformTag)) CallAlert.stop(this, platformTag);
        super.onCancelNotification(platformTag, platformId);
    }
}
