import ExpoModulesCore
import UIKit

public final class LocalComputerVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LocalComputerVideo")
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
