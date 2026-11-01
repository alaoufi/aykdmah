package sa.aykdmh.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * The call endpoints for the phone's own call engine (AYK-145). It has no site session: each call
 * carries a key for this call and this person (from the ring notification or from the site).
 */
data class NativeCall(
    val callId: Long,
    val userId: Long,
    val key: String,
    val video: Boolean,
    val peerName: String,
    val peerCode: String,
    val outgoing: Boolean,
)

data class JoinInfo(val url: String, val token: String)

object CallApi {
    private const val BASE = "https://aykdmh.com/api/calls"

    private suspend fun post(call: NativeCall, action: String, extra: Map<String, String> = emptyMap()): JSONObject =
        withContext(Dispatchers.IO) {
            val conn = (URL("$BASE/${call.callId}/native/$action").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 15_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept-Language", if (java.util.Locale.getDefault().language == "ar") "ar" else "en")
            }
            val body = JSONObject().put("user_id", call.userId).put("key", call.key)
            extra.forEach { (k, v) -> body.put(k, v) }
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}"
            conn.disconnect()
            val json = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (code !in 200..299) throw CallApiException(json.optString("message", "http_$code"))
            json
        }

    suspend fun accept(call: NativeCall) { post(call, "accept") }

    suspend fun hangUp(call: NativeCall, reason: String? = null) {
        runCatching { post(call, "decline", if (reason != null) mapOf("reason" to reason) else emptyMap()) }
    }

    suspend fun join(call: NativeCall): JoinInfo {
        val data = post(call, "token").getJSONObject("data")
        return JoinInfo(data.getString("url"), data.getString("token"))
    }
}

class CallApiException(message: String) : Exception(message)
