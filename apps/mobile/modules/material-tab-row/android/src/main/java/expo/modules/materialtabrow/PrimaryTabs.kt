package expo.modules.materialtabrow

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Badge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * A Material 3 primary tab row with the theme's own indicator, colours and type. Each tab is a
 * 48 dp minimum target whose label grows with font scale and truncates on one line; TalkBack hears
 * the full name and count with the Tab role and selected state. A selection outside [tabs] shows
 * no indicator and no selected tab.
 */
@Composable
fun PrimaryTabs(
  tabs: List<TabItem>,
  selected: String,
  onSelect: (String) -> Unit,
  modifier: Modifier = Modifier,
  containerColor: Color? = null,
) {
  val index = selectedTabIndex(tabs, selected)
  PrimaryTabRow(
    selectedTabIndex = index ?: 0,
    modifier = modifier.fillMaxWidth().semantics { testTagsAsResourceId = true },
    containerColor = containerColor ?: TabRowDefaults.primaryContainerColor,
    indicator = {
      if (index != null) {
        TabRowDefaults.PrimaryIndicator(
          modifier = Modifier.tabIndicatorOffset(index, matchContentSize = true),
          width = Dp.Unspecified,
        )
      }
    },
  ) {
    tabs.forEach { tab ->
      val badge = badgeText(tab.count)
      Tab(
        selected = tab.value == selected,
        onClick = { onSelect(tab.value) },
        modifier = Modifier
          .heightIn(min = 48.dp)
          .testTag("tab-${tab.value}")
          .semantics { contentDescription = tab.accessibilityLabel },
        selectedContentColor = MaterialTheme.colorScheme.primary,
        unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        text = {
          Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Text(
              tab.label,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis,
              modifier = Modifier.weight(1f, fill = false).clearAndSetSemantics {},
            )
            if (badge != null) Badge(Modifier.clearAndSetSemantics {}) { Text(badge) }
          }
        },
      )
    }
  }
}
