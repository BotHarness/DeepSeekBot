package expo.modules.conversationnotifications

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.core.app.NotificationCompat
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.ChannelAwareTrigger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class RecoveryAlertsTest {
  private lateinit var context: Context
  private lateinit var platform: Platform
  private lateinit var alerts: ApprovalAlerts

  private class Platform(val context: Context) : ApprovalNotificationPlatform {
    override var backgroundRunning = true
    override var foreground = false
    var allowed = true
    var failPost = false
    var beforeBuild: (suspend () -> Unit)? = null
    val posted = mutableListOf<Pair<String, android.app.Notification>>()
    val cancelled = mutableListOf<String>()
    val payloads = mutableListOf<JSONObject>()
    override fun permitted() = allowed
    override suspend fun build(notification: Notification, behavior: NotificationBehaviorRecord?): android.app.Notification {
      beforeBuild?.invoke()
      val content = notification.notificationRequest.content
      payloads.add(content.body!!)
      return NotificationCompat.Builder(context, "requests").setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(content.title).setContentText(content.text)
        .setDefaults(android.app.Notification.DEFAULT_ALL).build()
    }
    override fun post(identifier: String, notification: android.app.Notification) {
      if (failPost) throw IllegalStateException("test-post-failure")
      posted.add(identifier to notification)
    }
    override fun cancel(identifier: String) { cancelled.add(identifier) }
  }

  @Before fun setup() = runBlocking {
    context = RuntimeEnvironment.getApplication()
    context.deleteDatabase("approval-alerts.db")
    context.getSharedPreferences("approval-alert-policy", Context.MODE_PRIVATE).edit().clear().commit()
    context.getSharedPreferences("connection-mode", Context.MODE_PRIVATE).edit().clear().commit()
    platform = Platform(context)
    alerts = ApprovalAlerts(context, platform)
    alerts.hosts(setOf("studio", "laptop"), true)
  }
  @After fun close() { alerts.close(); ApprovalAlerts.incoming = null }

  private fun snapshot(
    items: List<Pair<String, String>> = emptyList(), host: String = "studio", session: String = "p1",
    batch: String = "b1", ready: Boolean = true, enabled: Boolean = true
  ): JSONObject {
    val facts = items.map { (id, kind) -> JSONObject().put("itemId", id).put("kind", kind) }
    return JSONObject().put("hostId", host).put("foreground", platform.foreground)
      .put("pending", JSONArray(items.map { it.first })).put("items", JSONArray(facts))
      .put("recovery", JSONObject().put("session", session).put("batch", batch).put("ready", ready)
        .put("enabled", enabled).put("hostName", "QA Host").put("language", "en"))
      .put("alerts", JSONArray(facts.map { fact ->
        JSONObject().put("title", "Helper").put("body", "PRIVATE_DO_NOT_AGGREGATE")
          .put("data", JSONObject(fact.toString()).put("v", 1).put("hostId", host).put("channelId", "dm:helper"))
      }))
  }

  private fun cloud(item: String, kind: String) = Notification(NotificationRequest("fcm:$item",
    NotificationContent.Builder().setTitle("Cloud").setText("Needs you").setBody(JSONObject()
      .put("v", 1).put("hostId", "studio").put("itemId", item).put("kind", kind)).build(),
    ChannelAwareTrigger("requests")))

  private fun alertingCandidates() = platform.posted.count { (_, notice) ->
    notice.groupAlertBehavior == android.app.Notification.GROUP_ALERT_ALL
  }

  @Test fun firstEnableSilencesOldRepliesAndSummarizesRequestsWithoutPrivateContent() = runBlocking {
    val items = listOf("old" to "channel-reply", "approval" to "tool-approval", "private" to "private-input")
    alerts.reconcile(snapshot(items))
    assertEquals(1, platform.posted.size)
    assertEquals("New replies 0 · Needs you 2", platform.posted[0].second.extras.getCharSequence("android.text").toString())
    assertFalse(platform.payloads.toString().contains("PRIVATE_DO_NOT_AGGREGATE"))
    assertEquals("", platform.payloads.last().getString("botSlug"))
    alerts.reconcile(snapshot(items, batch = "b2"))
    platform.backgroundRunning = false
    alerts.present(cloud("old", "channel-reply"), null, false)
    alerts.present(cloud("approval", "tool-approval"), null, false)
    assertEquals(1, platform.posted.size)
  }

  @Test fun recoveryOverPaginationWindowGroupsEachHostAndOnlyOneHostSounds() = runBlocking {
    alerts.reconcile(snapshot())
    alerts.reconcile(snapshot(host = "laptop"))
    alerts.reconcile(snapshot(ready = false))
    alerts.reconcile(snapshot(host = "laptop", ready = false))
    val items = (1..251).map { "reply-$it" to "channel-reply" } + ("request" to "user-question")
    alerts.reconcile(snapshot(items, batch = "reconnected"))
    alerts.reconcile(snapshot(items, host = "laptop", batch = "reconnected"))
    assertEquals(2, platform.posted.size)
    assertEquals("channel-controlled alerting candidates", 1, alertingCandidates())
    for ((_, notice) in platform.posted.filter { it.second.groupAlertBehavior != android.app.Notification.GROUP_ALERT_ALL }) {
      assertEquals(android.app.Notification.GROUP_ALERT_SUMMARY, notice.groupAlertBehavior)
      assertEquals(0, notice.flags and android.app.Notification.FLAG_GROUP_SUMMARY)
    }
    assertEquals("New replies 251 · Needs you 1", platform.posted[0].second.extras.getCharSequence("android.text").toString())
    alerts.reconcile(snapshot(items + ("fresh" to "channel-reply"), batch = "live"))
    assertEquals(3, platform.posted.size)
    assertEquals(2, alertingCandidates())
  }

  @Test fun restartRetainsDeduplicationAndRecoversUnseenReplies() = runBlocking {
    alerts.reconcile(snapshot())
    alerts.close()
    alerts = ApprovalAlerts(context, platform)
    val items = listOf("new" to "channel-reply")
    alerts.reconcile(snapshot(items, session = "p2", batch = "p2:b1"))
    assertEquals(1, platform.posted.size)
    alerts.close()
    alerts = ApprovalAlerts(context, platform)
    alerts.reconcile(snapshot(items, session = "p3", batch = "p3:b1"))
    assertEquals(1, platform.posted.size)
  }

  @Test fun explicitReenableSilencesBacklogButDoesNotForgetPriorClaims() = runBlocking {
    alerts.reconcile(snapshot())
    alerts.reconcile(snapshot(enabled = false))
    alerts.reconcile(snapshot(listOf("old" to "channel-reply", "request" to "user-question"), batch = "enabled"))
    assertEquals(1, platform.posted.size)
    context.getSharedPreferences("connection-mode", Context.MODE_PRIVATE).edit().putLong("recoveryEpoch", 1).commit()
    alerts.reconcile(snapshot(listOf("old" to "channel-reply", "request" to "user-question", "stopped" to "channel-reply"), batch = "mode-enabled"))
    assertEquals(1, platform.posted.size)
  }

  @Test fun failedPostRemainsOneRetryableCohortAcrossRestartWithoutAnotherSoundClaim() = runBlocking {
    val items = listOf("a" to "tool-approval", "b" to "user-question")
    platform.failPost = true
    try { alerts.reconcile(snapshot(items)); fail("expected platform failure") } catch (_: IllegalStateException) {}
    alerts.close()
    alerts = ApprovalAlerts(context, platform)
    platform.failPost = false
    alerts.reconcile(snapshot(items, session = "p2", batch = "retry"))
    assertEquals(1, platform.posted.size)
    assertEquals(0, alertingCandidates())
    assertEquals("New replies 0 · Needs you 2", platform.posted[0].second.extras.getCharSequence("android.text").toString())
  }

  @Test fun deniedPermissionCanBecomeOneForegroundSummaryAndCannotReplayInBackground() = runBlocking {
    platform.allowed = false
    val items = listOf("a" to "tool-approval", "b" to "user-question")
    alerts.reconcile(snapshot(items))
    assertEquals(0, platform.posted.size)
    platform.foreground = true
    val banners = JSONArray(alerts.reconcile(snapshot(items, batch = "foreground")))
    assertEquals(1, banners.length())
    assertEquals(2, banners.getJSONObject(0).getJSONArray("members").length())
    platform.foreground = false
    platform.allowed = true
    alerts.reconcile(snapshot(items, batch = "background"))
    assertEquals(0, platform.posted.size)
  }

  @Test fun resolvedMemberUpdatesSummarySilentlyThenAllResolvedCancelsAndLateCloudStaysSuppressed() = runBlocking {
    alerts.reconcile(snapshot(listOf("a" to "tool-approval", "b" to "user-question")))
    alerts.reconcile(snapshot(listOf("b" to "user-question"), batch = "partial"))
    assertEquals(2, platform.posted.size)
    assertEquals(platform.posted[0].first, platform.posted[1].first)
    assertEquals("channel-controlled alerting candidates", 1, alertingCandidates())
    for ((_, notice) in platform.posted.filter { it.second.groupAlertBehavior != android.app.Notification.GROUP_ALERT_ALL }) {
      assertEquals(android.app.Notification.GROUP_ALERT_SUMMARY, notice.groupAlertBehavior)
      assertEquals(0, notice.flags and android.app.Notification.FLAG_GROUP_SUMMARY)
    }
    alerts.reconcile(snapshot(batch = "resolved"))
    assertTrue(platform.cancelled.contains(platform.posted[0].first))
    platform.backgroundRunning = false
    alerts.present(cloud("a", "tool-approval"), null, false)
    alerts.present(cloud("b", "user-question"), null, false)
    assertEquals(2, platform.posted.size)
  }

  @Test fun resolutionDuringNativeBuildCannotResurrectTheCohort() = runBlocking {
    val entered = CompletableDeferred<Unit>()
    val release = CompletableDeferred<Unit>()
    platform.beforeBuild = { entered.complete(Unit); release.await() }
    val posting = async { alerts.reconcile(snapshot(listOf("a" to "tool-approval"))) }
    entered.await()
    platform.beforeBuild = null
    alerts.reconcile(snapshot(batch = "resolved"))
    release.complete(Unit)
    posting.await()
    assertEquals(0, platform.posted.size)
  }
  @Test fun upgradeRetainsExistingDeliveryClaims() = runBlocking {
    alerts.close()
    context.deleteDatabase("approval-alerts.db")
    val legacy = SQLiteDatabase.openOrCreateDatabase(context.getDatabasePath("approval-alerts.db"), null)
    legacy.execSQL("CREATE TABLE alerts (host TEXT NOT NULL, item TEXT NOT NULL, state TEXT NOT NULL, identifier TEXT, observed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(host, item))")
    legacy.execSQL("INSERT INTO alerts(host,item,state,observed) VALUES ('studio','old','posted',1)")
    legacy.version = 1
    legacy.close()
    alerts = ApprovalAlerts(context, platform)
    alerts.reconcile(snapshot(listOf("old" to "tool-approval", "new" to "user-question")))
    assertEquals(2, alerts.readableDatabase.version)
    assertEquals(1, platform.posted.size)
    assertEquals("New replies 0 · Needs you 1", platform.posted[0].second.extras.getCharSequence("android.text").toString())
  }

  @Test fun foregroundRaceClaimsOnlyOneSurfaceAndUnknownPolicyDoesNotResetBaseline() = runBlocking {
    alerts.reconcile(snapshot())
    val unknown = snapshot(ready = false, enabled = false)
    unknown.getJSONObject("recovery").remove("enabled")
    alerts.reconcile(unknown)
    val entered = CompletableDeferred<Unit>()
    val release = CompletableDeferred<Unit>()
    platform.beforeBuild = { entered.complete(Unit); release.await() }
    val items = listOf("new" to "channel-reply")
    val posting = async { alerts.reconcile(snapshot(items, session = "p2", batch = "recovery")) }
    entered.await()
    platform.beforeBuild = null
    platform.foreground = true
    assertEquals(1, JSONArray(alerts.reconcile(snapshot(items, session = "p2", batch = "foreground"))).length())
    release.complete(Unit)
    posting.await()
    assertEquals(0, platform.posted.size)
    platform.foreground = false
    alerts.reconcile(snapshot(items, session = "p2", batch = "background"))
    assertEquals(0, platform.posted.size)
  }

  @Test fun unpairCancelsOnlyThatHostsCohortsAndRejectsLateCarriers() = runBlocking {
    val items = listOf("a" to "tool-approval")
    alerts.reconcile(snapshot(items))
    alerts.reconcile(snapshot(items, host = "laptop"))
    val studio = platform.posted[0].first
    val laptop = platform.posted[1].first
    alerts.forget("studio")
    assertTrue(platform.cancelled.contains(studio))
    assertFalse(platform.cancelled.contains(laptop))
    platform.backgroundRunning = false
    alerts.present(cloud("a", "tool-approval"), null, false)
    assertEquals(2, platform.posted.size)
  }

}
