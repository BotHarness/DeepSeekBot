package expo.modules.materialsplitbutton

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SplitButtonStateTest {
  @Test
  fun opensOnlyWhenEnabledWithItemsAndAlwaysCloses() {
    assertEquals(true, nextMenuOpen(open = false, enabled = true, itemCount = 2))
    assertEquals(false, nextMenuOpen(open = false, enabled = false, itemCount = 2))
    assertEquals(false, nextMenuOpen(open = false, enabled = true, itemCount = 0))
    assertEquals(false, nextMenuOpen(open = true, enabled = false, itemCount = 2))
  }

  @Test
  fun readsCssHexColors() {
    assertEquals(0xff112233.toInt(), cssColor("#112233"))
    assertEquals(0x80112233.toInt(), cssColor("#11223380"))
    assertEquals(0xffaabbcc.toInt(), cssColor("#abc"))
    assertNull(cssColor("red"))
    assertNull(cssColor(""))
  }
}
