package expo.modules.materialfabmenu

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FabMenuStateTest {
  @Test
  fun swapsThePlusForCloseHalfwayThroughTheMorph() {
    assertEquals(FabGlyph.Add, fabGlyph(0f))
    assertEquals(FabGlyph.Add, fabGlyph(0.5f))
    assertEquals(FabGlyph.Close, fabGlyph(0.51f))
    assertEquals(FabGlyph.Close, fabGlyph(1f))
  }

  @Test
  fun opensOnlyWhileEnabledButAlwaysCloses() {
    assertEquals(true, nextExpanded(expanded = false, enabled = true))
    assertNull(nextExpanded(expanded = false, enabled = false))
    assertEquals(false, nextExpanded(expanded = true, enabled = false))
  }

  @Test
  fun hangsTheMenuPaddingOutsideTheBottomEndOfTheBox() {
    assertEquals(MenuPlacement(-16, 0), menuPlacement(56, 56, 88, 72, 16))
    assertEquals(MenuPlacement(16, 16), menuPlacement(320, 300, 320, 300, 16))
  }

  @Test
  fun readsTheThemeHexColours() {
    assertEquals(0xff4176e6.toInt(), cssColor("#4176e6"))
    assertEquals(0x80ffffff.toInt(), cssColor("#ffffff80"))
    assertNull(cssColor("rgba(0,0,0,0.5)"))
  }
}
