import ExpoModulesCore
import UIKit

public final class HardwareSendModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HardwareSend")

    View(HardwareSendView.self) {
      Events("onSend")
      Prop("enabled") { (view: HardwareSendView, enabled: Bool) in
        view.enabled = enabled
      }
      Prop("title") { (view: HardwareSendView, title: String) in
        view.title = title
      }
    }
  }
}

final class HardwareSendView: ExpoView {
  let onSend = EventDispatcher()
  var enabled = false
  var title = ""

  override var keyCommands: [UIKeyCommand]? {
    guard canSend else { return super.keyCommands }
    let command = UIKeyCommand(
      title: title, action: #selector(send), input: "\r", modifierFlags: .command)
    command.wantsPriorityOverSystemBehavior = true
    return [command] + (super.keyCommands ?? [])
  }

  private var canSend: Bool {
    guard enabled, let field = firstResponder(in: self) else { return false }
    if let textView = field as? UITextView {
      return textView.isEditable && textView.markedTextRange == nil
    }
    if let textField = field as? UITextField {
      return textField.isEnabled && textField.markedTextRange == nil
    }
    return false
  }

  private func firstResponder(in view: UIView) -> UIView? {
    if view.isFirstResponder { return view }
    for child in view.subviews {
      if let responder = firstResponder(in: child) { return responder }
    }
    return nil
  }

  @objc private func send() {
    guard canSend else { return }
    onSend()
  }
}
