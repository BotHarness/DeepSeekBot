package expo.modules.conversationnotifications

import android.content.Context
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.ChannelAwareTrigger
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class ApprovalAlertsTest {
  private lateinit var context: Context
  private lateinit var platform: Platform
  private lateinit var alerts: ApprovalAlerts

  private class Platform(val context: Context) : ApprovalNotificationPlatform {
    override var backgroundRunning = true
    override var foreground = false
    var allowed = true
    val posted = mutableListOf<String>()
    val cancelled = mutableListOf<String>()
    override fun permitted() = allowed
    override suspend fun build(notification: Notification, behavior: NotificationBehaviorRecord?) =
      android.app.Notification.Builder(context, "requests").setContentTitle("Approval").build()
    override fun post(identifier: String, notification: android.app.Notification) { posted.add(identifier) }
    override fun cancel(identifier: String) { cancelled.add(identifier) }
  }

  @Before fun setup() = runBlocking {
    context = RuntimeEnvironment.getApplication()
    context.deleteDatabase("approval-alerts.db")
    context.getSharedPreferences("approval-alert-policy", Context.MODE_PRIVATE).edit().clear().commit()
    platform = Platform(context)
    alerts = ApprovalAlerts(context, platform)
    alerts.hosts(setOf("studio"), true)
  }

  @After fun close() { alerts.close(); ApprovalAlerts.incoming = null }

  private fun request(identifier: String, item: String = "approval-1") = Notification(NotificationRequest(
    identifier,
    NotificationContent.Builder().setTitle("Approval").setText("Needs you").setBody(JSONObject()
      .put("v", 1).put("hostId", "studio").put("itemId", item).put("kind", "tool-approval"))
      .build(),
    ChannelAwareTrigger("requests")
  ))

  @Test fun localBeforeCloudPostsOnceAcrossRestart() = runBlocking {
    alerts.present(request("local"), null, true)
    alerts.close()
    alerts = ApprovalAlerts(context, platform)
    platform.backgroundRunning = false
    alerts.present(request("fcm"), null, false)
    assertEquals(listOf("local"), platform.posted)
  }

  @Test fun cloudArrivingFirstWaitsForTheLocalFeed() = runBlocking {
    val cloud = async { alerts.present(request("fcm"), null, false) }
    delay(50)
    alerts.present(request("local"), null, true)
    cloud.await()
    assertEquals(listOf("local"), platform.posted)
  }

  @Test fun cloudFallsBackAndLateLocalDoesNotRingAgain() = runBlocking {
    alerts.present(request("fcm"), null, false)
    alerts.present(request("late-local"), null, true)
    assertEquals(listOf("fcm"), platform.posted)
  }

  @Test fun resolvedApprovalIsCancelledAndCannotBeReplayed() = runBlocking {
    alerts.reconcile(JSONObject("""{"hostId":"studio","pending":["approval-1"],"alerts":[]}"""))
    alerts.present(request("local"), null, true)
    alerts.reconcile(JSONObject("""{"hostId":"studio","pending":[],"alerts":[]}"""))
    platform.backgroundRunning = false
    alerts.present(request("fcm"), null, false)
    assertEquals(listOf("local"), platform.posted)
    assertEquals(listOf("local"), platform.cancelled)
  }

  @Test fun deniedPermissionDoesNotConsumeThePresentationAttempt() = runBlocking {
    platform.allowed = false
    alerts.present(request("denied"), null, true)
    platform.allowed = true
    alerts.present(request("permitted"), null, true)
    assertEquals(listOf("permitted"), platform.posted)
  }

  @Test fun forgettingTheHostRejectsAlreadyInFlightCarriers() = runBlocking {
    val cloud = async { alerts.present(request("fcm"), null, false) }
    delay(50)
    alerts.forget("studio")
    cloud.await()
    alerts.present(request("local"), null, true)
    assertEquals(emptyList<String>(), platform.posted)
  }

  @Test fun freshFeedCanRejectAnAlreadyResolvedItemNeverObservedLocally() = runBlocking {
    alerts.reconcile(JSONObject("""{"hostId":"studio","pending":[],"alerts":[]}"""))
    val cloud = async { alerts.present(request("late-fcm"), null, false) }
    delay(50)
    alerts.verifiedAbsent("studio", "approval-1")
    cloud.await()
    assertEquals(emptyList<String>(), platform.posted)
  }

  @Test fun hostOptOutAppliesToBothCarriersWithoutDeletingDeduplication() = runBlocking {
    alerts.hosts(setOf("studio"), true, mapOf("studio" to false))
    alerts.hosts(setOf("studio"), true)
    alerts.present(request("local"), null, true)
    platform.backgroundRunning = false
    alerts.present(request("fcm"), null, false)
    assertEquals(emptyList<String>(), platform.posted)
  }
}
