package expo.modules.conversationnotifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext

class ConnectionService : Service() {
  private var task: Pair<HeadlessJsTaskContext, Int>? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) {
      preferences(this).edit().putBoolean("enabled", false).commit()
      stopSelf()
      return START_NOT_STICKY
    }
    if (!preferences(this).getBoolean("enabled", false)) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      val manager = getSystemService(NotificationManager::class.java)
      val zh = resources.configuration.locales[0].language == "zh"
      manager.createNotificationChannel(NotificationChannel(
        CHANNEL, if (zh) "保持连接" else "Keep connected", NotificationManager.IMPORTANCE_LOW
      ).apply { setShowBadge(false) })
      val launch = packageManager.getLaunchIntentForPackage(packageName)
      val notification = NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
        .setContentTitle(if (zh) "保持连接" else "Keep connected")
        .setContentText(if (zh) "后台接收 Bot 审批请求" else "Receiving Bot approvals in the background")
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .apply {
          if (launch != null) setContentIntent(PendingIntent.getActivity(
            this@ConnectionService, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
          ))
        }
        .addAction(0, if (zh) "停止" else "Stop", PendingIntent.getService(
          this, 0, Intent(this, ConnectionService::class.java).setAction(STOP),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        ))
        .build()
      startForeground(NOTIFICATION_ID, notification)
      if (task == null) {
        val react = (application as ReactApplication).reactHost?.currentReactContext
        if (react == null) {
          failure = "runtime-unavailable"
          stopSelf()
          return START_NOT_STICKY
        }
        val tasks = HeadlessJsTaskContext.getInstance(react)
        running = true
        task = tasks to tasks.startTask(HeadlessJsTaskConfig(TASK, Arguments.createMap(), 0, true))
      }
      running = true
      failure = null
      Log.i("BotHarnessConnection", "phase=started")
      changed?.invoke()
      return START_NOT_STICKY
    } catch (error: Exception) {
      running = false
      failure = "connection-start-failed"
      Log.e("BotHarnessConnection", "phase=start-failed reason=${error.javaClass.simpleName}")
      changed?.invoke()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
  }

  override fun onDestroy() {
    running = false
    Log.i("BotHarnessConnection", "phase=stopped")
    changed?.invoke()
    task?.let { (tasks, id) -> if (tasks.isTaskRunning(id)) tasks.finishTask(id) }
    task = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    const val TASK = "BotharnessKeepConnected"
    private const val CHANNEL = "keep-connected"
    private const val STOP = "botharness.connection.STOP"
    private const val NOTIFICATION_ID = 3356
    @Volatile var running = false
      private set
    @Volatile var failure: String? = null
      private set
    @Volatile var changed: (() -> Unit)? = null

    private fun preferences(context: Context) = context.getSharedPreferences("connection-mode", Context.MODE_PRIVATE)

    fun state(context: Context): Map<String, Any?> = mapOf(
      "enabled" to preferences(context).getBoolean("enabled", false),
      "running" to running,
      "error" to failure
    )

    fun setEnabled(context: Context, enabled: Boolean) {
      check(preferences(context).edit().putBoolean("enabled", enabled).commit()) { "connection-preference-write-failed" }
      if (enabled) {
        try {
          ContextCompat.startForegroundService(context, Intent(context, ConnectionService::class.java))
        } catch (error: Exception) {
          failure = "connection-start-failed"
          changed?.invoke()
          throw error
        }
      } else {
        context.stopService(Intent(context, ConnectionService::class.java))
        changed?.invoke()
      }
    }
  }
}
