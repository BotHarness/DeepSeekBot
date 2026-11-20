import Foundation
import WebRTC

final class DirectChannel: NSObject, RTCPeerConnectionDelegate, RTCDataChannelDelegate {
  private static let ssl: Void = { RTCInitializeSSL() }()
  static let label = "botharness-direct-v1"
  let id: String
  private let queue = DispatchQueue(label: "botharness.direct.peer")
  private let onEvent: (String, [String: Any]) -> Void
  private var factory: RTCPeerConnectionFactory?
  private var peer: RTCPeerConnection?
  private var channel: RTCDataChannel?
  private var gathered: (() -> Void)?
  private var closed = false

  init(id: String, onEvent: @escaping (String, [String: Any]) -> Void) {
    self.id = id
    self.onEvent = onEvent
    super.init()
  }

  func offer(iceServers: [String], done: @escaping (String?, String?) -> Void) {
    queue.async { [self] in
      _ = Self.ssl
      factory = RTCPeerConnectionFactory()
      let config = RTCConfiguration()
      config.iceServers = iceServers.isEmpty ? [] : [RTCIceServer(urlStrings: iceServers)]
      config.sdpSemantics = .unifiedPlan
      config.bundlePolicy = .maxBundle
      let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
      guard let peer = factory?.peerConnection(with: config, constraints: constraints, delegate: self) else {
        done(nil, "native-unavailable"); return
      }
      self.peer = peer
      let options = RTCDataChannelConfiguration()
      options.isOrdered = true
      guard let channel = peer.dataChannel(forLabel: Self.label, configuration: options) else {
        done(nil, "native-unavailable"); return
      }
      channel.delegate = self
      self.channel = channel
      var finished = false
      let finish: () -> Void = { [weak self] in
        guard let self else { return }
        self.queue.async {
          guard !finished else { return }
          finished = true
          self.gathered = nil
          if let sdp = self.peer?.localDescription?.sdp { done(sdp, nil) } else { done(nil, "offer-failed") }
        }
      }
      gathered = finish
      peer.offer(for: constraints) { description, error in
        guard error == nil, let description else { done(nil, "offer-failed"); return }
        peer.setLocalDescription(description) { error in
          if error != nil { done(nil, "offer-failed"); return }
          if peer.iceGatheringState == .complete { finish() }
          self.queue.asyncAfter(deadline: .now() + 3) { finish() }
        }
      }
    }
  }

  func answer(_ sdp: String, done: @escaping (String?) -> Void) {
    queue.async { [self] in
      guard let peer, !closed else { done("closed"); return }
      peer.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: sdp)) { error in
        done(error == nil ? nil : "answer-failed")
      }
    }
  }

  func send(_ text: String) -> Bool {
    guard let channel, channel.readyState == .open, let data = text.data(using: .utf8) else { return false }
    return channel.sendData(RTCDataBuffer(data: data, isBinary: false))
  }

  func close() {
    queue.async { [self] in
      guard !closed else { return }
      closed = true
      channel?.delegate = nil
      channel?.close()
      peer?.close()
      channel = nil
      peer = nil
      factory = nil
      onEvent("closed", [:])
    }
  }

  func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
    switch dataChannel.readyState {
    case .open: onEvent("open", [:])
    case .closed: close()
    default: break
    }
  }

  func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
    guard !buffer.isBinary, buffer.data.count <= 70_000, let text = String(data: buffer.data, encoding: .utf8) else {
      close(); return
    }
    onEvent("message", ["text": text])
  }

  func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
    if newState == .complete { gathered?() }
  }
  func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
    if newState == .failed || newState == .closed { close() }
  }
  func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
  func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
