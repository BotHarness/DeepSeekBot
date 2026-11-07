package expo.modules.localcomputervideo

import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
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

  private fun keepScreenOn(on: Boolean) {
    val window = appContext.currentActivity?.window ?: return
    if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  /** Calls are foreground only (ADR-0284): leaving the app or locking the phone ends one. */
  private fun endCall(code: String?) {
    val current = call ?: return
    call = null
    keepScreenOn(false)
    if (code != null) sendEvent("onCallState", mapOf("attemptId" to current.id, "state" to "closed", "code" to code))
    current.close { }
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
    Events("onCallState", "onCallTap", "onCallAudio")

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
      val attempt = CallAttempt(attemptId, offer, testAudio, context,
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
        onAudio = { route ->
          if (call?.id == attemptId) sendEvent("onCallAudio", mapOf("attemptId" to attemptId, "route" to route))
        })
      if (!attempt.beginAudio(headsetMicrophone)) {
        attempt.close { }
        promise.reject("audio-session", "The phone's audio could not start for a call.", null)
        return@AsyncFunction
      }
      call = attempt
      // A call keeps the screen on; the call ends when the app leaves the foreground.
      keepScreenOn(true)
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
      keepScreenOn(false)
      current.close { recording -> promise.resolve(recording) }
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersBackground {
      foreground = false
      // Native lifecycle is authoritative even while the JS thread is suspended.
      stopViews("background")
      // Calls are foreground only: leaving the app or locking the phone ends the call.
      // A live camera-permission dialog is the one exception: the user is still in the
      // call and the dialog returns at once. #3423 removes this temporary bridge.
      if (!CallCamera.askingPermission) main.post { endCall("background") }
    }
    OnActivityEntersForeground {
      foreground = true
      synchronized(views) { views.toList() }.forEach { it.setAppForeground(true) }
    }
    OnDestroy {
      stopViews("disposed"); views.clear()
      // The JavaScript side is gone with the module; only native resources need releasing.
      main.post { endCall(null) }
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
