import UIKit
import XCTest
@testable import HardwareSend

@MainActor
final class HardwareSendViewTests: XCTestCase {
  private var window: UIWindow!
  private var view: HardwareSendView!
  private var field: UITextView!
  private var sends = 0

  private func prepareEditor() {
    sends = 0
    window = UIWindow(frame: CGRect(x: 0, y: 0, width: 600, height: 400))
    let controller = UIViewController()
    window.rootViewController = controller
    view = HardwareSendView(appContext: nil)
    view.frame = controller.view.bounds
    view.enabled = true
    view.title = "Send"
    view.onSend.onEventSent = { [weak self] _ in self?.sends += 1 }
    controller.view.addSubview(view)
    field = UITextView(frame: CGRect(x: 0, y: 0, width: 500, height: 200))
    view.addSubview(field)
    window.makeKeyAndVisible()
    XCTAssertTrue(field.becomeFirstResponder())
  }

  private func removeEditor() {
    field.resignFirstResponder()
    window.isHidden = true
    window = nil
    field = nil
    view = nil
  }

  func testOrdinaryCommandReturnSendsThroughTheResponderChain() throws {
    prepareEditor()
    defer { removeEditor() }
    let command = try sendCommand()
    XCTAssertTrue(UIApplication.shared.sendAction(command.action, to: nil, from: command, for: nil))
    XCTAssertEqual(sends, 1)
  }

  func testCachedCommandDoesNotSendMarkedTextAndNextCommandStillWorks() throws {
    prepareEditor()
    defer { removeEditor() }
    let command = try sendCommand()
    field.setMarkedText("ni", selectedRange: NSRange(location: 2, length: 0))
    XCTAssertNotNil(field.markedTextRange)
    XCTAssertFalse(view.keyCommands?.contains(where: isSendCommand) ?? false)
    UIApplication.shared.sendAction(command.action, to: view, from: command, for: nil)
    XCTAssertEqual(sends, 0)
    XCTAssertEqual(field.text, "ni")
    XCTAssertNotNil(field.markedTextRange)
    field.unmarkText()
    XCTAssertNil(field.markedTextRange)
    let next = try sendCommand()
    UIApplication.shared.sendAction(next.action, to: nil, from: next, for: nil)
    XCTAssertEqual(sends, 1)
  }

  func testCachedCommandCannotSendAfterFocusLeavesTheComposer() throws {
    prepareEditor()
    defer { removeEditor() }
    let command = try sendCommand()
    let other = UITextView(frame: CGRect(x: 0, y: 200, width: 500, height: 100))
    window.rootViewController!.view.addSubview(other)
    XCTAssertTrue(other.becomeFirstResponder())
    XCTAssertFalse(field.isFirstResponder)
    UIApplication.shared.sendAction(command.action, to: view, from: command, for: nil)
    XCTAssertEqual(sends, 0)
  }

  private func sendCommand() throws -> UIKeyCommand {
    try XCTUnwrap(view.keyCommands?.first(where: isSendCommand))
  }

  private func isSendCommand(_ command: UIKeyCommand) -> Bool {
    command.input == "\r" && command.modifierFlags == .command
  }
}
