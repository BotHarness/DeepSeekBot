import UIKit

final class RemoteTextInput: UITextView, UITextViewDelegate {
  var emit: (([String: Any]) -> Void)?
  var dismissed: (() -> Void)?
  var accepting = false
  private var editing = false
  private var marking = false

  init() {
    super.init(frame: .zero, textContainer: nil)
    delegate = self
    backgroundColor = .clear
    textColor = .clear
    tintColor = .clear
    keyboardAppearance = .dark
    autocorrectionType = .no
    spellCheckingType = .no
    autocapitalizationType = .none
    smartQuotesType = .no
    smartDashesType = .no
    smartInsertDeleteType = .no
    inputAssistantItem.leadingBarButtonGroups = []
    inputAssistantItem.trailingBarButtonGroups = []
    isAccessibilityElement = false
    accessibilityElementsHidden = true
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  func clear() {
    editing = true
    super.unmarkText()
    text = ""
    editing = false
  }
  private func key(_ value: String) {
    guard accepting else { return }
    emit?(["kind": "key", "key": value, "modifiers": [String]()])
  }
  private func commit() {
    guard accepting, !editing, !marking, markedTextRange == nil, !text.isEmpty else { return }
    let value = text ?? ""
    clear()
    let lines = value.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").components(separatedBy: "\n")
    for (index, line) in lines.enumerated() {
      if index > 0 { key("return") }
      if !line.isEmpty { emit?(["kind": "type", "text": line]) }
    }
  }
  override func insertText(_ text: String) {
    guard accepting else { return }
    super.insertText(text)
    commit()
  }
  override func deleteBackward() {
    guard accepting else { return }
    if markedTextRange != nil { super.deleteBackward() } else { key("backspace") }
  }
  override func setMarkedText(_ markedText: String?, selectedRange: NSRange) {
    guard accepting else { return }
    marking = true
    super.setMarkedText(markedText, selectedRange: selectedRange)
    marking = false
  }
  override func unmarkText() {
    super.unmarkText()
    commit()
  }
  func textViewDidChange(_ textView: UITextView) { commit() }
  func textViewDidEndEditing(_ textView: UITextView) { dismissed?() }
}
