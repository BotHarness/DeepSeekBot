package expo.modules.materialsplitbutton

import org.junit.Assert.assertEquals
import org.junit.Test

class SplitButtonStateTest {
  @Test
  fun opensOnlyWhenEnabledWithItemsAndAlwaysCloses() {
    assertEquals(true, nextMenuOpen(open = false, enabled = true, itemCount = 2))
    assertEquals(false, nextMenuOpen(open = false, enabled = false, itemCount = 2))
    assertEquals(false, nextMenuOpen(open = false, enabled = true, itemCount = 0))
    assertEquals(false, nextMenuOpen(open = true, enabled = false, itemCount = 2))
  }
}
