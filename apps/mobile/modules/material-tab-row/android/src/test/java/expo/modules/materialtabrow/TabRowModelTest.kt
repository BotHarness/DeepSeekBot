package expo.modules.materialtabrow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TabRowModelTest {
  private val tabs = listOf(TabItem("action", "Needs you"), TabItem("replies", "For you"), TabItem("unread", "Other unread"))

  @Test
  fun selectsTheMatchingTab() {
    assertEquals(0, selectedTabIndex(tabs, "action"))
    assertEquals(2, selectedTabIndex(tabs, "unread"))
  }

  @Test
  fun showsNoSelectionOutsideTheTabs() {
    assertNull(selectedTabIndex(tabs, "handled"))
    assertNull(selectedTabIndex(emptyList(), "action"))
  }

  @Test
  fun capsAndHidesBadgeCounts() {
    assertNull(badgeText(null))
    assertNull(badgeText(0))
    assertEquals("7", badgeText(7))
    assertEquals("99", badgeText(99))
    assertEquals("99+", badgeText(100))
  }

  @Test
  fun keepsTheLabelAsTheDefaultAccessibleName() {
    assertEquals("Needs you", TabItem("action", "Needs you").accessibilityLabel)
  }
}
