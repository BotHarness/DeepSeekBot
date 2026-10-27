package expo.modules.materialtabrow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TabRowModelTest {
  private val tabs = listOf(TabItem("action", "Needs you"), TabItem("replies", "For you"))

  @Test
  fun selectsTheMatchingTab() {
    assertEquals(0, selectedTabIndex(tabs, "action"))
    assertEquals(1, selectedTabIndex(tabs, "replies"))
  }

  @Test
  fun showsNoSelectionOutsideTheTabs() {
    assertNull(selectedTabIndex(tabs, "handled"))
    assertNull(selectedTabIndex(emptyList(), "action"))
  }

  @Test
  fun keepsTheLabelAsTheDefaultAccessibleName() {
    assertEquals("Needs you", TabItem("action", "Needs you").accessibilityLabel)
  }
}
