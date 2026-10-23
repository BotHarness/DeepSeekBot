package expo.modules.remotekeyboard

import android.text.Editable
import android.text.Selection
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.InputMethodManager
import android.content.Context

internal class RemoteInputConnection(
  private val target: View,
  private val accepting: () -> Boolean,
  private val emit: (Map<String, Any>) -> Unit,
) : BaseInputConnection(target, true) {
  private var closed = false

  override fun getEditable(): Editable = checkNotNull(super.getEditable())

  private fun active(): Boolean = !closed && accepting()

  fun discard() {
    removeComposingSpans(editable)
    editable.clear()
    Selection.setSelection(editable, 0)
  }

  private fun selectionChanged() {
    val manager = target.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
    manager.updateSelection(
      target, Selection.getSelectionStart(editable), Selection.getSelectionEnd(editable),
      getComposingSpanStart(editable), getComposingSpanEnd(editable),
    )
  }

  private fun key(value: String) {
    if (active()) emit(mapOf("kind" to "key", "key" to value, "modifiers" to emptyList<String>()))
  }

  private fun flush() {
    val text = editable.toString()
    discard()
    if (!active() || text.isEmpty()) return
    text.split('\n').forEachIndexed { index, part ->
      if (index > 0) key("return")
      if (part.isNotEmpty()) emit(mapOf("kind" to "type", "text" to part))
    }
    selectionChanged()
  }

  override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean {
    if (!active() || text == null || text.length > 2000) return false
    val changed = super.setComposingText(text, newCursorPosition)
    selectionChanged()
    return changed
  }

  override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean {
    if (!active() || text == null || text.length > 2000) return false
    val changed = super.commitText(text, newCursorPosition)
    flush()
    return changed
  }

  override fun finishComposingText(): Boolean {
    if (!active()) { discard(); return false }
    val changed = super.finishComposingText()
    flush()
    return changed
  }

  private fun delete(before: Int, after: Int, codePoints: Boolean): Boolean {
    if (!active() || before !in 0..64 || after !in 0..64) return false
    if (editable.isNotEmpty()) {
      val buffer = editable
      val start = minOf(Selection.getSelectionStart(buffer), Selection.getSelectionEnd(buffer)).coerceAtLeast(0)
      val end = maxOf(Selection.getSelectionStart(buffer), Selection.getSelectionEnd(buffer)).coerceAtLeast(start)
      val from = if (codePoints) Character.offsetByCodePoints(buffer, start, -minOf(before, Character.codePointCount(buffer, 0, start)))
        else (start - before).coerceAtLeast(0)
      val to = if (codePoints) Character.offsetByCodePoints(buffer, end, minOf(after, Character.codePointCount(buffer, end, buffer.length)))
        else (end + after).coerceAtMost(buffer.length)
      buffer.delete(end, to)
      buffer.delete(from, start)
      Selection.setSelection(buffer, from, end - (start - from))
      selectionChanged()
      return true
    }
    repeat(before) { key("backspace") }
    repeat(after) { key("delete") }
    return true
  }

  override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean =
    delete(beforeLength, afterLength, false)

  override fun deleteSurroundingTextInCodePoints(beforeLength: Int, afterLength: Int): Boolean =
    delete(beforeLength, afterLength, true)

  override fun sendKeyEvent(event: KeyEvent): Boolean {
    if (!active()) return false
    if (event.action == KeyEvent.ACTION_UP) return true
    if (event.action != KeyEvent.ACTION_DOWN) return false
    return when (event.keyCode) {
      KeyEvent.KEYCODE_DEL -> delete(1, 0, true)
      KeyEvent.KEYCODE_FORWARD_DEL -> delete(0, 1, true)
      KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
        finishComposingText()
        key("return")
        true
      }
      KeyEvent.KEYCODE_TAB -> { finishComposingText(); key("tab"); true }
      else -> {
        val codePoint = event.unicodeChar
        if (codePoint <= 0 || !Character.isValidCodePoint(codePoint)) false
        else commitText(String(Character.toChars(codePoint)), 1)
      }
    }
  }

  override fun performEditorAction(editorAction: Int): Boolean {
    if (!active()) return false
    finishComposingText()
    key("return")
    return true
  }

  override fun closeConnection() {
    closed = true
    discard()
    super.closeConnection()
  }
}
