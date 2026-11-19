package sa.aykdmh.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.Locale;

/**
 * The app's own texts (call screen, notifications) come from the site (AYK-310, owner's rule: a
 * text change needs a site deploy, never a store release). The server sends them in the user's
 * language with every call, and /api/app-texts serves them at launch. The last ones received are
 * kept; without any, the built-in Arabic and English resources are used.
 */
final class AppTexts {
    private static final String PREFS = "ayk_app_texts";
    private static final String KEY = "texts";

    private AppTexts() {}

    /** The site's text for this key, else the built-in resource. */
    static String get(Context context, String key, int fallbackRes) {
        try {
            String json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (json != null) {
                String value = new JSONObject(json).optString(key, "");
                if (!value.isEmpty()) return value;
            }
        } catch (Exception ignored) { /* a damaged copy falls back to the built-in text */ }
        return context.getString(fallbackRes);
    }

    /** Keeps texts sent by the server (a JSON object of short strings). */
    static void save(Context context, String json) {
        if (json == null || json.isEmpty() || json.length() > 8000) return;
        try {
            JSONObject object = new JSONObject(json);
            JSONObject clean = new JSONObject();
            for (Iterator<String> it = object.keys(); it.hasNext(); ) {
                String name = it.next();
                Object value = object.get(name);
                if (name.matches("[A-Za-z]{1,40}") && value instanceof String && ((String) value).length() <= 200) clean.put(name, value);
            }
            if (clean.length() == 0) return;
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY, clean.toString()).apply();
        } catch (Exception ignored) { /* not texts: keep what we had */ }
    }

    /** At launch: fetches the texts in the phone's language, in the background. */
    static void refresh(Context context) {
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                String lang = Locale.getDefault().getLanguage();
                connection = (HttpURLConnection) new URL("https://aykdmh.com/api/app-texts?lang=" + lang).openConnection();
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                if (connection.getResponseCode() != 200) return;
                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), "UTF-8"))) {
                    String line;
                    while ((line = reader.readLine()) != null && body.length() < 16000) body.append(line);
                }
                JSONObject data = new JSONObject(body.toString()).optJSONObject("data");
                if (data != null) save(app, data.toString());
            } catch (Exception ignored) { /* offline: the kept texts stay */ }
            finally { if (connection != null) connection.disconnect(); }
        }, "ayk-texts").start();
    }
}
