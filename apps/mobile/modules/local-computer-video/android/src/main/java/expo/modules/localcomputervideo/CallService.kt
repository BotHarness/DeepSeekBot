package expo.modules.localcomputervideo

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import java.util.UUID

/**
 * Keeps a Bot call running while the app is in the background or the phone is locked
 * (#3423, ADR-0305). It is a `microphone` + `mediaPlayback` foreground service with one
 * ongoing call notification, holds a partial wake lock and a low-latency Wi-Fi lock for
 * the call's lifetime, and owns the over-other-apps bubble (#3469). The call itself stays
 * in [CallAttempt]; this service only keeps the process eligible to record and play.
 * Every entry point runs on the main thread.
 */
class CallService : Service() {
  private var wake: PowerManager.WakeLock? = null
  private var wifi: WifiManager.WifiLock? = null
  private var overlay: CallOverlay? = null
  private var task: Pair<HeadlessJsTaskContext, Int>? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_HANG_UP -> { actions?.invoke("hang-up"); return START_NOT_STICKY }
      ACTION_MUTE -> { actions?.invoke("mute"); return START_NOT_STICKY }
    }
    val shown = notice
    if (shown == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      ensureChannel(this, shown)
      val notification = build(this, shown)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(NOTIFICATION_ID, notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      current = this
      if (task == null) {
        val react = (application as ReactApplication).reactHost?.currentReactContext
          ?: error("call-runtime-unavailable")
        val tasks = HeadlessJsTaskContext.getInstance(react)
        val token = UUID.randomUUID().toString()
        backgroundToken = token
        val data = Arguments.createMap().apply { putString("token", token) }
        task = tasks to tasks.startTask(HeadlessJsTaskConfig("BotharnessCall", data, 0, true))
      }
      running = true
      failure = null
      hold()
      syncOverlay()
      Log.i(TAG, "phase=started")
      changed?.invoke()
    } catch (error: Exception) {
      // Android 14 refuses a microphone service the app did not start while visible.
      running = false
      failure = error.javaClass.simpleName
      backgroundToken = null
      Log.e(TAG, "phase=start-failed reason=${error.javaClass.simpleName}")
      stopSelf()
      changed?.invoke()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    if (current === this) current = null
    running = false
    backgroundToken = null
    // A stop the app asked for clears the request; a later call starts a new service.
    if (notice == null) requested = false
    overlay?.hide()
    overlay = null
    runCatching { wake?.takeIf { it.isHeld }?.release() }
    runCatching { wifi?.takeIf { it.isHeld }?.release() }
    wake = null
    wifi = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    Log.i(TAG, "phase=stopped")
    changed?.invoke()
    task?.let { (tasks, id) -> if (tasks.isTaskRunning(id)) tasks.finishTask(id) }
    task = null
    super.onDestroy()
  }

  /** CPU and Wi-Fi stay awake for the call, so the screen can turn off. */
  private fun hold() {
    if (wake == null) {
      wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DeepSeekBot:call")
        .apply { setReferenceCounted(false); acquire(MAX_CALL_MS) }
    }
    if (wifi == null) {
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) WifiManager.WIFI_MODE_FULL_LOW_LATENCY
        else @Suppress("DEPRECATION") WifiManager.WIFI_MODE_FULL_HIGH_PERF
      wifi = runCatching {
        (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
          .createWifiLock(mode, "DeepSeekBot:call").apply { setReferenceCounted(false); acquire() }
      }.getOrNull()
    }
  }

  private fun refresh() {
    val shown = notice ?: return
    runCatching {
      getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(this, shown))
    }.onFailure { Log.e(TAG, "phase=update-failed reason=${it.javaClass.simpleName}") }
    syncOverlay()
  }

  private fun syncOverlay() {
    val shown = notice
    if (shown == null || !overlayWanted || !Settings.canDrawOverlays(this)) {
      overlay?.hide()
      return
    }
    val bubble = overlay ?: CallOverlay(this) { open(this) }.also { overlay = it }
    if (!bubble.show(shown)) Log.e(TAG, "phase=overlay-failed")
  }

  companion object {
    private const val TAG = "BotHarnessCall"
    private const val CHANNEL = "bot-calls"
    private const val NOTIFICATION_ID = 3423
    private const val MAX_CALL_MS = 4L * 60 * 60 * 1000
    internal const val ACTION_HANG_UP = "botharness.call.HANG_UP"
    internal const val ACTION_MUTE = "botharness.call.MUTE"
    /** The activity intent the notification and the bubble open; the module turns it into "open". */
    const val ACTION_OPEN = "botharness.call.OPEN"

    /** True once Android accepted the foreground service; false again after it stops. */
    @Volatile var running = false
      private set
    @Volatile var backgroundToken: String? = null
      private set
    @Volatile var failure: String? = null
      private set
    /** "hang-up" or "mute" from the notification. */
    @Volatile var actions: ((String) -> Unit)? = null
    /** Fired when the service starts, fails to start or stops. */
    @Volatile var changed: (() -> Unit)? = null

    private var notice: CallNotice? = null
    private var current: CallService? = null
    private var requested = false
    private var overlayWanted = false

    /** The service was asked to keep the call; it may still be starting. */
    val keeping: Boolean get() = running || (requested && failure == null)

    /** Starts the service or updates what it shows. Main thread; call while the app is visible. */
    fun show(context: Context, value: CallNotice): Boolean {
      notice = value
      val service = current
      if (service != null && running) { service.refresh(); return true }
      if (requested) return failure == null
      return try {
        failure = null
        requested = true
        context.startForegroundService(Intent(context, CallService::class.java))
        true
      } catch (error: Exception) {
        requested = false
        failure = error.javaClass.simpleName
        Log.e(TAG, "phase=request-failed reason=${error.javaClass.simpleName}")
        false
      }
    }

    fun end(context: Context) {
      notice = null
      requested = false
      overlayWanted = false
      current?.overlay?.hide()
      context.stopService(Intent(context, CallService::class.java))
    }

    /** The native bubble shows only while the app is in the background (#3469). */
    fun setOverlay(wanted: Boolean) {
      overlayWanted = wanted
      current?.syncOverlay()
    }

    fun openIntent(context: Context): Intent? =
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        // A distinct action, so Android delivers it to the running activity instead of
        // only bringing the task forward; there is no data, so routing never sees a URL.
        action = ACTION_OPEN
        removeCategory(Intent.CATEGORY_LAUNCHER)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }

    private fun open(context: Context) {
      // Drawing over other apps also lets the bubble bring the app forward from the background.
      val intent = openIntent(context) ?: return
      runCatching { context.startActivity(intent) }
        .onFailure { Log.e(TAG, "phase=open-failed reason=${it.javaClass.simpleName}") }
    }

    private fun ensureChannel(context: Context, value: CallNotice) {
      val channel = NotificationChannel(CHANNEL, value.channelName, NotificationManager.IMPORTANCE_DEFAULT).apply {
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun service(context: Context, action: String, code: Int): PendingIntent =
      PendingIntent.getService(context, code, Intent(context, CallService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    internal fun build(context: Context, value: CallNotice): Notification {
      val hangUp = service(context, ACTION_HANG_UP, 1)
      val mute = service(context, ACTION_MUTE, 2)
      val builder = Notification.Builder(context, CHANNEL)
        .setSmallIcon(R.drawable.bot_call_notice_call)
        .setContentTitle(value.name)
        .setContentText(value.status)
        .setCategory(Notification.CATEGORY_CALL)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setColor(value.ringColor)
      openIntent(context)?.let {
        builder.setContentIntent(PendingIntent.getActivity(context, 3, it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      val started = value.startedAt
      if (started != null) builder.setWhen(started).setShowWhen(true).setUsesChronometer(true)
      else builder.setShowWhen(false)
      val muteAction = Notification.Action.Builder(
        Icon.createWithResource(context, if (value.muted) R.drawable.bot_call_notice_mic_off else R.drawable.bot_call_notice_mic),
        if (value.muted) value.unmuteLabel else value.muteLabel, mute).build()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        val person = Person.Builder().setName(value.name).setImportant(true).build()
        builder.setStyle(Notification.CallStyle.forOngoingCall(person, hangUp))
        builder.addAction(muteAction)
      } else {
        builder.addAction(muteAction)
        builder.addAction(Notification.Action.Builder(
          Icon.createWithResource(context, R.drawable.bot_call_notice_call), value.hangUpLabel, hangUp).build())
      }
      return builder.build().apply { flags = flags or Notification.FLAG_NO_CLEAR }
    }
  }
}
