package sa.aykdmh.app;

import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Bubblewrap's launcher, plus (AYK-094): the app's Firebase token is added to the address it
 * opens (?fcm=), so the site links this device to whoever signs in and calls ring the app itself.
 * Without a token yet (first launch), the site waits up to 3 s for Firebase (AYK-095).
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private static final long TOKEN_WAIT_MS = 3000;
    private boolean launched;

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
        boolean waiting = FcmService.token(this) == null;
        try {
            FirebaseMessaging.getInstance().getToken()
                    .addOnSuccessListener(token -> { FcmService.saveToken(this, token); if (waiting) launchOnce(); })
                    .addOnFailureListener(error -> { if (waiting) launchOnce(); });
        } catch (RuntimeException ignored) { /* Firebase unavailable: calls still ring through Chrome */ }
        if (waiting) new Handler(Looper.getMainLooper()).postDelayed(this::launchOnce, TOKEN_WAIT_MS);
    }

    /** Opens the site immediately when the token is known; otherwise once it arrives (or 3 s pass). */
    @Override
    protected boolean shouldLaunchImmediately() {
        return FcmService.token(this) != null;
    }

    private void launchOnce() {
        if (launched || isFinishing()) return;
        launched = true;
        launchTwa();
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();
        String token = FcmService.token(this);
        if (uri == null || token == null || uri.getQueryParameter("fcm") != null) return uri;
        return uri.buildUpon().appendQueryParameter("fcm", token).build();
    }
}
