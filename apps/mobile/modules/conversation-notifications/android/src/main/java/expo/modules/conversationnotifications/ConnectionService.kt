package expo.modules.conversationnotifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Handler
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import android.os.Looper
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
      current = this
      startForeground(NOTIFICATION_ID, ConnectionNotice.build(this, summary, language ?: if (zh) "zh" else "en"))
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
    current = null
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
    internal const val CHANNEL = "keep-connected"
    internal const val STOP = "botharness.connection.STOP"
    private const val NOTIFICATION_ID = 3356
    @Volatile var running = false
      private set
    @Volatile var failure: String? = null
      private set
    @Volatile var changed: (() -> Unit)? = null

    @Volatile private var current: ConnectionService? = null
    @Volatile private var summary = ConnectionSummary()
    @Volatile private var language: String? = null

    fun updateSummary(value: ConnectionSummary, locale: String) {
      if (summary == value && language == locale) return
      summary = value
      language = locale
      Handler(Looper.getMainLooper()).post {
        val service = current
        if (service != null && running) {
          try {
            service.getSystemService(NotificationManager::class.java).notify(
              NOTIFICATION_ID, ConnectionNotice.build(service, summary, language ?: "en")
            )
          } catch (error: Exception) {
            failure = "connection-summary-failed"
            Log.e("BotHarnessConnection", "phase=summary-failed reason=${error.javaClass.simpleName}")
            changed?.invoke()
          }
        }
      }
    }
    private fun preferences(context: Context) = context.getSharedPreferences("connection-mode", Context.MODE_PRIVATE)

    fun state(context: Context): Map<String, Any?> = mapOf(
      "enabled" to preferences(context).getBoolean("enabled", false),
      "running" to running,
      "error" to failure
    )

    fun setEnabled(context: Context, enabled: Boolean) {
      val saved = preferences(context)
      val edit = saved.edit().putBoolean("enabled", enabled)
      if (enabled && !saved.getBoolean("enabled", false))
        edit.putLong("recoveryEpoch", saved.getLong("recoveryEpoch", 0) + 1)
      check(edit.commit()) { "connection-preference-write-failed" }
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
