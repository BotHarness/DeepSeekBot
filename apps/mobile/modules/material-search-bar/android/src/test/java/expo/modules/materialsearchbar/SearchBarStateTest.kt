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
  fun readsAvatarsOnlyFromLocalFiles() {
    assertEquals("/data/avatars/h1/bot-ada.png", avatarPath("file:///data/avatars/h1/bot-ada.png"))
    assertEquals("/data/avatars/h 1/bot-ada.png", avatarPath("file:///data/avatars/h%201/bot-ada.png"))
    assertNull(avatarPath(""))
    assertNull(avatarPath("https://host/avatar.png"))
    assertNull(avatarPath("not a uri"))
  }
}
