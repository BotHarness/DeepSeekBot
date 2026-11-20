package expo.modules.localcomputervideo

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription

class DirectChannel(
  val id: String,
  private val context: Context,
  private val onEvent: (String, Map<String, Any>) -> Unit,
) {
  companion object {
    const val LABEL = "botharness-direct-v1"
  }

  private val thread = HandlerThread("botharness-direct").apply { start() }
  private val handler = Handler(thread.looper)
  private var factory: PeerConnectionFactory? = null
  private var peer: PeerConnection? = null
  private var channel: DataChannel? = null
  private var gathered: (() -> Unit)? = null
  @Volatile private var closed = false

  private abstract class Sdp : SdpObserver {
    override fun onCreateSuccess(description: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String) {}
    override fun onSetFailure(error: String) {}
  }

  private val observer = object : PeerConnection.Observer {
    override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
      if (state == PeerConnection.IceGatheringState.COMPLETE) handler.post { gathered?.invoke() }
    }
    override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
      if (state == PeerConnection.PeerConnectionState.FAILED || state == PeerConnection.PeerConnectionState.CLOSED) close()
    }
    override fun onSignalingChange(state: PeerConnection.SignalingState) {}
    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {}
    override fun onIceConnectionReceivingChange(receiving: Boolean) {}
    override fun onIceCandidate(candidate: IceCandidate) {}
    override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
    override fun onAddStream(stream: MediaStream) {}
    override fun onRemoveStream(stream: MediaStream) {}
    override fun onDataChannel(channel: DataChannel) {}
    override fun onRenegotiationNeeded() {}
    override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {}
  }

  fun offer(iceServers: List<String>, done: (String?, String?) -> Unit) {
    handler.post {
      try {
        PeerConnectionFactory.initialize(
          PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions())
        val built = PeerConnectionFactory.builder().createPeerConnectionFactory()
        factory = built
        val servers = if (iceServers.isEmpty()) emptyList() else listOf(PeerConnection.IceServer.builder(iceServers).createIceServer())
        val config = PeerConnection.RTCConfiguration(servers).apply {
          sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
          bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
          continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE
        }
        val connection = built.createPeerConnection(config, observer) ?: return@post done(null, "native-unavailable")
        peer = connection
        val data = connection.createDataChannel(LABEL, DataChannel.Init().apply { ordered = true })
          ?: return@post done(null, "native-unavailable")
        channel = data
        data.registerObserver(object : DataChannel.Observer {
          override fun onBufferedAmountChange(previous: Long) {}
          override fun onStateChange() {
            when (data.state()) {
              DataChannel.State.OPEN -> onEvent("open", emptyMap())
              DataChannel.State.CLOSED -> close()
              else -> {}
            }
          }
          override fun onMessage(buffer: DataChannel.Buffer) {
            if (buffer.binary || buffer.data.remaining() > 70_000) { close(); return }
            val bytes = ByteArray(buffer.data.remaining())
            buffer.data.get(bytes)
            onEvent("message", mapOf("text" to String(bytes, StandardCharsets.UTF_8)))
          }
        })
        var finished = false
        val finish = {
          if (!finished) {
            finished = true
            gathered = null
            val sdp = peer?.localDescription?.description
            if (sdp != null) done(sdp, null) else done(null, "offer-failed")
          }
        }
        gathered = finish
        connection.createOffer(object : Sdp() {
          override fun onCreateSuccess(description: SessionDescription) {
            connection.setLocalDescription(object : Sdp() {
              override fun onSetSuccess() {
                handler.post { if (connection.iceGatheringState() == PeerConnection.IceGatheringState.COMPLETE) finish() }
                handler.postDelayed({ finish() }, 3000)
              }
              override fun onSetFailure(error: String) = done(null, "offer-failed")
            }, description)
          }
          override fun onCreateFailure(error: String) = done(null, "offer-failed")
        }, MediaConstraints())
      } catch (error: Throwable) {
        done(null, "native-unavailable")
      }
    }
  }

  fun answer(sdp: String, done: (String?) -> Unit) {
    handler.post {
      val connection = peer
      if (connection == null || closed) return@post done("closed")
      connection.setRemoteDescription(object : Sdp() {
        override fun onSetSuccess() = done(null)
        override fun onSetFailure(error: String) = done("answer-failed")
      }, SessionDescription(SessionDescription.Type.ANSWER, sdp))
    }
  }

  fun send(text: String): Boolean {
    val data = channel ?: return false
    if (closed || data.state() != DataChannel.State.OPEN) return false
    return data.send(DataChannel.Buffer(ByteBuffer.wrap(text.toByteArray(StandardCharsets.UTF_8)), false))
  }

  fun close() {
    handler.post {
      if (closed) return@post
      closed = true
      channel?.unregisterObserver()
      channel?.close()
      peer?.close()
      channel?.dispose()
      peer?.dispose()
      factory?.dispose()
      channel = null
      peer = null
      factory = null
      onEvent("closed", emptyMap())
      thread.quitSafely()
    }
  }
}
