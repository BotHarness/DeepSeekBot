import UIKit

final class RemoteTextInput: UITextView, UITextViewDelegate {
  var emit: (([String: Any]) -> Void)?
  var dismissed: (() -> Void)?
  var failed: (() -> Void)?
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
    undoManager?.removeAllActions()
    editing = false
  }
  private func permits(_ replacement: String, range: NSRange) -> Bool {
    guard accepting else { return false }
    let length = (text ?? "").utf16.count
    guard range.location <= length, range.length <= length - range.location,
      replacement.utf16.count <= 2000 - (length - range.length) else {
      accepting = false
      clear()
      failed?()
      return false
    }
    return true
  }
  private var replacementRange: NSRange {
    guard let marked = markedTextRange else { return selectedRange }
    return NSRange(location: offset(from: beginningOfDocument, to: marked.start),
      length: offset(from: marked.start, to: marked.end))
  }
  func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
    permits(text, range: range)
  }
  private func key(_ value: String) {
    guard accepting else { return }
    emit?(["kind": "key", "key": value, "modifiers": [String]()])
  }
  private func commit() {
    guard accepting, !editing, !marking, markedTextRange == nil, !text.isEmpty else { return }
    let value = text ?? ""
    guard permits(value, range: NSRange(location: 0, length: value.utf16.count)) else { return }
    clear()
    let lines = value.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").components(separatedBy: "\n")
    for (index, line) in lines.enumerated() {
      if index > 0 { key("return") }
      if !line.isEmpty { emit?(["kind": "type", "text": line]) }
    }
  }
  override func resignFirstResponder() -> Bool {
    accepting = false
    clear()
    return super.resignFirstResponder()
  }
  func textViewShouldEndEditing(_ textView: UITextView) -> Bool {
    accepting = false
    clear()
    return true
  }
  override func insertText(_ text: String) {
    guard permits(text, range: replacementRange) else { return }
    super.insertText(text)
    commit()
  }
  override func deleteBackward() {
    guard accepting else { return }
    if markedTextRange != nil { super.deleteBackward() } else { key("backspace") }
  }
  override func setMarkedText(_ markedText: String?, selectedRange: NSRange) {
    guard permits(markedText ?? "", range: replacementRange) else { return }
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
