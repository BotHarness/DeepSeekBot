package expo.modules.hardwaresend

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HardwareSendTest {
  private val enterKey = KeyEvent.KEYCODE_ENTER

  @Test fun plainEnterSendsOnlyWhereEnterSends() {
    assertTrue(sendsOnKey(enterKey, 0, enter = true, soft = false))
    assertTrue(sendsOnKey(KeyEvent.KEYCODE_NUMPAD_ENTER, 0, enter = true, soft = false))
    assertFalse(sendsOnKey(enterKey, 0, enter = false, soft = false))
  }

  @Test fun shiftEnterAlwaysAddsALine() {
    assertFalse(sendsOnKey(enterKey, KeyEvent.META_SHIFT_ON, enter = true, soft = false))
    assertFalse(
      sendsOnKey(enterKey, KeyEvent.META_SHIFT_ON or KeyEvent.META_CTRL_ON, enter = true, soft = false),
    )
  }

  @Test fun ctrlOrMetaEnterSendsEvenInTheFullEditor() {
    assertTrue(sendsOnKey(enterKey, KeyEvent.META_CTRL_ON, enter = false, soft = false))
    assertTrue(sendsOnKey(enterKey, KeyEvent.META_META_ON, enter = false, soft = false))
  }

  @Test fun altEnterAndOtherKeysPassThrough() {
    assertFalse(sendsOnKey(enterKey, KeyEvent.META_ALT_ON, enter = true, soft = false))
    assertFalse(sendsOnKey(KeyEvent.KEYCODE_A, KeyEvent.META_CTRL_ON, enter = true, soft = false))
  }

  @Test fun theOnScreenKeyboardNeverSends() {
    assertFalse(sendsOnKey(enterKey, 0, enter = true, soft = true))
    assertFalse(sendsOnKey(enterKey, KeyEvent.META_CTRL_ON, enter = true, soft = true))
  }

  @Test fun anInputMethodEchoOfAHardwareEnterKeepsItsModifiers() {
    val echo = ImeEcho(500)
    echo.pressed(enterKey, KeyEvent.META_CTRL_ON, at = 1_000)
    assertEquals(KeyEvent.META_CTRL_ON, echo.echoed(enterKey, now = 1_020))
  }

  @Test fun anOnScreenEnterWithNoHardwareEnterBeforeItIsNoEcho() {
    val echo = ImeEcho(500)
    assertNull(echo.echoed(enterKey, now = 1_000))
    echo.pressed(KeyEvent.KEYCODE_A, 0, at = 1_000)
    assertNull(echo.echoed(enterKey, now = 1_010))
  }

  @Test fun anEchoTooLateOrAfterTheKeyIsReleasedIsNoEcho() {
    val echo = ImeEcho(500)
    echo.pressed(enterKey, 0, at = 1_000)
    assertNull(echo.echoed(enterKey, now = 1_501))
    echo.pressed(enterKey, 0, at = 2_000)
    echo.clear()
    assertNull(echo.echoed(enterKey, now = 2_010))
  }

  @Test fun onlyASingleTypedNewlineCountsAsAnInputMethodEnter() {
    assertTrue(insertedNewline("hi\n", start = 2, before = 0, count = 1))
    assertFalse(insertedNewline("hi\nthere", start = 2, before = 0, count = 7))
    assertFalse(insertedNewline("hb", start = 1, before = 0, count = 1))
    assertFalse(insertedNewline("h\n", start = 1, before = 1, count = 1))
  }
}
