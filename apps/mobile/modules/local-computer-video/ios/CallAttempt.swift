import AVFoundation
import Foundation
import QuartzCore
import WebRTC

/// One phone-side Bot call: answers the Host's single audio offer with the microphone.
/// The system voice-processing I/O unit supplies echo cancellation, so the Bot's reply
/// played on the speaker is not heard back as the user's speech. The Host owns VAD,
/// ASR and the call state; this peer only carries audio. Nothing is stored, except the
/// downlink recording a test build asks for explicitly.
final class CallAttempt: NSObject, RTCPeerConnectionDelegate {
  private static let ssl: Void = { RTCInitializeSSL() }()
  let id: String
  private let offer: String
  private let queue = DispatchQueue(label: "botharness.call.peer")
  private let lock = NSLock()
  private var closed = false
  private var factory: RTCPeerConnectionFactory?
  private var peer: RTCPeerConnection?
  private var track: RTCAudioTrack?
  private var music = false
  private var remoteTrack: RTCAudioTrack?
  private var answered: ((Result<String, CallError>) -> Void)?
  private var settleScheduled = false
  private var sampling = false
  private let started = CACurrentMediaTime()
  private let onState: (String, String?) -> Void
  let tap: CallAudioTap?

  struct CallError: Error { let code: String }

  init(id: String, offer: String, testAudio: Bool, onState: @escaping (String, String?) -> Void, onTap: @escaping (String, [String: Any]) -> Void) {
    self.id = id
    self.offer = offer
    self.onState = onState
    self.tap = testAudio ? CallAudioTap(started: CACurrentMediaTime(), emit: onTap) : nil
    super.init()
  }

  private var ended: Bool { lock.lock(); defer { lock.unlock() }; return closed }

  static func releaseSession() {
    let session = RTCAudioSession.sharedInstance()
    session.lockForConfiguration()
    defer { session.unlockForConfiguration() }
    try? session.setActive(false)
  }

  func start(_ completion: @escaping (Result<String, CallError>) -> Void) {
    answered = completion
    queue.async { [self] in
      guard !ended else { return }
      _ = Self.ssl
      let processing = RTCDefaultAudioProcessingModule()
      processing.capturePostProcessingDelegate = tap?.capture
      // The AudioEngine module can turn Apple's voice processing off at runtime, which
      // music mode needs for A2DP output and for other apps' audio to keep playing.
      factory = RTCPeerConnectionFactory(
        audioDeviceModuleType: .audioEngine,
        bypassVoiceProcessing: false,
        encoderFactory: nil,
        decoderFactory: nil,
        audioProcessingModule: processing)
      let config = RTCConfiguration()
      config.iceServers = []
      config.sdpSemantics = .unifiedPlan
      config.bundlePolicy = .maxBundle
      config.iceTransportPolicy = .all
      let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
      guard let factory, let peer = factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
        finish(.failure(CallError(code: "native-unavailable"))); return
      }
      self.peer = peer
      let microphone = factory.audioTrack(with: factory.audioSource(with: nil), trackId: "call-mic")
      // Echo cancellation keeps the Bot's own reply on the speaker out of the uplink.
      // A test build forces software processing so the capture hook that replaces
      // the microphone with injected audio runs; platform voice processing skips it.
      track = microphone
      applyProcessing()
      peer.setRemoteDescription(RTCSessionDescription(type: .offer, sdp: offer)) { [weak self] error in
        guard let self else { return }
        self.queue.async { [self] in
          guard !self.ended else { return }
          guard error == nil else { self.finish(.failure(CallError(code: "signal-failed"))); return }
          guard peer.add(microphone, streamIds: ["call"]) != nil else {
            self.finish(.failure(CallError(code: "signal-failed"))); return
          }
          peer.answer(for: constraints) { [weak self] description, error in
            guard let self else { return }
            self.queue.async { [self] in
              guard error == nil, let description else { self.finish(.failure(CallError(code: "signal-failed"))); return }
              peer.setLocalDescription(description) { [weak self] error in
                guard let self else { return }
                self.queue.async {
                  if error != nil { self.finish(.failure(CallError(code: "signal-failed"))) } else { self.answerIfReady(force: false) }
                }
              }
            }
          }
        }
      }
      // A phone with no route to the Host never completes gathering: answer with what
      // exists after a short settle, and give up after eight seconds.
      queue.asyncAfter(deadline: .now() + 8) { [weak self] in self?.answerIfReady(force: true, timeout: true) }
    }
  }

  private func finish(_ result: Result<String, CallError>) {
    guard let answered else { return }
    self.answered = nil
    DispatchQueue.main.async { answered(result) }
  }

  private func answerIfReady(force: Bool, timeout: Bool = false) {
    guard answered != nil, let peer, let description = peer.localDescription else {
      if timeout { finish(.failure(CallError(code: "ice-timeout"))) }
      return
    }
    let hasCandidate = description.sdp.contains("a=candidate:")
    guard peer.iceGatheringState == .complete || (force && hasCandidate) else {
      if timeout { finish(.failure(CallError(code: "ice-timeout"))) }
      return
    }
    guard description.sdp.utf8.count <= 98304 else { finish(.failure(CallError(code: "signal-too-large"))); return }
    finish(.success(description.sdp))
  }

  /// Music mode runs without Apple's voice processing, so Bluetooth headphones play over
  /// A2DP and other apps keep playing; WebRTC's software echo canceller and noise
  /// suppressor take over on the microphone.
  func setMusicMode(_ on: Bool) {
    queue.async { [self] in
      guard !ended, music != on else { return }
      music = on
      applyProcessing()
    }
  }

  private func applyProcessing() {
    guard let factory, let track else { return }
    _ = factory.audioDeviceModule.setPlatformVoiceProcessingAllowed(!music)
    let options: RTCAudioProcessingOptions
    if tap != nil || music {
      let software = { RTCAudioProcessingComponentOptions(enabled: true, mode: .software) }
      options = RTCAudioProcessingOptions(
        echoCancellationOptions: software(), noiseSuppressionOptions: software(),
        autoGainControlOptions: software(), highPassFilterOptions: software())
    } else {
      options = RTCAudioProcessingOptions(
        echoCancellation: true, noiseSuppression: true, autoGainControl: true, highPassFilter: true)
    }
    let applied = track.setAudioProcessingOptions(options)
    tap?.note("processing-options", ["music": music, "code": applied.code.rawValue, "message": applied.message])
  }

  func mute(_ muted: Bool) {
    queue.async { [self] in
      track?.isEnabled = !muted
      tap?.capture.setMuted(muted)
    }
  }

  func inject(_ samples: [Float], rate: Double) -> Bool {
    guard let tap else { return false }
    tap.capture.enqueue(samples, rate: rate)
    return true
  }

  func close(_ done: @escaping (String?) -> Void) {
    lock.lock(); if closed { lock.unlock(); done(nil); return }; closed = true; lock.unlock()
    finish(.failure(CallError(code: "closed")))
    queue.async { [self] in
      track?.isEnabled = false
      if let render = tap?.render { remoteTrack?.remove(render) }
      peer?.delegate = nil; peer?.close(); peer = nil; track = nil; remoteTrack = nil; factory = nil
      let recording = tap?.render.writeRecording()
      Self.releaseSession()
      DispatchQueue.main.async { done(recording) }
    }
  }

  /// Test builds sample media counters, process CPU time and the thermal state every
  /// five seconds into the call report, so a before/after run can compare phone cost.
  private func samplePerf() {
    guard let tap, let peer, !ended else { return }
    peer.statistics { report in
      var detail: [String: Any] = [:]
      func copy(_ values: [String: NSObject], _ key: String, _ out: String? = nil, scale: Double = 1) {
        if let value = values[key] as? NSNumber { detail[out ?? key] = value.doubleValue * scale }
      }
      for stats in report.statistics.values {
        let values = stats.values
        let audio = (values["kind"] as? String) == "audio"
        switch stats.type {
        case "inbound-rtp" where audio:
          for key in ["packetsReceived", "bytesReceived", "packetsLost", "concealedSamples", "totalSamplesReceived"] { copy(values, key) }
          copy(values, "jitter", "jitterMs", scale: 1000)
        case "outbound-rtp" where audio:
          copy(values, "packetsSent"); copy(values, "bytesSent")
        case "candidate-pair" where (values["nominated"] as? NSNumber)?.boolValue == true:
          copy(values, "currentRoundTripTime", "rttMs", scale: 1000)
        default: break
        }
      }
      var usage = rusage()
      if getrusage(RUSAGE_SELF, &usage) == 0 {
        let user = Double(usage.ru_utime.tv_sec) * 1000 + Double(usage.ru_utime.tv_usec) / 1000
        let system = Double(usage.ru_stime.tv_sec) * 1000 + Double(usage.ru_stime.tv_usec) / 1000
        detail["cpuMs"] = user + system
      }
      detail["thermal"] = ProcessInfo.processInfo.thermalState.rawValue
      detail["lowPower"] = ProcessInfo.processInfo.isLowPowerModeEnabled
      tap.note("perf", detail)
    }
    queue.asyncAfter(deadline: .now() + 5) { [weak self] in self?.samplePerf() }
  }

  private func state(_ value: String, _ code: String? = nil) {
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.ended else { return }
      self.onState(value, code)
    }
  }

  func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
  func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
    switch newState {
    case .connected, .completed:
      state("connected")
      if let tap, let factory {
        let processing = factory.audioProcessingState
        tap.note("processing-state", [
          "apm": processing.hasAudioProcessingModule,
          "aec": processing.echoCancellation.effective.rawValue,
          "ns": processing.noiseSuppression.effective.rawValue,
          "agc": processing.autoGainControl.effective.rawValue,
          "hpf": processing.highPassFilter.effective.rawValue,
        ])
      }
      queue.async { [self] in
        guard tap != nil, !sampling else { return }
        sampling = true
        samplePerf()
      }
    case .failed, .closed: state("failed", "connection-lost")
    default: break
    }
  }
  func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
    queue.async { [self] in answerIfReady(force: false) }
  }
  func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
    queue.async { [self] in
      guard !settleScheduled else { return }
      settleScheduled = true
      queue.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.answerIfReady(force: true) }
    }
  }
  func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
  func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
    dataChannel.close(); state("failed", "unexpected-data-channel")
  }
  func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams: [RTCMediaStream]) {
    // The Bot's voice plays through the voice-processing unit; a test build also records it.
    guard let remote = rtpReceiver.track as? RTCAudioTrack else { state("failed", "unexpected-track"); return }
    queue.async { [self] in
      guard !ended, remoteTrack == nil else { return }
      remoteTrack = remote
      if let render = tap?.render { remote.add(render) }
    }
  }
}

/// Test-build audio hooks. The capture side replaces the microphone with injected
/// audio (silence when the queue is empty); the render side records what the Bot
/// sends down and reports when its speech starts and stops.
final class CallAudioTap {
  let capture: Capture
  let render: Render

  private let started: CFTimeInterval
  private let emit: (String, [String: Any]) -> Void

  init(started: CFTimeInterval, emit: @escaping (String, [String: Any]) -> Void) {
    self.started = started
    self.emit = emit
    capture = Capture(started: started, emit: emit)
    render = Render(started: started, emit: emit)
  }

  func note(_ kind: String, _ detail: [String: Any]) {
    let ms = Int((CACurrentMediaTime() - started) * 1000)
    DispatchQueue.main.async { [emit] in emit(kind, detail.merging(["ms": ms]) { current, _ in current }) }
  }

  final class Capture: NSObject, RTCAudioCustomProcessingDelegate {
    private let lock = NSLock()
    private var source: [Float] = []
    private var sourceRate: Double = 16000
    private var position: Double = 0
    private var outputRate: Double = 48000
    private let started: CFTimeInterval
    private let emit: (String, [String: Any]) -> Void

    init(started: CFTimeInterval, emit: @escaping (String, [String: Any]) -> Void) {
      self.started = started; self.emit = emit
    }

    private var muted = false

    func setMuted(_ value: Bool) {
      lock.lock(); muted = value
      if value { source = []; position = 0 }
      lock.unlock()
    }

    /// Queues samples (S16 range) at their own rate; they play after earlier ones.
    func enqueue(_ samples: [Float], rate: Double) {
      lock.lock()
      if muted {
        lock.unlock()
        let ms = Int((CACurrentMediaTime() - started) * 1000)
        DispatchQueue.main.async { [emit] in emit("inject-dropped", ["ms": ms, "samples": samples.count, "reason": "muted"]) }
        return
      }
      if position >= Double(source.count) { source = []; position = 0 }
      // One queue holds one rate; resample later items onto it.
      if source.isEmpty { sourceRate = rate; source = samples } else { source += resample(samples, from: rate, to: sourceRate) }
      lock.unlock()
      let ms = Int((CACurrentMediaTime() - started) * 1000)
      DispatchQueue.main.async { [emit] in emit("inject-queued", ["ms": ms, "samples": samples.count, "rate": rate]) }
    }

    private var reported = false

    func audioProcessingInitialize(sampleRate sampleRateHz: Int, channels: Int) {
      lock.lock(); outputRate = Double(sampleRateHz); lock.unlock()
      let ms = Int((CACurrentMediaTime() - started) * 1000)
      DispatchQueue.main.async { [emit] in emit("capture-init", ["ms": ms, "rate": sampleRateHz, "channels": channels]) }
    }

    func audioProcessingProcess(audioBuffer: RTCAudioBuffer) {
      lock.lock(); defer { lock.unlock() }
      if !reported {
        reported = true
        let ms = Int((CACurrentMediaTime() - started) * 1000)
        let detail: [String: Any] = ["ms": ms, "channels": audioBuffer.channels, "frames": audioBuffer.frames, "rate": outputRate]
        DispatchQueue.main.async { [emit] in emit("capture-first-frame", detail) }
      }
      let step = sourceRate / outputRate
      for channel in 0..<audioBuffer.channels {
        let out = audioBuffer.rawBuffer(forChannel: channel)
        var cursor = position
        for frame in 0..<audioBuffer.frames {
          let index = Int(cursor)
          if index + 1 < source.count {
            let fraction = Float(cursor - Double(index))
            out[frame] = source[index] * (1 - fraction) + source[index + 1] * fraction
          } else {
            out[frame] = 0
          }
          cursor += step
        }
        if channel == audioBuffer.channels - 1 { position = cursor }
      }
    }

    func audioProcessingRelease() {}
  }

  final class Render: NSObject, RTCAudioRenderer {
    private let lock = NSLock()
    private var samples: [Int16] = []
    private var rate: Int = 48000
    private var speaking = false
    private var quietMs = 0
    private let started: CFTimeInterval
    private let emit: (String, [String: Any]) -> Void
    /// Five minutes at 48 kHz is the most a test call records.
    private let limit = 48000 * 300

    init(started: CFTimeInterval, emit: @escaping (String, [String: Any]) -> Void) {
      self.started = started; self.emit = emit
    }

    func render(pcmBuffer: AVAudioPCMBuffer) {
      let frames = Int(pcmBuffer.frameLength)
      guard frames > 0 else { return }
      var energy: Float = 0
      lock.lock()
      rate = Int(pcmBuffer.format.sampleRate)
      for frame in 0..<frames {
        let value: Float
        if let data = pcmBuffer.int16ChannelData {
          value = Float(data[0][frame])
        } else if let data = pcmBuffer.floatChannelData {
          value = max(-32768, min(32767, data[0][frame] * 32767))
        } else {
          value = 0
        }
        energy += value * value
        if samples.count < limit { samples.append(Int16(value)) }
      }
      lock.unlock()
      let rms = (energy / Float(frames)).squareRoot()
      let ms = Int((CACurrentMediaTime() - started) * 1000)
      // About -40 dBFS starts speech; half a second of quiet ends it.
      if rms > 330 {
        quietMs = 0
        if !speaking { speaking = true; DispatchQueue.main.async { [emit] in emit("downlink-start", ["ms": ms]) } }
      } else if speaking {
        quietMs += frames * 1000 / max(1, rate)
        if quietMs >= 500 { speaking = false; DispatchQueue.main.async { [emit] in emit("downlink-end", ["ms": ms]) } }
      }
    }

    /// Writes the downlink as a 16-bit mono WAV in the caches folder and returns its path.
    func writeRecording() -> String? {
      lock.lock(); let pcm = samples; let sampleRate = rate; samples = []; lock.unlock()
      guard !pcm.isEmpty, let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
      let url = folder.appendingPathComponent("call-downlink-\(Int(Date().timeIntervalSince1970)).wav")
      var data = Data()
      func u32(_ value: UInt32) { var v = value.littleEndian; data.append(Data(bytes: &v, count: 4)) }
      func u16(_ value: UInt16) { var v = value.littleEndian; data.append(Data(bytes: &v, count: 2)) }
      data.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + pcm.count * 2))
      data.append(contentsOf: Array("WAVEfmt ".utf8)); u32(16); u16(1); u16(1)
      u32(UInt32(sampleRate)); u32(UInt32(sampleRate * 2)); u16(2); u16(16)
      data.append(contentsOf: Array("data".utf8)); u32(UInt32(pcm.count * 2))
      pcm.withUnsafeBufferPointer { data.append(UnsafeBufferPointer(start: UnsafeRawPointer($0.baseAddress!).assumingMemoryBound(to: UInt8.self), count: pcm.count * 2)) }
      do { try data.write(to: url); return url.path } catch { return nil }
    }
  }
}

func resample(_ samples: [Float], from: Double, to: Double) -> [Float] {
  guard from != to, !samples.isEmpty else { return samples }
  let count = Int(Double(samples.count) * to / from)
  var out = [Float](repeating: 0, count: count)
  let step = from / to
  for index in 0..<count {
    let position = Double(index) * step
    let base = Int(position)
    let next = min(base + 1, samples.count - 1)
    let fraction = Float(position - Double(base))
    out[index] = samples[min(base, samples.count - 1)] * (1 - fraction) + samples[next] * fraction
  }
  return out
}

/// Reads a 16-bit PCM WAV as mono samples in S16 range, with its sample rate.
func readWav(_ data: Data) -> (samples: [Float], rate: Double)? {
  let bytes = [UInt8](data)
  guard bytes.count >= 44, String(bytes: bytes[0..<4], encoding: .ascii) == "RIFF",
    String(bytes: bytes[8..<12], encoding: .ascii) == "WAVE" else { return nil }
  func u16(_ at: Int) -> Int { Int(bytes[at]) | Int(bytes[at + 1]) << 8 }
  func u32(_ at: Int) -> Int { u16(at) | u16(at + 2) << 16 }
  var offset = 12
  var channels = 0, rate = 0, bits = 0
  while offset + 8 <= bytes.count {
    let name = String(bytes: bytes[offset..<offset + 4], encoding: .ascii)
    let size = u32(offset + 4)
    let body = offset + 8
    if name == "fmt ", body + 16 <= bytes.count {
      guard u16(body) == 1 else { return nil }
      channels = u16(body + 2); rate = u32(body + 4); bits = u16(body + 14)
    } else if name == "data" {
      guard bits == 16, channels > 0, rate > 0 else { return nil }
      let end = min(bytes.count, body + size)
      let frames = (end - body) / (2 * channels)
      var out = [Float](repeating: 0, count: frames)
      for frame in 0..<frames {
        var sum = 0
        for channel in 0..<channels {
          let at = body + (frame * channels + channel) * 2
          sum += Int(Int16(bitPattern: UInt16(bytes[at]) | UInt16(bytes[at + 1]) << 8))
        }
        out[frame] = Float(sum / channels)
      }
      return (out, Double(rate))
    }
    offset = body + size + (size & 1)
  }
  return nil
}
