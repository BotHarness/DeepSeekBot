package expo.modules.hardwaresend

import android.view.KeyEvent
import org.junit.Assert.assertFalse
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
}
