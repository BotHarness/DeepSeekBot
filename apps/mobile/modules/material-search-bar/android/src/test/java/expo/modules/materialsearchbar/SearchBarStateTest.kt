package expo.modules.materialsearchbar

import org.junit.Assert.assertFalse
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
}
