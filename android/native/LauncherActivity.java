package sa.aykdmh.app;

import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Bubblewrap's launcher, plus (AYK-094): the app's Firebase token is added to the address it
 * opens (?fcm=), so the site links this device to whoever signs in and calls ring the app itself.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below (https://github.com/GoogleChromeLabs/bubblewrap/issues/496).
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
        // Android 13+: the app needs its own permission to ring for calls.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {"android.permission.POST_NOTIFICATIONS"}, 7);
        }
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> FcmService.saveToken(this, token));
        } catch (RuntimeException ignored) { /* Firebase unavailable: calls still ring through Chrome */ }
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();
        String token = FcmService.token(this);
        if (uri == null || token == null || uri.getQueryParameter("fcm") != null) return uri;
        return uri.buildUpon().appendQueryParameter("fcm", token).build();
    }
}
