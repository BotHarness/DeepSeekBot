package expo.modules.remotekeyboard

import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RemoteInputConnectionTest {
  private var allowed = true
  private val events = mutableListOf<Map<String, Any>>()
  private fun connection() = RemoteInputConnection(
    View(RuntimeEnvironment.getApplication()), { allowed }, { events.add(it) },
  )
  private fun text(value: String) = mapOf("kind" to "type", "text" to value)
  private fun key(value: String) = mapOf("kind" to "key", "key" to value, "modifiers" to emptyList<String>())

  @Test fun chineseCompositionStaysLocalUntilCandidateCommit() {
    val input = connection()
    input.setComposingText("n", 1)
    input.setComposingText("ni", 1)
    assertTrue(events.isEmpty())
    input.commitText("你", 1)
    assertEquals(listOf(text("你")), events)
    assertEquals("", input.getEditable().toString())
    input.finishComposingText()
    assertEquals(1, events.size)
  }

  @Test fun compositionCanFinishOrCancelWithoutDuplicateText() {
    val input = connection()
    input.setComposingText("한", 1)
    input.finishComposingText()
    input.finishComposingText()
    input.setComposingText("unused", 1)
    input.setComposingText("", 1)
    input.finishComposingText()
    assertEquals(listOf(text("한")), events)
  }

  @Test fun nativeBackspaceWorksWithNoLocalText() {
    val input = connection()
    input.deleteSurroundingText(1, 0)
    input.deleteSurroundingTextInCodePoints(2, 0)
    assertEquals(List(3) { key("backspace") }, events)
  }

  @Test fun deletingCompositionDoesNotDeleteRemoteText() {
    val input = connection()
    input.setComposingText("ni", 1)
    input.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL))
    assertTrue(events.isEmpty())
    assertEquals("n", input.getEditable().toString())
  }

  @Test fun codePointDeletionKeepsCompositionUnicodeValid() {
    val input = connection()
    input.setComposingText("a😀", 1)
    input.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL))
    assertEquals("a", input.getEditable().toString())
    assertTrue(events.isEmpty())
  }

  @Test fun enterCommitsCompositionThenSendsOneRemoteReturn() {
    val input = connection()
    input.setComposingText("中文", 1)
    input.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
    input.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
    assertEquals(listOf(text("中文"), key("return")), events)
  }

  @Test fun editorActionAndMultilinePasteUseNativeReturnSemantics() {
    val input = connection()
    input.commitText("a\nb", 1)
    input.performEditorAction(EditorInfo.IME_ACTION_DONE)
    assertEquals(listOf(text("a"), key("return"), text("b"), key("return")), events)
  }

  @Test fun revokedAndClosedConnectionsDiscardUnfinishedText() {
    val input = connection()
    input.setComposingText("draft", 1)
    allowed = false
    assertFalse(input.finishComposingText())
    assertFalse(input.commitText("late", 1))
    assertTrue(events.isEmpty())
    allowed = true
    input.closeConnection()
    assertFalse(input.commitText("closed", 1))
    assertTrue(events.isEmpty())
  }

  @Test fun oversizedInputAndDeletionAreRefused() {
    val input = connection()
    assertFalse(input.commitText("x".repeat(2001), 1))
    assertFalse(input.deleteSurroundingText(65, 0))
    assertTrue(events.isEmpty())
  }
}
