package expo.modules.localcomputervideo

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.AudioTrackSink
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.audio.AudioProcessingOptions
import org.webrtc.audio.JavaAudioDeviceModule
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One phone-side Bot call: answers the Host's single audio offer with the microphone.
 * The microphone records through the voice-communication source with the platform's
 * echo canceller and noise suppressor where the phone has them, and WebRTC's own echo
 * cancellation on top, so the Bot's reply on the loudspeaker is not heard back as the
 * user's speech. The Host owns VAD, ASR and the call state; this peer only carries
 * audio. Nothing is stored, except the downlink recording a test build asks for.
 */
class CallAttempt(
  val id: String,
  private val offer: String,
  testAudio: Boolean,
  private val context: Context,
  private val onState: (String, String?) -> Unit,
  onTap: (String, Map<String, Any?>) -> Unit,
) {
  class CallError(val code: String) : Exception(code)

  private val main = Handler(Looper.getMainLooper())
  // Signaling and native resources stay on one thread; WebRTC owns its audio threads.
  private val worker = Executors.newSingleThreadScheduledExecutor { job ->
    Thread(job, "BotCallPeer").apply { isDaemon = true }
  }
  private val closed = AtomicBoolean(false)
  val tap: CallAudioTap? = if (testAudio) CallAudioTap(SystemClock.elapsedRealtime(), context, onTap) else null
  private val route = CallAudioRoute(context)
  private var adm: JavaAudioDeviceModule? = null
  private var factory: PeerConnectionFactory? = null
  private var peer: PeerConnection? = null
  private var source: AudioSource? = null
  private var track: AudioTrack? = null
  private var remoteTrack: AudioTrack? = null
  private var answered: ((Result<String>) -> Unit)? = null
  private var settleScheduled = false
  private var sampling = false

  private fun enqueue(delayMs: Long = 0, action: () -> Unit) {
    if (closed.get()) return
    val job = Runnable {
      if (closed.get()) return@Runnable
      try {
        action()
      } catch (_: Exception) {
        finish(Result.failure(CallError("native-media-failed")))
        state("failed", "native-media-failed")
      } catch (_: LinkageError) {
        finish(Result.failure(CallError("native-unavailable")))
      }
    }
    try {
      if (delayMs > 0) worker.schedule(job, delayMs, TimeUnit.MILLISECONDS) else worker.execute(job)
    } catch (_: RejectedExecutionException) {
      // The attempt closed between the check and the submit.
    }
  }

  /** Takes audio focus and routes the call to a headset, or else the loudspeaker. */
  fun beginAudio(): Boolean = route.begin()

  fun start(completion: (Result<String>) -> Unit) {
    answered = completion
    enqueue {
      PeerConnectionFactory.initialize(
        PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions())
      val module = JavaAudioDeviceModule.builder(context)
        .setUseHardwareAcousticEchoCanceler(JavaAudioDeviceModule.isBuiltInAcousticEchoCancelerSupported())
        .setUseHardwareNoiseSuppressor(JavaAudioDeviceModule.isBuiltInNoiseSuppressorSupported())
        .setAudioAttributes(CallAudioRoute.attributes)
        .setAudioRecordErrorCallback(object : JavaAudioDeviceModule.AudioRecordErrorCallback {
          override fun onWebRtcAudioRecordInitError(message: String) = state("failed", "microphone-failed")
          override fun onWebRtcAudioRecordStartError(code: JavaAudioDeviceModule.AudioRecordStartErrorCode, message: String) =
            state("failed", "microphone-failed")
          override fun onWebRtcAudioRecordError(message: String) = state("failed", "microphone-failed")
        })
        .setAudioTrackErrorCallback(object : JavaAudioDeviceModule.AudioTrackErrorCallback {
          override fun onWebRtcAudioTrackInitError(message: String) = state("failed", "speaker-failed")
          override fun onWebRtcAudioTrackStartError(code: JavaAudioDeviceModule.AudioTrackStartErrorCode, message: String) =
            state("failed", "speaker-failed")
          override fun onWebRtcAudioTrackError(message: String) = state("failed", "speaker-failed")
        })
        // A test build replaces each recorded buffer with injected audio before WebRTC reads it.
        .apply { tap?.let { setAudioBufferCallback(it.capture) } }
        .createAudioDeviceModule()
      adm = module
      val built = PeerConnectionFactory.builder().setAudioDeviceModule(module).createPeerConnectionFactory()
      factory = built
      val config = PeerConnection.RTCConfiguration(emptyList()).apply {
        sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
        rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
        continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE
      }
      val connection = built.createPeerConnection(config, observer)
        ?: throw IllegalStateException("peer-unavailable")
      peer = connection
      val microphone = built.createAudioSource(MediaConstraints()).also { source = it }
      val local = built.createAudioTrack("call-mic", microphone)
      // Echo cancellation, noise suppression and gain control: platform where the phone
      // offers them, WebRTC's software processing otherwise.
      val applied = local.setAudioProcessingOptions(AudioProcessingOptions.communication())
      tap?.note("processing-options", mapOf("code" to applied.code.name, "message" to applied.message))
      track = local
      connection.setRemoteDescription(sdp(onSet = {
        enqueue {
          if (connection.addTrack(local, listOf("call")) == null) {
            finish(Result.failure(CallError("signal-failed"))); return@enqueue
          }
          connection.createAnswer(sdp(onCreate = { description ->
            enqueue {
              connection.setLocalDescription(sdp(onSet = { enqueue { answerIfReady(force = false) } }), description)
            }
          }), MediaConstraints())
        }
      }), SessionDescription(SessionDescription.Type.OFFER, offer))
      // A phone with no route to the Host never completes gathering: answer with what
      // exists after a short settle, and give up after eight seconds.
      enqueue(8_000) { answerIfReady(force = true, timeout = true) }
    }
  }

  private val observer = object : PeerConnection.Observer {
    override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
    override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
      when (state) {
        PeerConnection.IceConnectionState.CONNECTED, PeerConnection.IceConnectionState.COMPLETED -> {
          state("connected")
          enqueue {
            noteProcessing()
            if (tap != null && !sampling) { sampling = true; samplePerf() }
          }
        }
        PeerConnection.IceConnectionState.FAILED, PeerConnection.IceConnectionState.CLOSED ->
          state("failed", "connection-lost")
        else -> Unit
      }
    }
    override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
      enqueue { answerIfReady(force = false) }
    }
    override fun onIceCandidate(candidate: IceCandidate) {
      enqueue {
        if (settleScheduled) return@enqueue
        settleScheduled = true
        enqueue(1_500) { answerIfReady(force = true) }
      }
    }
    override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) = Unit
    override fun onAddStream(stream: MediaStream) = Unit
    override fun onRemoveStream(stream: MediaStream) = Unit
    override fun onDataChannel(channel: DataChannel) {
      channel.close()
      state("failed", "unexpected-data-channel")
    }
    override fun onRenegotiationNeeded() = Unit
    override fun onTrack(transceiver: RtpTransceiver) {
      // The Bot's voice plays through the voice-communication stream; a test build also records it.
      val incoming = transceiver.receiver.track()
      if (incoming !is AudioTrack) { state("failed", "unexpected-track"); return }
      enqueue {
        if (remoteTrack != null) return@enqueue
        remoteTrack = incoming
        tap?.let { incoming.addSink(it.render) }
      }
    }
  }

  private fun sdp(onSet: () -> Unit = {}, onCreate: (SessionDescription) -> Unit = {}) = object : SdpObserver {
    override fun onSetSuccess() { if (!closed.get()) onSet() }
    override fun onCreateSuccess(description: SessionDescription) { if (!closed.get()) onCreate(description) }
    override fun onSetFailure(error: String) { enqueue { finish(Result.failure(CallError("signal-failed"))) } }
    override fun onCreateFailure(error: String) { enqueue { finish(Result.failure(CallError("signal-failed"))) } }
  }

  private fun noteProcessing() {
    val tap = tap ?: return
    val processing = factory?.audioProcessingState ?: return
    val platform = adm?.platformAudioProcessingState
    tap.note("processing-state", mapOf(
      "apm" to processing.hasAudioProcessingModule,
      "aec" to processing.echoCancellation.effective.name,
      "ns" to processing.noiseSuppression.effective.name,
      "agc" to processing.autoGainControl.effective.name,
      "hpf" to processing.highPassFilter.effective.name,
      "platformAec" to platform?.echoCancellation?.isActive,
      "platformNs" to platform?.noiseSuppression?.isActive,
    ))
  }

  /**
   * Test builds sample media counters, process CPU time, the thermal status and the
   * battery current every five seconds into the call report, so a before/after run can
   * compare phone cost.
   */
  private fun samplePerf() {
    val tap = tap ?: return
    val connection = peer ?: return
    connection.getStats { report ->
      val detail = mutableMapOf<String, Any?>()
      fun copy(members: Map<String, Any>, key: String, out: String = key, scale: Double = 1.0) {
        (members[key] as? Number)?.let { detail[out] = it.toDouble() * scale }
      }
      for (stats in report.statsMap.values) {
        val members = stats.members
        val audio = members["kind"] == "audio"
        when {
          stats.type == "inbound-rtp" && audio -> {
            listOf("packetsReceived", "bytesReceived", "packetsLost", "concealedSamples", "totalSamplesReceived")
              .forEach { copy(members, it) }
            copy(members, "jitter", "jitterMs", 1000.0)
          }
          stats.type == "outbound-rtp" && audio -> { copy(members, "packetsSent"); copy(members, "bytesSent") }
          stats.type == "candidate-pair" && members["nominated"] == true ->
            copy(members, "currentRoundTripTime", "rttMs", 1000.0)
        }
      }
      detail["cpuMs"] = Process.getElapsedCpuTime().toDouble()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        (context.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.let { detail["thermal"] = it.currentThermalStatus }
      }
      (context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager)?.let {
        val level = it.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (level != Int.MIN_VALUE) detail["batteryPct"] = level
        val current = it.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
        if (current != Int.MIN_VALUE) detail["batteryCurrentUa"] = current
      }
      tap.note("perf", detail)
    }
    enqueue(5_000) { samplePerf() }
  }

  private fun finish(result: Result<String>) {
    val completion = answered ?: return
    answered = null
    main.post { completion(result) }
  }

  private fun answerIfReady(force: Boolean, timeout: Boolean = false) {
    val connection = peer
    val description = connection?.localDescription
    if (answered == null) return
    if (connection == null || description == null) {
      if (timeout) finish(Result.failure(CallError("ice-timeout")))
      return
    }
    val hasCandidate = description.description.contains("a=candidate:")
    if (connection.iceGatheringState() != PeerConnection.IceGatheringState.COMPLETE && !(force && hasCandidate)) {
      if (timeout) finish(Result.failure(CallError("ice-timeout")))
      return
    }
    if (description.description.toByteArray().size > 98_304) {
      finish(Result.failure(CallError("signal-too-large"))); return
    }
    finish(Result.success(description.description))
  }

  fun mute(muted: Boolean) {
    enqueue {
      track?.setEnabled(!muted)
      tap?.capture?.setMuted(muted)
    }
  }

  fun inject(samples: FloatArray, rate: Double): Boolean {
    val tap = tap ?: return false
    tap.capture.enqueue(samples, rate)
    return true
  }

  /** Restores the audio route at once, then releases the peer and audio device off the UI thread. */
  fun close(done: (String?) -> Unit) {
    if (!closed.compareAndSet(false, true)) { done(null); return }
    val completion = answered
    answered = null
    if (completion != null) main.post { completion(Result.failure(CallError("closed"))) }
    // Restore mode, device and focus now (callers are on the main thread), so a replacement
    // call that starts before this teardown finishes records the phone's real pre-call state.
    route.end()
    worker.shutdownNow()
    Thread({
      worker.awaitTermination(3, TimeUnit.SECONDS)
      listOf<() -> Unit>(
        { track?.setEnabled(false) },
        { tap?.let { remoteTrack?.removeSink(it.render) } },
        { peer?.close() }, { peer?.dispose() },
        { source?.dispose() },
        { factory?.dispose() }, { adm?.release() },
      ).forEach { release -> runCatching { release() } }
      peer = null; track = null; remoteTrack = null; source = null; factory = null; adm = null
      val recording = tap?.render?.writeRecording()
      main.post { done(recording) }
    }, "BotCallClose").apply { isDaemon = true }.start()
  }

  private fun state(value: String, code: String? = null) {
    main.post { if (!closed.get()) onState(value, code) }
  }
}

/** Audio focus and routing for one call; restores what the phone had before. */
class CallAudioRoute(context: Context) {
  companion object {
    val attributes: AudioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
    private val headsets = setOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, 26 /* TYPE_BLE_HEADSET */)
  }

  private val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var previousMode = AudioManager.MODE_NORMAL
  private var previousSpeaker = false
  private var focus: AudioFocusRequest? = null
  private val legacyFocus = AudioManager.OnAudioFocusChangeListener { }
  private var active = false

  fun begin(): Boolean {
    if (active) return true
    previousMode = manager.mode
    @Suppress("DEPRECATION")
    previousSpeaker = manager.isSpeakerphoneOn
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes)
        .setOnAudioFocusChangeListener { }
        .build()
      focus = request
      manager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      manager.requestAudioFocus(legacyFocus, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
    if (granted == AudioManager.AUDIOFOCUS_REQUEST_FAILED) { focus = null; return false }
    active = true
    manager.mode = AudioManager.MODE_IN_COMMUNICATION
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val devices = manager.availableCommunicationDevices
      val preferred = devices.firstOrNull { it.type in headsets }
        ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
      if (preferred != null) manager.setCommunicationDevice(preferred)
    } else {
      val wired = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any {
        it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
          it.type == AudioDeviceInfo.TYPE_USB_HEADSET
      }
      @Suppress("DEPRECATION")
      manager.isSpeakerphoneOn = !wired
    }
    return true
  }

  fun end() {
    if (!active) return
    active = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) manager.clearCommunicationDevice()
    else @Suppress("DEPRECATION") { manager.isSpeakerphoneOn = previousSpeaker }
    manager.mode = previousMode
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) focus?.let { manager.abandonAudioFocusRequest(it) }
    else @Suppress("DEPRECATION") manager.abandonAudioFocus(legacyFocus)
    focus = null
  }
}

/**
 * Test-build audio hooks. The capture side replaces the microphone with injected
 * audio (silence when the queue is empty); the render side records what the Bot
 * sends down and reports when its speech starts and stops.
 */
class CallAudioTap(
  private val started: Long,
  context: Context,
  private val emit: (String, Map<String, Any?>) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())
  private fun elapsed() = (SystemClock.elapsedRealtime() - started).toInt()

  fun note(kind: String, detail: Map<String, Any?> = emptyMap()) {
    val ms = elapsed()
    main.post { emit(kind, detail + ("ms" to ms)) }
  }

  val capture = Capture()
  val render = Render(context.cacheDir)

  inner class Capture : JavaAudioDeviceModule.AudioBufferCallback {
    private val lock = Any()
    private var source = FloatArray(0)
    private var sourceRate = 16_000.0
    private var position = 0.0
    private var muted = false
    private var reported = false

    fun setMuted(value: Boolean) = synchronized(lock) {
      muted = value
      if (value) { source = FloatArray(0); position = 0.0 }
    }

    /** Queues samples (S16 range) at their own rate; they play after earlier ones. */
    fun enqueue(samples: FloatArray, rate: Double) {
      synchronized(lock) {
        if (muted) {
          note("inject-dropped", mapOf("samples" to samples.size, "reason" to "muted"))
          return
        }
        if (position >= source.size) { source = FloatArray(0); position = 0.0 }
        // One queue holds one rate; resample later items onto it.
        if (source.isEmpty()) { sourceRate = rate; source = samples }
        else source += resample(samples, rate, sourceRate)
      }
      note("inject-queued", mapOf("samples" to samples.size, "rate" to rate))
    }

    override fun onBuffer(
      buffer: ByteBuffer, audioFormat: Int, channelCount: Int, sampleRate: Int, bytesRead: Int, captureTimeNs: Long,
    ): Long {
      if (audioFormat != AudioFormat.ENCODING_PCM_16BIT || channelCount <= 0 || sampleRate <= 0) return captureTimeNs
      synchronized(lock) {
        if (!reported) {
          reported = true
          note("capture-first-frame", mapOf("channels" to channelCount, "frames" to bytesRead / (2 * channelCount), "rate" to sampleRate))
        }
        val out = buffer.duplicate().order(ByteOrder.nativeOrder())
        val frames = bytesRead / (2 * channelCount)
        val step = sourceRate / sampleRate
        var cursor = position
        for (frame in 0 until frames) {
          val index = cursor.toInt()
          val value = if (index + 1 < source.size) {
            val fraction = (cursor - index).toFloat()
            source[index] * (1 - fraction) + source[index + 1] * fraction
          } else 0f
          val sample = value.coerceIn(-32768f, 32767f).toInt().toShort()
          for (channel in 0 until channelCount) out.putShort((frame * channelCount + channel) * 2, sample)
          cursor += step
        }
        position = cursor
      }
      return captureTimeNs
    }
  }

  inner class Render(private val folder: File) : AudioTrackSink {
    private val lock = Any()
    private var samples = ShortArray(48_000)
    private var count = 0
    private var rate = 48_000
    private var speaking = false
    private var quietMs = 0
    /** Five minutes at 48 kHz is the most a test call records. */
    private val limit = 48_000 * 300

    override fun onData(
      audioData: ByteBuffer, bitsPerSample: Int, sampleRate: Int, numberOfChannels: Int, numberOfFrames: Int,
      absoluteCaptureTimestampMs: Long,
    ) {
      if (bitsPerSample != 16 || numberOfFrames <= 0 || numberOfChannels <= 0) return
      val data = audioData.duplicate().order(ByteOrder.nativeOrder())
      val base = data.position()
      var energy = 0.0
      synchronized(lock) {
        rate = sampleRate
        for (frame in 0 until numberOfFrames) {
          val value = data.getShort(base + frame * numberOfChannels * 2)
          energy += value.toDouble() * value
          if (count < limit) {
            if (count == samples.size) samples = samples.copyOf(minOf(limit, samples.size * 2))
            samples[count++] = value
          }
        }
      }
      val rms = kotlin.math.sqrt(energy / numberOfFrames)
      // About -40 dBFS starts speech; half a second of quiet ends it.
      if (rms > 330) {
        quietMs = 0
        if (!speaking) { speaking = true; note("downlink-start") }
      } else if (speaking) {
        quietMs += numberOfFrames * 1000 / maxOf(1, sampleRate)
        if (quietMs >= 500) { speaking = false; note("downlink-end") }
      }
    }

    /** Writes the downlink as a 16-bit mono WAV in the cache folder and returns its path. */
    fun writeRecording(): String? {
      val pcm: ShortArray
      val sampleRate: Int
      synchronized(lock) { pcm = samples.copyOf(count); sampleRate = rate; samples = ShortArray(0); count = 0 }
      if (pcm.isEmpty()) return null
      val file = File(folder, "call-downlink-${System.currentTimeMillis() / 1000}.wav")
      val bytes = ByteBuffer.allocate(44 + pcm.size * 2).order(ByteOrder.LITTLE_ENDIAN)
      bytes.put("RIFF".toByteArray()).putInt(36 + pcm.size * 2).put("WAVEfmt ".toByteArray())
      bytes.putInt(16).putShort(1).putShort(1).putInt(sampleRate).putInt(sampleRate * 2).putShort(2).putShort(16)
      bytes.put("data".toByteArray()).putInt(pcm.size * 2)
      pcm.forEach { bytes.putShort(it) }
      return runCatching { file.writeBytes(bytes.array()); file.absolutePath }.getOrNull()
    }
  }
}

fun resample(samples: FloatArray, from: Double, to: Double): FloatArray {
  if (from == to || samples.isEmpty()) return samples
  val count = (samples.size * to / from).toInt()
  val step = from / to
  return FloatArray(count) { index ->
    val position = index * step
    val base = minOf(position.toInt(), samples.size - 1)
    val next = minOf(base + 1, samples.size - 1)
    val fraction = (position - position.toInt()).toFloat()
    samples[base] * (1 - fraction) + samples[next] * fraction
  }
}

/** Reads a 16-bit PCM WAV as mono samples in S16 range, with its sample rate. */
fun readWav(bytes: ByteArray): Pair<FloatArray, Double>? {
  if (bytes.size < 44 || String(bytes, 0, 4, Charsets.US_ASCII) != "RIFF" ||
    String(bytes, 8, 4, Charsets.US_ASCII) != "WAVE") return null
  fun u16(at: Int) = (bytes[at].toInt() and 0xff) or ((bytes[at + 1].toInt() and 0xff) shl 8)
  fun u32(at: Int) = u16(at) or (u16(at + 2) shl 16)
  var offset = 12
  var channels = 0
  var rate = 0
  var bits = 0
  while (offset + 8 <= bytes.size) {
    val name = String(bytes, offset, 4, Charsets.US_ASCII)
    val size = u32(offset + 4)
    val body = offset + 8
    if (size < 0) return null
    if (name == "fmt " && body + 16 <= bytes.size) {
      if (u16(body) != 1) return null
      channels = u16(body + 2); rate = u32(body + 4); bits = u16(body + 14)
    } else if (name == "data") {
      if (bits != 16 || channels <= 0 || rate <= 0) return null
      val end = minOf(bytes.size.toLong(), body.toLong() + size).toInt()
      val frames = (end - body) / (2 * channels)
      val out = FloatArray(frames) { frame ->
        var sum = 0
        for (channel in 0 until channels) {
          val at = body + (frame * channels + channel) * 2
          sum += u16(at).toShort().toInt()
        }
        (sum / channels).toFloat()
      }
      return out to rate.toDouble()
    }
    offset = body + size + (size and 1)
  }
  return null
}
