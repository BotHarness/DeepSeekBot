package expo.modules.conversationnotifications

import android.app.NotificationManager
import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import androidx.core.app.NotificationManagerCompat
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.ChannelAwareTrigger
import expo.modules.notifications.service.delegates.ExpoHandlingDelegate
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.security.MessageDigest

internal interface ApprovalNotificationPlatform {
  val backgroundRunning: Boolean
  val foreground: Boolean
  fun permitted(): Boolean
  suspend fun build(notification: Notification, behavior: NotificationBehaviorRecord?): android.app.Notification
  fun post(identifier: String, notification: android.app.Notification)
  fun cancel(identifier: String)
}

private class AndroidApprovalNotifications(private val context: Context) : ApprovalNotificationPlatform {
  override val backgroundRunning get() = ConnectionService.running
  override val foreground get() = ExpoHandlingDelegate(context).isAppInForeground()
  override fun permitted(): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled() &&
    context.getSystemService(NotificationManager::class.java).getNotificationChannel("requests")?.importance != NotificationManager.IMPORTANCE_NONE
  override suspend fun build(notification: Notification, behavior: NotificationBehaviorRecord?) =
    ConversationPresentationDelegate(context).createApprovalNotification(notification, behavior)
  override fun post(identifier: String, notification: android.app.Notification) {
    NotificationManagerCompat.from(context).notify(identifier, 0, notification)
  }
  override fun cancel(identifier: String) { NotificationManagerCompat.from(context).cancel(identifier, 0) }
}

class ApprovalAlerts internal constructor(
  private val context: Context,
  private val platform: ApprovalNotificationPlatform = AndroidApprovalNotifications(context)
) : SQLiteOpenHelper(
  context, "approval-alerts.db", null, 1
) {
  private val mutex = Mutex()
  private val preferences = context.getSharedPreferences("approval-alert-policy", Context.MODE_PRIVATE)

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE alerts (host TEXT NOT NULL, item TEXT NOT NULL, state TEXT NOT NULL, identifier TEXT, observed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(host, item))")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  suspend fun hosts(ids: Set<String>, approvalsEnabled: Boolean, policies: Map<String, Boolean> = emptyMap()) = mutex.withLock {
    val previous = preferences.getStringSet("hosts", emptySet()) ?: emptySet()
    for (host in previous - ids) forgetLocked(host)
    val muted = (preferences.getStringSet("muted", emptySet()) ?: emptySet()).intersect(ids).toMutableSet()
    for ((host, enabled) in policies) if (host in ids) {
      if (enabled) muted.remove(host) else muted.add(host)
    }
    check(preferences.edit().putStringSet("hosts", ids).putBoolean("enabled", approvalsEnabled).putStringSet("muted", muted).commit())
  }

  suspend fun forget(host: String) = mutex.withLock {
    val hosts = preferences.getStringSet("hosts", emptySet()) ?: emptySet()
    check(preferences.edit().putStringSet("hosts", hosts - host).commit())
    forgetLocked(host)
  }

  suspend fun verifiedAbsent(host: String, item: String): Unit = mutex.withLock {
    if (!paired(host)) return@withLock
    readableDatabase.rawQuery("SELECT identifier FROM alerts WHERE host = ? AND item = ?", arrayOf(host, item)).use {
      if (it.moveToFirst()) it.getString(0)?.let(platform::cancel)
    }
    writableDatabase.insertWithOnConflict("alerts", null, ContentValues().apply {
      put("host", host); put("item", item); put("state", "resolved"); put("observed", 1)
    }, SQLiteDatabase.CONFLICT_REPLACE)
    Unit
  }

  private fun forgetLocked(host: String) {
    readableDatabase.rawQuery("SELECT identifier FROM alerts WHERE host = ?", arrayOf(host)).use { rows ->
      while (rows.moveToNext()) rows.getString(0)?.let(platform::cancel)
    }
    writableDatabase.delete("alerts", "host = ?", arrayOf(host))
  }

  suspend fun reconcile(snapshot: JSONObject) {
    val host = snapshot.getString("hostId")
    val pending = snapshot.getJSONArray("pending").let { values ->
      (0 until values.length()).map { values.getString(it) }.toSet()
    }
    mutex.withLock {
      if (!paired(host)) return
      val db = writableDatabase
      db.rawQuery("SELECT item, identifier FROM alerts WHERE host = ? AND observed = 1 AND state != 'resolved'", arrayOf(host)).use { rows ->
        while (rows.moveToNext()) {
          val item = rows.getString(0)
          if (item !in pending) {
            rows.getString(1)?.let(platform::cancel)
            db.execSQL("UPDATE alerts SET state = 'resolved' WHERE host = ? AND item = ?", arrayOf(host, item))
          }
        }
      }
      for (item in pending) {
        db.insertWithOnConflict("alerts", null, ContentValues().apply {
          put("host", host); put("item", item); put("state", "pending"); put("observed", 1)
        }, SQLiteDatabase.CONFLICT_IGNORE)
        db.execSQL("UPDATE alerts SET observed = 1 WHERE host = ? AND item = ?", arrayOf(host, item))
      }
    }
    val alerts = snapshot.getJSONArray("alerts")
    for (index in 0 until alerts.length()) {
      if (!platform.backgroundRunning) return
      val alert = alerts.getJSONObject(index)
      val data = alert.getJSONObject("data")
      val content = NotificationContent.Builder()
        .setTitle(alert.getString("title"))
        .setText(alert.getString("body"))
        .setBody(data)
        .setAutoDismiss(true)
        .apply { useDefaultSound(); useDefaultVibrationPattern() }
        .build()
      val notification = Notification(NotificationRequest(
        identifier(host, data.getString("itemId")), content, ChannelAwareTrigger("requests")
      ))
      present(notification, null, local = true)
    }
  }

  suspend fun present(notification: Notification, behavior: NotificationBehaviorRecord?, local: Boolean) {
    val request = notification.notificationRequest
    val data = request.content.body ?: return
    val host = data.optString("hostId")
    val item = data.optString("itemId")
    if (!local) runCatching { incoming?.invoke(host, item) }
    if (!local && platform.backgroundRunning) delay(1500)
    if (!mutex.withLock { eligible(host, item, local) }) return
    val built = platform.build(notification, behavior)
    mutex.withLock {
      if (!eligible(host, item, local)) return
      val state = readableDatabase.rawQuery(
        "SELECT state FROM alerts WHERE host = ? AND item = ?", arrayOf(host, item)
      ).use { if (it.moveToFirst()) it.getString(0) else null }
      if (state == "posted" || state == "resolved") return
      if (!platform.permitted()) return
      val values = ContentValues().apply {
        put("host", host); put("item", item); put("state", "posted"); put("identifier", request.identifier)
      }
      if (state == null) writableDatabase.insertOrThrow("alerts", null, values)
      else writableDatabase.update("alerts", values, "host = ? AND item = ?", arrayOf(host, item))
      try {
        platform.post(request.identifier, built)
      } catch (error: Exception) {
        writableDatabase.execSQL("UPDATE alerts SET state = 'pending' WHERE host = ? AND item = ?", arrayOf(host, item))
        throw error
      }
    }
  }

  private fun eligible(host: String, item: String, local: Boolean): Boolean {
    if (!paired(host) || !preferences.getBoolean("enabled", true)) return false
    if (host in (preferences.getStringSet("muted", emptySet()) ?: emptySet())) return false
    if (local && (!platform.backgroundRunning || platform.foreground)) return false
    val state = readableDatabase.rawQuery("SELECT state FROM alerts WHERE host = ? AND item = ?", arrayOf(host, item))
      .use { if (it.moveToFirst()) it.getString(0) else null }
    return state != "posted" && state != "resolved" && platform.permitted()
  }

  private fun paired(host: String): Boolean = !preferences.contains("hosts") ||
    host in (preferences.getStringSet("hosts", emptySet()) ?: emptySet())

  companion object {
    @Volatile var incoming: ((String, String) -> Unit)? = null
    @Volatile private var instance: ApprovalAlerts? = null
    fun get(context: Context): ApprovalAlerts = instance ?: synchronized(this) {
      instance ?: ApprovalAlerts(context.applicationContext).also { instance = it }
    }
    fun handles(notification: Notification): Boolean = notification.notificationRequest.content.body?.let {
      it.optInt("v") == 1 && it.optString("kind") == "tool-approval" &&
        it.optString("hostId").isNotEmpty() && it.optString("itemId").isNotEmpty()
    } == true
    private fun identifier(host: String, item: String): String = "local-approval-" +
      MessageDigest.getInstance("SHA-256").digest("$host\u0000$item".toByteArray()).joinToString("") { "%02x".format(it) }
  }
}
