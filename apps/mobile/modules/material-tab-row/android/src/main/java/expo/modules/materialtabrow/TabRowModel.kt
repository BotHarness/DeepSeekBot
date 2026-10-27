package expo.modules.materialtabrow

/** One tab: its value, visible label, optional count badge and full accessible name. */
data class TabItem(
  val value: String,
  val label: String,
  val count: Int? = null,
  val accessibilityLabel: String = label,
)

/** The selected tab's index, or null when the selection is not one of the tabs (no indicator). */
fun selectedTabIndex(tabs: List<TabItem>, selected: String): Int? =
  tabs.indexOfFirst { it.value == selected }.takeIf { it >= 0 }

/** Badge text for a tab count: hidden at zero or below, capped at 99+ like Material badges. */
fun badgeText(count: Int?): String? = when {
  count == null || count <= 0 -> null
  count > MAX_BADGE -> "$MAX_BADGE+"
  else -> count.toString()
}

private const val MAX_BADGE = 99
