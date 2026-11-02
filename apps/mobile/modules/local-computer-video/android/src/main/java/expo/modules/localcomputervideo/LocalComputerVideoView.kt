package expo.modules.localcomputervideo

import android.app.KeyguardManager
import android.content.Context
import android.graphics.SurfaceTexture
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.TextureView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.webrtc.*
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.Semaphore
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/** One mounted view owns one receive-only peer. No media bytes cross the React bridge. */
class LocalComputerVideoView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  companion object {
    // A retiring decoder/renderer must finish before a replacement owns native resources.
    // A stuck native teardown therefore refuses new peers instead of accumulating threads.
    private val nativeSlot = Semaphore(1)
  }
  val onDescription by EventDispatcher()
  val onMediaState by EventDispatcher()
  val onPresentation by EventDispatcher()
  var attemptId = ""
  var offer = ""
  var mediaEnabled = false
  private val main = Handler(Looper.getMainLooper())
  private val texture = TextureView(context)
  @Volatile private var current: Attempt? = null
  private var retiring: Attempt? = null
  private var suspendedAttempt: String? = null
  private var appForeground = true

  init {
    addView(texture, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    texture.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
      override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) { sync() }
      override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) = Unit
      override fun onSurfaceTextureUpdated(surface: SurfaceTexture) { current?.presented() }
      override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        // The renderer may still be releasing asynchronously; it owns final texture disposal.
        val previous = current ?: retiring
        suspendMedia("surface-lost")
        if (previous != null) previous.releaseSurface(surface) else surface.release()
        return false
      }
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    texture.layout(0, 0, right - left, bottom - top)
  }

  override fun onDetachedFromWindow() {
    suspendMedia("detached")
    super.onDetachedFromWindow()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    sync()
  }

  fun setAppForeground(value: Boolean) {
    appForeground = value
    if (!value) {
      // Also fence an attempt waiting for its predecessor's asynchronous cleanup.
      suspendedAttempt = attemptId
      suspendMedia("background")
      suspendedAttempt = attemptId
    }
    // Foreground alone never restarts the previous attempt.
  }

  fun suspendMedia(reason: String) {
    suspendedAttempt = current?.id ?: suspendedAttempt
    val previous = current ?: return
    current = null
    retiring = previous
    texture.alpha = 0f
    previous.close()
    onMediaState(mapOf("attemptId" to previous.id, "state" to "closed", "code" to reason))
  }

  fun sync() {
    if (!appForeground || !isAttachedToWindow) return
    if (!mediaEnabled) { suspendMedia("disabled"); return }
    if (attemptId.isEmpty() || offer.isEmpty() || !texture.isAvailable) return
    if (attemptId == suspendedAttempt || current?.id == attemptId) return
    val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (keyguard.isKeyguardLocked) { suspendedAttempt = attemptId; return }
    suspendMedia("replaced")
    // EglRenderer releases its producer before a replacement attaches to this SurfaceTexture.
    if (retiring != null) return
    if (offer.length > 98304 || !offer.startsWith("v=0") ||
        offer.lineSequence().count { it.startsWith("m=video ") } != 1 ||
        offer.lineSequence().any { it.startsWith("m=audio ") || it.startsWith("m=application ") }) {
      onMediaState(mapOf("attemptId" to attemptId, "state" to "failed", "code" to "invalid-offer"))
      return
    }
    val attempt = Attempt(attemptId, offer, texture.surfaceTexture!!)
    current = attempt
    texture.alpha = 0f
    attempt.start()
  }

  private inner class Attempt(val id: String, private val remoteOffer: String, private val surface: SurfaceTexture) {
    private val closed = AtomicBoolean(false)
    // Bounded native work, separate from the JS/UI threads. WebRTC owns codec/render threads.
    private val worker = ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
      ArrayBlockingQueue<Runnable>(16), { job -> Thread(job, "LocalVideoPeer").apply { isDaemon = true } })
    private var factory: PeerConnectionFactory? = null
    private var peer: PeerConnection? = null
    private var egl: EglBase? = null
    private var renderer: EglRenderer? = null
    private var track: VideoTrack? = null
    private var answerSent = false
    private val presentationCount = AtomicLong(0)
    private val rendered = AtomicLong(0)
    private val lastRenderedTimestamp = AtomicLong(Long.MIN_VALUE)
    private val lastPresented = AtomicLong(0)
    private val received = AtomicLong(0)
    private var consumedRender = 0L
    private var ownsNativeSlot = false
    @Volatile private var resourcesDisposed = false
    private val destroyedSurface = AtomicReference<SurfaceTexture?>(null)
    private var previousPresented = 0L
    private var previousAt = SystemClock.elapsedRealtime()
    private val deadline = Runnable { fail("negotiation-timeout") }
    private val sample = object : Runnable {
      override fun run() {
        if (!active()) return
        val now = SystemClock.elapsedRealtime()
        val total = presentationCount.get()
        onPresentation(mapOf("attemptId" to id, "presentedFrames" to total.toDouble(),
          "receivedFrames" to received.get().toDouble(), "renderedFrames" to rendered.get().toDouble(),
          "sampleMs" to (now - previousAt).toDouble(),
          "presentedFps" to (total - previousPresented) * 1000.0 / (now - previousAt).coerceAtLeast(1),
          "lastPresentedAgoMs" to if (lastPresented.get() == 0L) -1.0 else (now - lastPresented.get()).toDouble()))
        previousPresented = total
        previousAt = now
        main.postDelayed(this, 1000)
      }
    }
    private val sink = VideoSink { frame ->
      if (active()) { received.incrementAndGet(); renderer?.onFrame(frame) }
    }

    private fun active() = !closed.get() && current === this
    private fun enqueue(action: () -> Unit) {
      if (closed.get()) return
      try { worker.execute { if (!closed.get()) try { action() }
        catch (_: Exception) { fail("native-media-failed") }
        catch (_: LinkageError) { fail("native-module-unavailable") }
      } }
      catch (_: java.util.concurrent.RejectedExecutionException) { fail("native-queue-full") }
    }
    private fun event(state: String, code: String = "") = main.post {
      if (active()) onMediaState(mapOf("attemptId" to id, "state" to state, "code" to code))
    }
    private fun fail(code: String) = main.post {
      if (active()) {
        onMediaState(mapOf("attemptId" to id, "state" to "failed", "code" to code))
        suspendMedia(code)
      }
    }

    fun start() {
      ownsNativeSlot = nativeSlot.tryAcquire()
      if (!ownsNativeSlot) { fail("native-cleanup-pending"); return }
      main.postDelayed(deadline, 20000)
      main.postDelayed(sample, 1000)
      enqueue {
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions())
        val base = EglBase.create().also { egl = it }
        renderer = EglRenderer("LocalComputerVideo").apply {
          init(base.eglBaseContext, EglBase.CONFIG_PLAIN, GlRectDrawer())
          // This callback runs at EGL buffer swap, not decode or signaling completion.
          addRenderListener { timestamp ->
            if (active() && lastRenderedTimestamp.getAndSet(timestamp) != timestamp) rendered.incrementAndGet()
          }
          createEglSurface(surface)
        }
        factory = PeerConnectionFactory.builder()
          .setVideoDecoderFactory(DefaultVideoDecoderFactory(base.eglBaseContext)).createPeerConnectionFactory()
        val config = PeerConnection.RTCConfiguration(emptyList()).apply {
          sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
          bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
          rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
          continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE
        }
        peer = factory!!.createPeerConnection(config, object : PeerConnection.Observer {
          override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
          override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
          override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            if (state == PeerConnection.IceConnectionState.FAILED || state == PeerConnection.IceConnectionState.DISCONNECTED)
              fail("ice-disconnected")
          }
          override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
            when (state) {
              PeerConnection.PeerConnectionState.CONNECTED -> {
                event("connected")
              }
              PeerConnection.PeerConnectionState.FAILED, PeerConnection.PeerConnectionState.DISCONNECTED -> fail("peer-disconnected")
              else -> Unit
            }
          }
          override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) enqueue { answer() }
          }
          override fun onIceCandidate(candidate: IceCandidate) = Unit
          override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) = Unit
          override fun onAddStream(stream: MediaStream) = Unit
          override fun onRemoveStream(stream: MediaStream) = Unit
          override fun onDataChannel(channel: DataChannel) { channel.close(); fail("unexpected-data-channel") }
          override fun onRenegotiationNeeded() = Unit
          override fun onTrack(transceiver: RtpTransceiver) {
            enqueue {
              val incoming = transceiver.receiver.track()
              if (incoming !is VideoTrack || track != null) { fail("unexpected-track"); return@enqueue }
              track = incoming
              incoming.addSink(sink)
            }
          }
        }) ?: throw IllegalStateException("peer-unavailable")
        peer!!.setRemoteDescription(observer(onSet = {
          enqueue {
            peer?.createAnswer(observer(onCreate = { description -> enqueue {
              peer?.setLocalDescription(observer(onSet = {
                enqueue { if (peer?.iceGatheringState() == PeerConnection.IceGatheringState.COMPLETE) answer() }
              }), description)
            } }), MediaConstraints())
          }
        }), SessionDescription(SessionDescription.Type.OFFER, remoteOffer))
      }
    }

    private fun answer() {
      if (answerSent || !active()) return
      val description = peer?.localDescription?.description ?: return
      if (description.length > 98304) { fail("description-too-large"); return }
      answerSent = true
      main.post { if (active()) onDescription(mapOf("attemptId" to id, "sdp" to description)) }
    }

    fun presented() {
      val renderSequence = rendered.get()
      if (!active() || renderSequence <= consumedRender) return
      consumedRender = renderSequence
      texture.alpha = 1f
      // TextureView reports a consumed SurfaceTexture update on the UI thread. Unlike a decode
      // counter or EGL swap this cannot grow while the surface is detached or not being updated.
      presentationCount.incrementAndGet()
      lastPresented.set(SystemClock.elapsedRealtime())
      main.removeCallbacks(deadline)
    }

    private fun observer(onSet: () -> Unit = {}, onCreate: (SessionDescription) -> Unit = {}) = object : SdpObserver {
      override fun onSetSuccess() { if (active()) onSet() }
      override fun onCreateSuccess(description: SessionDescription) { if (active()) onCreate(description) }
      override fun onSetFailure(error: String) { fail("description-refused") }
      override fun onCreateFailure(error: String) { fail("description-failed") }
    }

    fun close() {
      if (!closed.compareAndSet(false, true)) return
      main.removeCallbacks(deadline)
      main.removeCallbacks(sample)
      worker.queue.clear()
      val cleanupDeadline = Runnable {
        if (retiring === this) {
          // JS may be suspended or slow to process the error. Fence the pending replacement
          // here, before notifying it, so late native cleanup cannot restart that attempt.
          suspendedAttempt = attemptId
          onMediaState(mapOf("attemptId" to attemptId,
            "state" to "failed", "code" to "native-cleanup-timeout"))
        }
      }
      main.postDelayed(cleanupDeadline, 3000)
      // Stop the sink immediately via closed; native release never blocks the UI/JS thread.
      worker.execute {
        var released = true
        listOf<() -> Unit>(
          { track?.removeSink(sink) }, { peer?.close() }, { peer?.dispose() },
          { renderer?.release() }, { factory?.dispose() }, { egl?.release() }
        ).forEach { release -> if (runCatching { release() }.isFailure) released = false }
        if (released) {
          resourcesDisposed = true
          destroyedSurface.getAndSet(null)?.release()
          if (ownsNativeSlot) nativeSlot.release()
        }
        main.post {
          main.removeCallbacks(cleanupDeadline)
          if (!released) {
            onMediaState(mapOf("attemptId" to attemptId, "state" to "failed", "code" to "native-cleanup-failed"))
            return@post
          }
          if (retiring === this) {
            retiring = null
            // A new attemptId is required after background; old callbacks cannot revive it.
            sync()
          }
        }
      }
      worker.shutdown()
    }

    fun releaseSurface(surface: SurfaceTexture) {
      // A fresh TextureView surface can be destroyed while an older one is retiring.
      // Only the producer's own surface has to wait for that producer's resource disposal.
      if (surface !== this.surface) { surface.release(); return }
      destroyedSurface.set(surface)
      // Either this call or the cleanup worker claims disposal exactly once. A deadline
      // does not abandon the texture: late successful cleanup still releases it.
      if (resourcesDisposed) destroyedSurface.getAndSet(null)?.release()
    }
  }
}
