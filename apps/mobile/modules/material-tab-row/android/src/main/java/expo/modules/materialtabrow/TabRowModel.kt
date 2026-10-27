package expo.modules.materialtabrow

import androidx.compose.ui.graphics.Color

/** One tab: its value, visible label, optional dot colour and full accessible name. */
data class TabItem(
  val value: String,
  val label: String,
  val dot: Color? = null,
  val accessibilityLabel: String = label,
)

/** The selected tab's index, or null when the selection is not one of the tabs (no indicator). */
fun selectedTabIndex(tabs: List<TabItem>, selected: String): Int? =
  tabs.indexOfFirst { it.value == selected }.takeIf { it >= 0 }
