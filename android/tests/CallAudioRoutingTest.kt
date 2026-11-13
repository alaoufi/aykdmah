package sa.aykdmh.app

import android.media.AudioManager
import android.os.Looper
import android.telecom.CallAudioState
import android.telecom.Connection
import android.widget.TextView
import com.twilio.audioswitch.AudioDevice
import com.twilio.audioswitch.AudioDeviceChangeListener
import io.livekit.android.audio.AudioSwitchHandler
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import kotlinx.coroutines.runBlocking

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28, 34], manifest = Config.NONE, shadows = [RouteRequestShadow::class])
class CallAudioRoutingTest {
    companion object { private var nextCallId = 167L }
    private val callId = nextCallId++
    private val ear = mock(AudioDevice.Earpiece::class.java)
    private val speaker = mock(AudioDevice.Speakerphone::class.java)

    private fun set(activity: CallScreenActivity, name: String, value: Any?) {
        activity.javaClass.getDeclaredField(name).apply { isAccessible = true }.set(activity, value)
    }
    private fun invoke(activity: CallScreenActivity, name: String) {
        activity.javaClass.getDeclaredMethod(name).apply { isAccessible = true }.invoke(activity)
        shadowOf(Looper.getMainLooper()).idle()
    }
    private fun fixture(): Triple<CallScreenActivity, AudioSwitchHandler, TextView> {
        val activity = Robolectric.buildActivity(CallScreenActivity::class.java).get()
        val output = TextView(activity).apply { text = "🔈" }
        val handler = mock(AudioSwitchHandler::class.java)
        `when`(handler.availableAudioDevices).thenReturn(listOf(ear, speaker))
        `when`(handler.selectedAudioDevice).thenReturn(ear)
        set(activity, "speakerBtn", output)
        set(activity, "audio", handler)
        // Before the fix there is no binding method: the assertions below must
        // still test the old real toggle, rather than fail to load the test.
        activity.javaClass.declaredMethods.firstOrNull { it.name == "bindAudioRouting" }?.apply {
            isAccessible = true
            invoke(activity, handler)
        }
        shadowOf(Looper.getMainLooper()).idle()
        return Triple(activity, handler, output)
    }

    @After fun cleanup() {
        CallTelecom.ended(callId)
        RouteRequestShadow.requests.clear()
    }

    @Test fun activationBeforeAsyncConnectionCreationIsNotLost() {
        CallTelecom.active(callId)
        val connection = CallConnection(callId)
        CallTelecom.created(callId, connection)
        assertEquals(Connection.STATE_ACTIVE, connection.state)
    }

    @Test fun voiceStartsOnSpeakerUnlessAnExternalHeadsetIsAvailable() {
        val connection = CallConnection(callId)
        CallTelecom.created(callId, connection)
        CallTelecom.defaultRoute(callId, false)
        connection.onCallAudioStateChanged(CallAudioState(false, CallAudioState.ROUTE_EARPIECE,
            CallAudioState.ROUTE_EARPIECE or CallAudioState.ROUTE_SPEAKER))
        assertEquals(listOf(CallAudioState.ROUTE_SPEAKER), RouteRequestShadow.requests)
    }

    @Test fun videoKeepsBluetoothAndDoesNotReapplyDefaultOverUserChoice() {
        val connection = CallConnection(callId)
        CallTelecom.created(callId, connection)
        CallTelecom.defaultRoute(callId, true)
        val routes = CallAudioState.ROUTE_BLUETOOTH or CallAudioState.ROUTE_SPEAKER or CallAudioState.ROUTE_EARPIECE
        connection.onCallAudioStateChanged(CallAudioState(false, CallAudioState.ROUTE_BLUETOOTH, routes))
        assertTrue(RouteRequestShadow.requests.isEmpty())
        CallTelecom.requestSpeaker(callId, true)
        connection.onCallAudioStateChanged(CallAudioState(false, CallAudioState.ROUTE_SPEAKER, routes))
        assertEquals(listOf(CallAudioState.ROUTE_SPEAKER), RouteRequestShadow.requests)
    }

    @Test fun cameraStartsOffBeforePermissionsOrMediaConnection() {
        val activity = Robolectric.buildActivity(CallScreenActivity::class.java).get()
        val field = activity.javaClass.getDeclaredField("camOn").apply { isAccessible = true }
        assertEquals(false, field.get(activity))
    }

    @Test fun lateConnectionCannotTakeAudioAfterCallHasEnded() {
        CallTelecom.ended(callId)
        val connection = CallConnection(callId)
        CallTelecom.created(callId, connection)
        assertEquals(Connection.STATE_DISCONNECTED, connection.state)
    }

    @Test fun sdkFallbackRejectsALateSecondAudioOwner(): Unit = runBlocking {
        assertFalse(CallTelecom.awaitConnection(callId))
        val late = CallConnection(callId)
        CallTelecom.created(callId, late)
        assertEquals(Connection.STATE_DISCONNECTED, late.state)
    }

    @Test fun readySystemConnectionOwnsAudioBeforeMediaStarts(): Unit = runBlocking {
        CallTelecom.created(callId, CallConnection(callId))
        assertTrue(CallTelecom.awaitConnection(callId))
    }

    @Test @Config(sdk = [24]) fun android7FallbackStillUsesConfirmedDeviceChanges() {
        confirmedSdkRouteAndHeadsetChangeUpdateTheVisibleButton()
    }

    @Test fun speakerIconDoesNotClaimSuccessBeforeDeviceConfirmation() {
        val (activity, _, output) = fixture()
        invoke(activity, "toggleSpeaker")
        assertEquals("A request is not proof that the speaker switched", "🔈", output.text.toString())
    }

    @Test fun selfManagedCallRequestsSystemSpeakerRouteInsteadOfCompetingSdkRoute() {
        val (activity, handler, _) = fixture()
        set(activity, "call", NativeCall(callId, 1, "synthetic-test-key", false, "", "", true))
        val connection = CallConnection(callId)
        CallTelecom.created(callId, connection)
        connection.onCallAudioStateChanged(CallAudioState(false, CallAudioState.ROUTE_EARPIECE,
            CallAudioState.ROUTE_EARPIECE or CallAudioState.ROUTE_SPEAKER))
        shadowOf(Looper.getMainLooper()).idle()
        invoke(activity, "toggleSpeaker")
        assertEquals(listOf(CallAudioState.ROUTE_SPEAKER), RouteRequestShadow.requests)
        verify(handler, never()).selectDevice(any())
    }

    @Test fun confirmedSdkRouteAndHeadsetChangeUpdateTheVisibleButton() {
        val (_, handler, output) = fixture()
        val registration = mockingDetails(handler).invocations.firstOrNull { it.method.name == "registerAudioDeviceChangeListener" }
        assertNotNull("The activity must observe confirmed route changes", registration)
        val listener = registration!!.arguments[0] as AudioDeviceChangeListener
        listener.invoke(listOf(ear, speaker), speaker)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals("🔊", output.text.toString())
        val wired = mock(AudioDevice.WiredHeadset::class.java)
        listener.invoke(listOf(wired, speaker), wired)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals("🔈", output.text.toString())
    }

    @Test fun unavailableSpeakerDoesNotClearSelectionOrPretendToSwitch() {
        val (activity, handler, output) = fixture()
        `when`(handler.availableAudioDevices).thenReturn(listOf(ear))
        invoke(activity, "toggleSpeaker")
        assertEquals("🔈", output.text.toString())
        verify(handler, never()).selectDevice(null)
    }
}

@Implements(Connection::class)
class RouteRequestShadow {
    companion object { val requests = mutableListOf<Int>() }
    @Implementation fun setAudioRoute(route: Int) { requests += route }
}
