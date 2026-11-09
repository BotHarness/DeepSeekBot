package expo.modules.localcomputervideo

import android.Manifest
import android.app.Activity
import android.app.Application
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.Collections
import java.util.WeakHashMap

class LocalComputerVideoModule : Module() {
  private val views = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap<LocalComputerVideoView, Boolean>()))
  private val main = Handler(Looper.getMainLooper())
  private var foreground = true
  /** The one Bot call this app may hold. A new attempt replaces it. Main thread only. */
  @Volatile private var call: CallAttempt? = null
  private val directs = java.util.concurrent.ConcurrentHashMap<String, DirectChannel>()

  /**
   * Ends the call natively. A call keeps running in the background while [CallService]
   * holds it (ADR-0305); without the service, leaving the app ends it as before.
   */
  private fun endCall(code: String?) {
    val current = call ?: return
    call = null
    if (code != null) sendEvent("onCallState", mapOf("attemptId" to current.id, "state" to "closed", "code" to code))
    current.close { }
  }

  private fun audioEvent(attempt: CallAttempt, extra: Map<String, Any?> = emptyMap()) {
    if (call !== attempt) return
    // Every event carries the interruption, so a route change never clears it in JS.
    sendEvent("onCallAudio", mapOf("attemptId" to attempt.id, "interrupted" to attempt.interrupted) + extra)
  }

  private fun context() = appContext.reactContext?.applicationContext

  /**
   * Whether any of the app's activities is started. A permission dialog only pauses the
   * activity, so the bubble over other apps waits for the app to be really hidden.
   */
  private var startedActivities = 0
  private var application: Application? = null
  private val visibility = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityStarted(activity: Activity) {
      startedActivities += 1
      CallService.setOverlay(false)
    }
    override fun onActivityStopped(activity: Activity) {
      // The module can load after the activity started, so the count never goes below 0.
      startedActivities = maxOf(0, startedActivities - 1)
      if (startedActivities == 0 && call != null && CallService.keeping) CallService.setOverlay(true)
    }
    override fun onActivityCreated(activity: Activity, state: Bundle?) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
  }

  private fun attachService() {
    CallService.actions = { action -> main.post { sendEvent("onCallAction", mapOf("action" to action)) } }
    CallService.changed = {
      main.post {
        // The service could not start or was stopped by Android while the app is away:
        // the call can no longer record, so end it like a foreground-only call.
        if (!foreground && call != null && !CallService.keeping) endCall("background")
      }
    }
  }

  private fun stopViews(reason: String) {
    val owned = synchronized(views) { views.toList() }
    val stop = Runnable { owned.forEach { it.setAppForeground(false); it.suspendMedia(reason) } }
    if (Looper.myLooper() == Looper.getMainLooper()) stop.run() else main.post(stop)
  }

  override fun definition() = ModuleDefinition {
    Name("LocalComputerVideo")
    Constant("callAudioSupported") { android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S }
    Constant("callAudioModeSupported") { android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU }
    Events("onCallState", "onCallTap", "onCallAudio", "onCallAction", "onDirect")

    AsyncFunction("directOffer") { id: String, iceServers: List<String>, promise: Promise ->
      val context = context() ?: return@AsyncFunction promise.reject("native-unavailable", "Direct connection could not start.", null)
      directs.remove(id)?.close()
      val channel = DirectChannel(id, context) { kind, body ->
        if (kind == "closed") directs.remove(id)
        sendEvent("onDirect", body + mapOf("id" to id, "kind" to kind))
      }
      directs[id] = channel
      channel.offer(iceServers) { sdp, code ->
        if (sdp != null) promise.resolve(sdp) else promise.reject(code ?: "offer-failed", "Direct connection could not start.", null)
      }
    }

    AsyncFunction("directAnswer") { id: String, answer: String, promise: Promise ->
      val channel = directs[id]
      if (channel == null || !answer.startsWith("v=0") || answer.length > 16384)
        return@AsyncFunction promise.reject("answer-invalid", "Direct answer was refused.", null)
      channel.answer(answer) { code ->
        if (code != null) promise.reject(code, "Direct answer was refused.", null) else promise.resolve(null)
      }
    }

    Function("directSend") { id: String, text: String -> directs[id]?.send(text) ?: false }

    Function("directClose") { id: String -> directs[id]?.close() }

    OnCreate {
      attachService()
      application = context() as? Application
      application?.registerActivityLifecycleCallbacks(visibility)
    }

    // The ongoing call notification (#3423). Starting it needs the app to be visible.
    AsyncFunction("callNoticeShow") { notice: Map<String, Any?> ->
      val context = context() ?: return@AsyncFunction false
      val parsed = CallNotice.from(notice) ?: return@AsyncFunction false
      CallService.show(context, parsed)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("callNoticeEnd") {
      context()?.let { CallService.end(it) }
      Unit
    }.runOnQueue(Queues.MAIN)

    Function("callNotificationsAllowed") {
      context()?.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() ?: false
    }

    // The bubble over other apps (#3469) needs "Display over other apps".
    Function("callOverlayAllowed") { context()?.let { Settings.canDrawOverlays(it) } ?: false }

    AsyncFunction("callOverlaySettings") {
      val context = context() ?: return@AsyncFunction false
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      runCatching { (appContext.currentActivity ?: context).startActivity(intent) }.isSuccess
    }.runOnQueue(Queues.MAIN)

    // The notification or the bubble brought the app forward: JavaScript shows the call.
    OnNewIntent { intent ->
      if (intent.action == CallService.ACTION_OPEN) sendEvent("onCallAction", mapOf("action" to "open"))
    }

    // Answers the Host's audio offer with the microphone. `testAudio` (test builds only)
    // replaces the microphone with injected files and records the downlink.
    AsyncFunction("callStart") { attemptId: String, offer: String, testAudio: Boolean, headsetMicrophone: String?, promise: Promise ->
      val lines = offer.lines()
      if (offer.toByteArray().size > 98304 || !offer.startsWith("v=0") ||
          lines.count { it.startsWith("m=audio ") } != 1 ||
          lines.any { it.startsWith("m=") && !it.startsWith("m=audio ") }) {
        promise.reject("invalid-offer", "The Host sent an invalid call offer.", null)
        return@AsyncFunction
      }
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("native-unavailable", "The call could not start on this phone.", null)
        return@AsyncFunction
      }
      if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        promise.reject("microphone-denied", "Microphone access is off for this app.", null)
        return@AsyncFunction
      }
      call?.close { }
      call = null
      lateinit var attempt: CallAttempt
      attempt = CallAttempt(attemptId, offer, testAudio, context,
        onState = { state, code ->
          if (call?.id == attemptId) {
            val body = mutableMapOf<String, Any?>("attemptId" to attemptId, "state" to state)
            if (code != null) body["code"] = code
            sendEvent("onCallState", body)
          }
        },
        onTap = { kind, detail ->
          if (call?.id == attemptId) sendEvent("onCallTap", detail + mapOf("attemptId" to attemptId, "kind" to kind))
        },
        onAudio = { route -> audioEvent(attempt, mapOf("route" to route)) },
        onInterrupt = { interrupted ->
          audioEvent(attempt, buildMap {
            if (!interrupted) put("resumed", true)
            attempt.audioState()?.let { put("route", it) }
          })
        })
      if (!attempt.beginAudio(headsetMicrophone)) {
        attempt.close { }
        promise.reject("audio-session", "The phone's audio could not start for a call.", null)
        return@AsyncFunction
      }
      call = attempt
      attempt.start { result ->
        result.fold(
          onSuccess = { promise.resolve(it) },
          onFailure = {
            promise.reject((it as? CallAttempt.CallError)?.code ?: "signal-failed",
              "The call could not connect on this phone.", null)
          })
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("callAudioState") { attemptId: String ->
      call?.takeIf { it.id == attemptId }?.audioState()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("callAudioMode") { attemptId: String, music: Boolean ->
      call?.takeIf { it.id == attemptId }?.setAudioMode(music)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("callAudio") { attemptId: String, output: String, microphone: String ->
      call?.takeIf { it.id == attemptId }?.chooseAudio(output, microphone)
    }.runOnQueue(Queues.MAIN)

    Function("callMute") { attemptId: String, muted: Boolean ->
      val current = call
      if (current != null && current.id == attemptId) current.mute(muted)
    }

    // Test builds: queue a 16-bit WAV file into the uplink in place of the microphone.
    AsyncFunction("callInject") { attemptId: String, path: String ->
      val current = call
      if (current == null || current.id != attemptId || current.tap == null) return@AsyncFunction false
      val file = File(if (path.startsWith("file://")) android.net.Uri.parse(path).path ?: "" else path)
      val wav = runCatching { readWav(file.readBytes()) }.getOrNull() ?: return@AsyncFunction false
      current.inject(wav.first, wav.second)
    }

    // Ends the call; resolves with the downlink recording path when a test build made one.
    AsyncFunction("callStop") { attemptId: String, promise: Promise ->
      val current = call
      if (current == null || current.id != attemptId) { promise.resolve(null); return@AsyncFunction }
      call = null
      current.close { recording -> promise.resolve(recording) }
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersBackground {
      foreground = false
      // Native lifecycle is authoritative even while the JS thread is suspended.
      stopViews("background")
      // The call notification's service keeps the call (ADR-0305) and shows the bubble
      // over other apps when allowed. Without the service, leaving the app ends the call;
      // a live camera-permission dialog is not leaving it.
      main.post {
        if (call != null && !CallService.keeping && !CallCamera.askingPermission) endCall("background")
      }
    }
    OnActivityEntersForeground {
      foreground = true
      call?.regainAudio()
      synchronized(views) { views.toList() }.forEach { it.setAppForeground(true) }
    }
    OnDestroy {
      stopViews("disposed"); views.clear()
      // The JavaScript side is gone with the module; only native resources need releasing.
      main.post {
        endCall(null)
        context()?.let { CallService.end(it) }
        CallService.actions = null
        CallService.changed = null
        application?.unregisterActivityLifecycleCallbacks(visibility)
        application = null
      }
    }
    View(LocalComputerVideoView::class) {
      Events("onDescription", "onMediaState", "onPresentation")
      Prop("attemptId") { view: LocalComputerVideoView, value: String -> view.attemptId = value }
      Prop("offer") { view: LocalComputerVideoView, value: String -> view.offer = value }
      Prop("enabled") { view: LocalComputerVideoView, value: Boolean -> view.mediaEnabled = value }
      OnViewDidUpdateProps { view: LocalComputerVideoView ->
        views.add(view)
        view.setAppForeground(foreground)
        view.sync()
      }
    }
  }
}
