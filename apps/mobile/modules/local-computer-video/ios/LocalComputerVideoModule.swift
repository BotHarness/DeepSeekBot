import AVFoundation
import ExpoModulesCore
import UIKit

public final class LocalComputerVideoModule: Module {
  /// The one Bot call this app may hold. A new attempt replaces it.
  private var call: CallAttempt?
  /// Reports interruptions and output changes for `call`.
  private var audio: CallAudioObserver?

  private func release(_ call: CallAttempt, _ done: @escaping (String?) -> Void) {
    if self.call === call { self.call = nil }
    audio?.stop()
    audio = nil
    CallAudioRoute.reset()
    call.close(done)
  }

  public func definition() -> ModuleDefinition {
    Name("LocalComputerVideo")
    Events("onCallState", "onCallTap", "onCallAudio")

    // Answers the Host's audio offer with the microphone. `testAudio` (test builds only)
    // replaces the microphone with injected files and records the downlink.
    // `headsetMicrophone` is the microphone (`headset` or `iphone`) used when headphones
    // take the call; `iphone` there is music mode.
    AsyncFunction("callStart") { (attemptId: String, offer: String, testAudio: Bool, headsetMicrophone: String, promise: Promise) in
      let lines = offer.components(separatedBy: .newlines)
      guard offer.utf8.count <= 98304, offer.hasPrefix("v=0"),
        lines.filter({ $0.hasPrefix("m=audio ") }).count == 1,
        !lines.contains(where: { $0.hasPrefix("m=") && !$0.hasPrefix("m=audio ") }) else {
        promise.reject("invalid-offer", "The Host sent an invalid call offer.")
        return
      }
      guard AVAudioSession.sharedInstance().recordPermission == .granted else {
        promise.reject("microphone-denied", "Microphone access is off for this app.")
        return
      }
      if let previous = self.call { self.release(previous) { _ in } }
      guard CallAudioRoute.start(headsetMicrophone: headsetMicrophone) else {
        promise.reject("audio-session", "The phone's audio could not start for a call.")
        return
      }
      let attempt = CallAttempt(
        id: attemptId, offer: offer, testAudio: testAudio,
        onState: { [weak self] state, code in
          guard let self, self.call?.id == attemptId else { return }
          var body: [String: Any] = ["attemptId": attemptId, "state": state]
          if let code { body["code"] = code }
          self.sendEvent("onCallState", body)
        },
        onTap: { [weak self] kind, detail in
          guard let self, self.call?.id == attemptId else { return }
          self.sendEvent("onCallTap", detail.merging(["attemptId": attemptId, "kind": kind]) { current, _ in current })
        })
      self.call = attempt
      CallAudioRoute.onMusicMode = { [weak attempt] on in attempt?.setMusicMode(on) }
      CallAudioRoute.syncMusicMode()
      // The call keeps running with the screen locked or the app in the background:
      // the app declares the `audio` background mode and the session stays active.
      self.audio = CallAudioObserver { [weak self] body in
        guard let self, self.call?.id == attemptId else { return }
        self.sendEvent("onCallAudio", body.merging(["attemptId": attemptId]) { current, _ in current })
      }
      attempt.start { result in
        switch result {
        case .success(let sdp): promise.resolve(sdp)
        case .failure(let error): promise.reject(error.code, "The call could not connect on this phone.")
        }
      }
    }.runOnQueue(.main)

    Function("callMute") { (attemptId: String, muted: Bool) in
      guard let call = self.call, call.id == attemptId else { return }
      call.mute(muted)
    }

    // Chooses the live call's output (`receiver`, `speaker` or `external`) and microphone
    // (`iphone` or `headset`); resolves with the route now in use.
    AsyncFunction("callAudio") { (attemptId: String, output: String, microphone: String) -> [String: Any]? in
      guard let call = self.call, call.id == attemptId else { return nil }
      return CallAudioRoute.choose(output: output, microphone: microphone)
    }.runOnQueue(.main)

    AsyncFunction("callAudioState") { (attemptId: String) -> [String: Any]? in
      guard let call = self.call, call.id == attemptId else { return nil }
      return CallAudioRoute.state()
    }.runOnQueue(.main)

    // Test builds: queue a 16-bit WAV file into the uplink in place of the microphone.
    AsyncFunction("callInject") { (attemptId: String, path: String) -> Bool in
      guard let call = self.call, call.id == attemptId, call.tap != nil else { return false }
      let url = path.hasPrefix("file://") ? URL(string: path) : URL(fileURLWithPath: path)
      guard let url, let data = try? Data(contentsOf: url), let wav = readWav(data) else { return false }
      return call.inject(wav.samples, rate: wav.rate)
    }.runOnQueue(.main)

    // Ends the call; resolves with the downlink recording path when a test build made one.
    AsyncFunction("callStop") { (attemptId: String, promise: Promise) in
      guard let call = self.call, call.id == attemptId else { promise.resolve(nil); return }
      self.release(call) { recording in promise.resolve(recording) }
    }.runOnQueue(.main)

    View(LocalComputerVideoView.self) {
      Events("onDescription", "onMediaState", "onPresentation")
      Prop("attemptId") { (view: LocalComputerVideoView, value: String) in view.attemptId = value }
      Prop("offer") { (view: LocalComputerVideoView, value: String) in view.offer = value }
      Prop("enabled") { (view: LocalComputerVideoView, value: Bool) in view.mediaEnabled = value }
      OnViewDidUpdateProps { (view: LocalComputerVideoView) in view.sync() }
    }
  }
}

final class LocalComputerVideoView: ExpoView {
  let onDescription = EventDispatcher()
  let onMediaState = EventDispatcher()
  let onPresentation = EventDispatcher()
  var attemptId = ""
  var offer = ""
  var mediaEnabled = false
  private(set) var current: VideoAttempt?
  private var suspended: String?
  private var observers: [NSObjectProtocol] = []

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    for name in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification] {
      observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        self?.suspend("background")
      })
    }
  }
  deinit {
    observers.forEach(NotificationCenter.default.removeObserver)
    current?.close()
  }
  override func layoutSubviews() { super.layoutSubviews(); current?.renderer.frame = bounds }
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { suspend("detached") } else { sync() }
  }
  func suspend(_ reason: String) {
    suspended = attemptId
    guard let previous = current else { return }
    current = nil
    previous.renderer.removeFromSuperview()
    previous.close()
    onMediaState(["attemptId": previous.id, "state": "closed", "code": reason])
  }
  func failed(_ attempt: VideoAttempt, _ code: String) {
    guard current === attempt else { return }
    suspend(code)
  }
  func sync() {
    guard window != nil, UIApplication.shared.applicationState == .active else { return }
    guard mediaEnabled else { suspend("disabled"); return }
    guard !attemptId.isEmpty, !offer.isEmpty, current?.id != attemptId, suspended != attemptId else { return }
    if current != nil { suspend("replaced"); suspended = nil }
    let lines = offer.components(separatedBy: .newlines)
    guard offer.utf8.count <= 98304, offer.hasPrefix("v=0"),
      lines.filter({ $0.hasPrefix("m=video ") }).count == 1,
      !lines.contains(where: { $0.hasPrefix("m=") && !$0.hasPrefix("m=video ") }) else {
      suspended = attemptId
      onMediaState(["attemptId": attemptId, "state": "failed", "code": "invalid-offer"])
      return
    }
    guard let attempt = VideoAttempt(id: attemptId, offer: offer, owner: self) else {
      suspended = attemptId
      onMediaState(["attemptId": attemptId, "state": "failed", "code": "native-unavailable"])
      return
    }
    current = attempt
    attempt.renderer.frame = bounds
    addSubview(attempt.renderer)
    attempt.start()
  }
}
