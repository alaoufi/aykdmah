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
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private static final long TOKEN_WAIT_MS = 3000;
    private static final long UPDATE_WAIT_MS = 4000;
    private static final int UPDATE_REQUEST = 41;
    private static final String PLAY_STORE = "com.android.vending";
    private boolean launched;
    private boolean tokenReady;
    private boolean updateChecked;
    private boolean updating;

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
        tokenReady = !waiting;
        updateChecked = !fromPlay();
        Handler handler = new Handler(Looper.getMainLooper());
        try {
            FirebaseMessaging.getInstance().getToken()
                    .addOnSuccessListener(token -> { FcmService.saveToken(this, token); if (waiting) tokenArrived(); })
                    .addOnFailureListener(error -> { if (waiting) tokenArrived(); });
        } catch (RuntimeException ignored) { /* Firebase unavailable: calls still ring through Chrome */ }
        if (waiting) handler.postDelayed(this::tokenArrived, TOKEN_WAIT_MS);
        if (!updateChecked) {
            checkPlayUpdate();
            handler.postDelayed(() -> { if (!updating) updateDone(); }, UPDATE_WAIT_MS);
        }
    }

    /**
     * Opens the site immediately when the token is known and no Play update needs checking;
     * otherwise once both are settled (the token waits up to 3 s, the update check up to 4 s).
     */
    @Override
    protected boolean shouldLaunchImmediately() {
        return FcmService.token(this) != null && !fromPlay();
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
