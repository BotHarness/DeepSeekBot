import Foundation
import WebRTC

final class VideoAttempt: NSObject, RTCPeerConnectionDelegate {
  // A retiring native peer keeps its permit until close returns. A cleanup timeout cannot
  // allocate a replacement over resources whose teardown is still unproven.
  private static let ssl: Void = { RTCInitializeSSL() }()
  private static let slot = DispatchSemaphore(value: 1)
  let id: String
  let renderer: VideoRenderer
  private weak var owner: LocalComputerVideoView?
  private let offer: String
  private let queue = DispatchQueue(label: "botharness.video.peer")
  private let budget = DispatchSemaphore(value: 16)
  private let lock = NSLock()
  private var closed = false
  private var ownsSlot = false
  private var factory: RTCPeerConnectionFactory?
  private var peer: RTCPeerConnection?
  private var track: RTCVideoTrack?
  private var sentAnswer = false
  private var timer: Timer?
  private var cleanupDone = false
  private let started = CACurrentMediaTime()
  private var previousPresented = 0
  private var previousSample = CACurrentMediaTime()

  init?(id: String, offer: String, owner: LocalComputerVideoView) {
    guard let renderer = VideoRenderer(maximumFramesPerSecond: 30) else { return nil }
    self.renderer = renderer; self.id = id; self.offer = offer; self.owner = owner
    super.init()
  }
  private var ended: Bool { lock.lock(); defer { lock.unlock() }; return closed }
  private func enqueue(_ work: @escaping () -> Void) {
    guard !ended else { return }
    guard budget.wait(timeout: .now()) == .success else { fail("native-queue-full"); return }
    queue.async { [self] in defer { budget.signal() }; if !ended { work() } }
  }
  private func emit(_ work: @escaping (LocalComputerVideoView) -> Void) {
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.ended, let owner = self.owner, owner.current === self else { return }
      work(owner)
    }
  }
  private func fail(_ code: String) { emit { [weak self] owner in if let self { owner.failed(self, code) } } }
  func start() {
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.sample() }
    enqueue { [self] in
      guard Self.slot.wait(timeout: .now()) == .success else { fail("native-cleanup-pending"); return }
      ownsSlot = true
      _ = Self.ssl
      factory = RTCPeerConnectionFactory(encoderFactory: RTCDefaultVideoEncoderFactory(), decoderFactory: RTCDefaultVideoDecoderFactory())
      let config = RTCConfiguration()
      config.iceServers = []
      config.sdpSemantics = .unifiedPlan
      config.bundlePolicy = .maxBundle
      config.iceTransportPolicy = .all
      let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
      peer = factory?.peerConnection(with: config, constraints: constraints, delegate: self)
      guard let peer else { fail("native-unavailable"); return }
      peer.setRemoteDescription(RTCSessionDescription(type: .offer, sdp: offer)) { [weak self] error in
        guard let self else { return }
        self.enqueue { [self] in
          guard error == nil else { self.fail("signal-failed"); return }
          peer.answer(for: constraints) { [weak self] description, error in
            guard let self else { return }
            self.enqueue { [self] in
              guard error == nil, let description else { self.fail("signal-failed"); return }
              peer.setLocalDescription(description) { [weak self] error in
                guard let self else { return }
                self.enqueue { if error != nil { self.fail("signal-failed") } else { self.answerIfReady() } }
              }
            }
          }
        }
      }
    }
  }
  private func answerIfReady() {
    guard !sentAnswer, peer?.iceGatheringState == .complete, let description = peer?.localDescription else { return }
    guard description.sdp.utf8.count <= 98304 else { fail("signal-too-large"); return }
    sentAnswer = true
    emit { [id] owner in owner.onDescription(["attemptId": id, "sdp": description.sdp]) }
  }
  private func sample() {
    guard !ended else { return }
    let (received, rendered, presented, age) = renderer.sample()
    if CACurrentMediaTime() - started > 20 && presented == 0 { fail("presentation-timeout"); return }
    let now = CACurrentMediaTime()
    let sampleMs = max(1, (now - previousSample) * 1000)
    let fps = Double(max(0, presented - previousPresented)) * 1000 / sampleMs
    previousPresented = presented; previousSample = now
    emit { [id] owner in owner.onPresentation(["attemptId": id, "receivedFrames": received, "renderedFrames": rendered, "presentedFrames": presented, "sampleMs": sampleMs, "presentedFps": fps, "lastPresentedAgoMs": age]) }
  }
  func close() {
    lock.lock(); if closed { lock.unlock(); return }; closed = true; lock.unlock()
    timer?.invalidate(); timer = nil
    renderer.stop()
    queue.async { [self] in
      track?.remove(renderer); track = nil
      peer?.delegate = nil; peer?.close(); peer = nil; factory = nil
      renderer.waitForGPU()
      if ownsSlot { ownsSlot = false; Self.slot.signal() }
      lock.lock(); cleanupDone = true; lock.unlock()
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [self] in
      lock.lock(); let done = cleanupDone; lock.unlock()
      if !done { owner?.onMediaState(["attemptId": id, "state": "failed", "code": "native-cleanup-timeout"]) }
    }
  }
  func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
  func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
    if newState == .failed || newState == .closed || newState == .disconnected { fail("connection-lost") }
  }
  func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) { enqueue { [self] in answerIfReady() } }
  func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) { dataChannel.close(); fail("unexpected-data-channel") }
  func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams: [RTCMediaStream]) {
    enqueue { [self] in
      guard track == nil, let video = rtpReceiver.track as? RTCVideoTrack else { fail("unexpected-track"); return }
      track = video; video.add(renderer)
    }
  }
}
