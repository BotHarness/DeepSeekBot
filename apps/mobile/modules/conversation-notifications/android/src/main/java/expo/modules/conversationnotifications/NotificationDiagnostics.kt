package expo.modules.conversationnotifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object NotificationDiagnostics {
  private const val TEST_ID = 90403
  private val events = java.util.ArrayDeque<Map<String, Any>>()
  @Synchronized private fun record(phase: String) {
    if (events.size == 20) events.removeFirst()
    events.addLast(mapOf("at" to System.currentTimeMillis(), "phase" to phase))
    Log.i("BotHarnessNotification", "initiator=human phase=$phase")
  }
  @Synchronized private fun recentEvents() = events.toList()
  private fun preferences(context: Context) = context.getSharedPreferences("notification-setup", Context.MODE_PRIVATE)

  private fun channel(manager: NotificationManager, id: String): String {
    val channel = manager.getNotificationChannel(id) ?: return "missing"
    return if (channel.importance == NotificationManager.IMPORTANCE_NONE) "blocked" else "available"
  }

  fun read(context: Context): Map<String, Any> {
    val manager = context.getSystemService(NotificationManager::class.java)
    val power = context.getSystemService(PowerManager::class.java)
    return mapOf(
      "permission" to NotificationManagerCompat.from(context).areNotificationsEnabled(),
      "requests" to channel(manager, "requests"),
      "connection" to channel(manager, ConnectionService.CHANNEL),
      "batteryExempt" to power.isIgnoringBatteryOptimizations(context.packageName),
      "powerSave" to power.isPowerSaveMode,
      "setupDismissed" to preferences(context).getBoolean("dismissed", false),
      "events" to recentEvents()
    )
  }

  fun dismissSetup(context: Context) {
    check(preferences(context).edit().putBoolean("dismissed", true).commit()) { "setup-save-failed" }
    record("setup-dismissed")
  }

  fun test(context: Context, language: String): String {
    record("local-test-requested")
    val manager = context.getSystemService(NotificationManager::class.java)
    val zh = language == "zh"
    manager.createNotificationChannel(NotificationChannel(
      "requests", if (zh) "需要你处理" else "Needs you", NotificationManager.IMPORTANCE_HIGH
    ))
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      record("local-test-permission-blocked")
      return "permission-blocked"
    }
    if (channel(manager, "requests") == "blocked") {
      record("local-test-channel-blocked")
      return "channel-blocked"
    }
    val notification = NotificationCompat.Builder(context, "requests")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(if (zh) "本机通知测试" else "Local notification test")
      .setContentText(if (zh) "看见这条通知后，返回应用确认。" else "Return to the app after you see this notification.")
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setAutoCancel(true)
      .setTimeoutAfter(60000)
      .build()
    try {
      manager.notify(TEST_ID, notification)
    } catch (error: Exception) {
      record("local-test-post-failed")
      throw error
    }
    record("local-test-posted")
    return "posted"
  }
}
