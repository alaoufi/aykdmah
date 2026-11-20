package sa.aykdmh.app;

import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Bubblewrap's launcher, plus (AYK-094): the app's Firebase token is added to the address it
 * opens (?fcm=), so the site links this device to whoever signs in and calls ring the app itself.
 * Without a token yet (first launch), the site waits up to 3 s for Firebase (AYK-095).
 * The installed version (?app=) is added on every launch, from the app itself, so the site
 * always knows which version this phone runs, also when opened from a notification (AYK-123).
 * Required updates (AYK-148): installed from Google Play, a newer version on Play must be installed
 * before the app opens (Play's own full-screen update; cancelling it closes the app). The site
 * is told where the app came from (?src=play or apk): an app from aykdmh.com/dl is stopped by the
 * site itself until the newer download is installed.
 * AYK-338 (the owner: «أول فتح يأخذ وقت طويل» in the app): an app from Google Play asked Play
 * about an update on EVERY launch and showed an empty screen until Play answered, up to 2 s,
 * before the site was even asked for. Now the site opens at once and Play is asked meanwhile; only
 * when Play said last time that a newer version is there does the launch wait for Play's update.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    // AYK-283: the owner's Huawei waited the full 3 s for a Firebase token on every launch (it has
    // no Google services, so none ever comes), showing nothing: the app seemed to vanish, then open.
    // Now a phone without Google services, or where Firebase failed before, does not wait at all,
    // and the waits elsewhere are shorter.
    private static final long TOKEN_WAIT_MS = 1500;
    private static final long UPDATE_WAIT_MS = 2000;
    private static final String NO_FCM = "fcm_unavailable";
    private static final String UPDATE_PENDING = "play_update_pending";
    private static final int UPDATE_REQUEST = 41;
    private static final String PLAY_STORE = "com.android.vending";
    private boolean launched;
    private boolean tokenReady;
    private boolean updateChecked;
    private boolean updating;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AppTexts.refresh(this); // the app's texts follow the site (AYK-310)
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
        boolean waiting = FcmService.token(this) == null && fcmExpected();
        tokenReady = !waiting;
        boolean fromPlay = fromPlay();
        // Wait for Play only when it said last time that a newer version is there (AYK-338).
        updateChecked = !(fromPlay && updatePending());
        Handler handler = new Handler(Looper.getMainLooper());
        try {
            FirebaseMessaging.getInstance().getToken()
                    .addOnSuccessListener(token -> { FcmService.saveToken(this, token); rememberFcm(true); if (waiting) tokenArrived(); })
                    .addOnFailureListener(error -> { rememberFcm(false); if (waiting) tokenArrived(); });
        } catch (RuntimeException ignored) { /* Firebase unavailable: calls still ring through Chrome */ }
        if (waiting) handler.postDelayed(() -> { if (FcmService.token(this) == null) rememberFcm(false); tokenArrived(); }, TOKEN_WAIT_MS);
        if (!updateChecked) {
            checkPlayUpdate();
            handler.postDelayed(() -> { if (!updating) updateDone(); }, UPDATE_WAIT_MS);
        } else if (fromPlay) {
            askPlayQuietly();
        }
    }

    private boolean updatePending() {
        return getSharedPreferences(FcmService.PREFS, MODE_PRIVATE).getBoolean(UPDATE_PENDING, false);
    }

    private static void rememberUpdate(android.content.Context context, boolean pending) {
        context.getSharedPreferences(FcmService.PREFS, MODE_PRIVATE).edit().putBoolean(UPDATE_PENDING, pending).apply();
    }

    /** Asks Play while the site opens; the answer only decides whether the NEXT launch waits. */
    private void askPlayQuietly() {
        final android.content.Context app = getApplicationContext();
        try {
            AppUpdateManagerFactory.create(app).getAppUpdateInfo()
                    .addOnSuccessListener(info -> rememberUpdate(app,
                            (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                                    && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE))
                            || info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS));
        } catch (RuntimeException ignored) { /* Play unavailable: nothing to remember */ }
    }

    /**
     * Opens the site immediately when the token is known and Play did not report a newer version
     * last time; otherwise once both are settled (the token waits up to 1.5 s, the update up to 2 s).
     */
    @Override
    protected boolean shouldLaunchImmediately() {
        return (FcmService.token(this) != null || !fcmExpected()) && !(fromPlay() && updatePending());
    }

    /** False on a phone without Google services, or where getting a token failed last time. */
    private boolean fcmExpected() {
        if (getSharedPreferences(FcmService.PREFS, MODE_PRIVATE).getBoolean(NO_FCM, false)) return false;
        // Asked by name: it comes with Firebase, and a separate library for it broke the build
        // (its Kotlin version did not match the app's). Missing or failing means "no services".
        try {
            Class<?> api = Class.forName("com.google.android.gms.common.GoogleApiAvailability");
            Object instance = api.getMethod("getInstance").invoke(null);
            Object result = api.getMethod("isGooglePlayServicesAvailable", android.content.Context.class).invoke(instance, this);
            return Integer.valueOf(0).equals(result); // ConnectionResult.SUCCESS
        } catch (Exception | LinkageError e) { return false; }
    }

    private void rememberFcm(boolean works) {
        getSharedPreferences(FcmService.PREFS, MODE_PRIVATE).edit().putBoolean(NO_FCM, !works).apply();
    }

    private void tokenArrived() {
        tokenReady = true;
        launchOnce();
    }

    private void updateDone() {
        updateChecked = true;
        launchOnce();
    }

    private void launchOnce() {
        if (launched || updating || isFinishing() || !tokenReady || !updateChecked) return;
        launched = true;
        launchTwa();
    }

    /** A newer version on Google Play is installed first, with Play's full-screen update. */
    private void checkPlayUpdate() {
        try {
            AppUpdateManager manager = AppUpdateManagerFactory.create(this);
            manager.getAppUpdateInfo()
                    .addOnSuccessListener(info -> {
                        boolean available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                                && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE);
                        boolean resuming = info.updateAvailability()
                                == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;
                        if ((available || resuming) && !launched && !isFinishing()) {
                            try {
                                updating = manager.startUpdateFlowForResult(info, this,
                                        AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(), UPDATE_REQUEST);
                            } catch (IntentSender.SendIntentException | RuntimeException ignored) { updating = false; }
                        }
                        // Nothing newer after all (installed meanwhile): the next launch does not wait.
                        if (!available && !resuming) rememberUpdate(getApplicationContext(), false);
                        if (!updating) updateDone();
                    })
                    .addOnFailureListener(error -> updateDone());
        } catch (RuntimeException error) { updateDone(); }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        // Play restarts the app once the update is installed; without it, the app does not open.
        if (requestCode == UPDATE_REQUEST && resultCode != RESULT_OK) finish();
    }


    private boolean fromPlay() {
        try {
            String installer = Build.VERSION.SDK_INT >= 30
                    ? getPackageManager().getInstallSourceInfo(getPackageName()).getInstallingPackageName()
                    : getPackageManager().getInstallerPackageName(getPackageName());
            return PLAY_STORE.equals(installer);
        } catch (PackageManager.NameNotFoundException | RuntimeException e) { return false; }
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();
        if (uri == null) return null;
        Uri.Builder builder = uri.buildUpon().clearQuery();
        for (String name : uri.getQueryParameterNames()) {
            if (name.equals("app") || name.equals("src")) continue;
            for (String value : uri.getQueryParameters(name)) builder.appendQueryParameter(name, value);
        }
        String version = installedVersion();
        if (version != null) builder.appendQueryParameter("app", version);
        builder.appendQueryParameter("src", fromPlay() ? "play" : "apk");
        String token = FcmService.token(this);
        if (token != null && uri.getQueryParameter("fcm") == null) builder.appendQueryParameter("fcm", token);
        return builder.build();
    }

    private String installedVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (PackageManager.NameNotFoundException e) { return null; }
    }
}
