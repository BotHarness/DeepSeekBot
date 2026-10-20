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
    guard enabled else { return super.keyCommands }
    let command = UIKeyCommand(
      title: title, action: #selector(send), input: "\r", modifierFlags: .command)
    command.wantsPriorityOverSystemBehavior = true
    return [command] + (super.keyCommands ?? [])
  }

  @objc private func send() {
    guard enabled else { return }
    onSend()
  }
}
