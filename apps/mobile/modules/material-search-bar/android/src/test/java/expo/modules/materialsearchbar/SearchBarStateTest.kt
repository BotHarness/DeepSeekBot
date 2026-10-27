package expo.modules.materialsearchbar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SearchBarStateTest {
  @Test
  fun saysNoMatchOnlyForATypedQueryWithoutResults() {
    assertTrue(showsEmpty("ada", 0))
    assertFalse(showsEmpty("ada", 2))
    assertFalse(showsEmpty("  ", 0))
    assertFalse(showsEmpty("", 0))
  }

  @Test
  fun clearsTheQueryWhenTheSearchCollapses() {
    assertTrue(clearsOnCollapse(expanded = false, query = "ada"))
    assertFalse(clearsOnCollapse(expanded = true, query = "ada"))
    assertFalse(clearsOnCollapse(expanded = false, query = ""))
  }

  @Test
  fun readsCssHexColors() {
    assertEquals(0xff4176e6.toInt(), cssColor("#4176e6"))
    assertEquals(0x80ffffff.toInt(), cssColor("#ffffff80"))
    assertNull(cssColor("rgba(0,0,0,0.5)"))
  }
}
