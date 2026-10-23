import ExpoModulesCore
import UIKit

public final class RemoteKeyboardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RemoteKeyboard")
    View(RemoteKeyboardView.self) {
      Events("onInput", "onDismissed")
      Prop("session") { (view: RemoteKeyboardView, value: String) in view.session = value }
      Prop("opened") { (view: RemoteKeyboardView, value: Bool) in view.opened = value }
      Prop("accepting") { (view: RemoteKeyboardView, value: Bool) in view.accepting = value }
      OnViewDidUpdateProps { (view: RemoteKeyboardView) in view.sync() }
    }
  }
}

final class RemoteKeyboardView: ExpoView {
  let onInput = EventDispatcher()
  let onDismissed = EventDispatcher()
  var session = ""
  var opened = false
  var accepting = false
  private var activeSession: String?
  private var dismissedSession: String?
  private let input = RemoteTextInput()
  private var observer: NSObjectProtocol?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    addSubview(input)
    input.emit = { [weak self] value in
      guard let self, self.opened, self.accepting, let session = self.activeSession,
        session == self.session, UIApplication.shared.applicationState == .active else { return }
      self.onInput(["session": session, "input": value])
    }
    input.dismissed = { [weak self] in self?.stop(notify: true) }
    observer = NotificationCenter.default.addObserver(
      forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.stop(notify: true) }
  }
  deinit {
    if let observer { NotificationCenter.default.removeObserver(observer) }
  }
  override func layoutSubviews() { super.layoutSubviews(); input.frame = bounds }
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { stop(notify: true) } else { sync() }
  }
  func stop(notify: Bool) {
    guard let old = activeSession else { return }
    activeSession = nil
    dismissedSession = old
    input.accepting = false
    input.resignFirstResponder()
    input.clear()
    if notify { onDismissed(["session": old]) }
  }
  func sync() {
    if !opened || !accepting || activeSession != nil && activeSession != session {
      stop(notify: false)
    }
    guard opened, accepting, !session.isEmpty, dismissedSession != session,
      window != nil, UIApplication.shared.applicationState == .active else { return }
    if activeSession == nil {
      activeSession = session
      input.clear()
      input.accepting = true
      if !input.becomeFirstResponder() { stop(notify: true) }
    }
  }
}
