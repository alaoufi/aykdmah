package sa.aykdmh.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Full-screen incoming call (AYK-068): shown over other apps and on the lock screen while the
 * call notification rings. Answer / Decline send the site's own notification actions, so the
 * site opens the conversation and answers, or declines, exactly as from the notification.
 */
public class CallActivity extends Activity {
    static final String EXTRA_TAG = "tag";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_ANSWER = "answer";
    static final String EXTRA_DECLINE = "decline";

    private String tag;
    private final BroadcastReceiver stopReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String stopped = intent.getStringExtra(EXTRA_TAG);
            if (stopped == null || stopped.equals(tag)) finish();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager keyguard = getSystemService(KeyguardManager.class);
            if (keyguard != null) keyguard.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Intent intent = getIntent();
        tag = intent.getStringExtra(EXTRA_TAG);
        CharSequence title = intent.getCharSequenceExtra(EXTRA_TITLE);
        CharSequence text = intent.getCharSequenceExtra(EXTRA_TEXT);
        final PendingIntent answer = intent.getParcelableExtra(EXTRA_ANSWER);
        final PendingIntent decline = intent.getParcelableExtra(EXTRA_DECLINE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#0B2D56"));
        root.setPadding(48, 96, 48, 96);

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(26);
        titleView.setGravity(Gravity.CENTER);
        root.addView(titleView);

        TextView textView = new TextView(this);
        textView.setText(text);
        textView.setTextColor(Color.parseColor("#D6E2F0"));
        textView.setTextSize(18);
        textView.setGravity(Gravity.CENTER);
        textView.setPadding(0, 24, 0, 160);
        root.addView(textView);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        buttons.addView(roundButton(getString(R.string.callDecline), "#DC2626", v -> act(decline)));
        View gap = new View(this);
        buttons.addView(gap, new LinearLayout.LayoutParams(160, 1));
        buttons.addView(roundButton(getString(R.string.callAnswer), "#059669", v -> act(answer)));
        root.addView(buttons);

        setContentView(root);
        IntentFilter filter = new IntentFilter(CallAlert.ACTION_STOP);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(stopReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(stopReceiver, filter);
    }

    private Button roundButton(String label, String color, View.OnClickListener onClick) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(18);
        GradientDrawable shape = new GradientDrawable();
        shape.setShape(GradientDrawable.OVAL);
        shape.setColor(Color.parseColor(color));
        button.setBackground(shape);
        button.setOnClickListener(onClick);
        button.setLayoutParams(new LinearLayout.LayoutParams(260, 260));
        return button;
    }

    private void act(PendingIntent action) {
        try { if (action != null) action.send(); } catch (PendingIntent.CanceledException ignored) { }
        if (tag != null) CallAlert.stop(this, tag);
        finish();
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(stopReceiver); } catch (IllegalArgumentException ignored) { }
        super.onDestroy();
    }
}
