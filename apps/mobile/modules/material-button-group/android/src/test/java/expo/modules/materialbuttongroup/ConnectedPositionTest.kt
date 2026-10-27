package expo.modules.materialbuttongroup

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ConnectedPositionTest {
  @Test
  fun picksLeadingMiddleAndTrailingShapes() {
    assertEquals(
      listOf(
        ConnectedPosition.Leading,
        ConnectedPosition.Middle,
        ConnectedPosition.Middle,
        ConnectedPosition.Middle,
        ConnectedPosition.Trailing,
      ),
      (0 until 5).map { connectedPosition(it, 5) },
    )
    assertEquals(ConnectedPosition.Only, connectedPosition(0, 1))
    assertEquals(
      listOf(ConnectedPosition.Leading, ConnectedPosition.Trailing),
      (0 until 2).map { connectedPosition(it, 2) },
    )
  }

  @Test
  fun keepsTheSelectedButtonChecked() {
    assertEquals("memory", nextSelection("work", "memory", checked = true))
    assertNull(nextSelection("work", "work", checked = false))
    assertNull(nextSelection("work", "work", checked = true))
    assertNull(nextSelection("work", "memory", checked = false))
  }

  @Test
  fun readsTheThemesCssColours() {
    assertEquals(0xff4176e6.toInt(), cssColor("#4176e6"))
    assertEquals(0xffffffff.toInt(), cssColor("#fff"))
    assertEquals(0x0a000000, cssColor("#0000000a"))
    assertNull(cssColor("rgb(0, 0, 0)"))
    assertNull(cssColor(""))
  }
}
