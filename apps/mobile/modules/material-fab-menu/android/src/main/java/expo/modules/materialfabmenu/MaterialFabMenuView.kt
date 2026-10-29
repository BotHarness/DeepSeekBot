@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialfabmenu

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FloatingActionButtonMenu
import androidx.compose.material3.FloatingActionButtonMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleFloatingActionButton
import androidx.compose.material3.ToggleFloatingActionButtonDefaults
import androidx.compose.material3.ToggleFloatingActionButtonDefaults.animateIcon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import expo.modules.kotlin.views.ComposeProps
import expo.modules.kotlin.views.OptimizedComposeProps
import expo.modules.ui.ModifierList

class FabMenuItem : Record {
  @Field val key: String = ""
  @Field val label: String = ""
  @Field val path: String = ""
}

@OptimizedComposeProps
data class FabMenuProps(
  val items: List<FabMenuItem> = emptyList(),
  val expanded: Boolean = false,
  val available: Boolean = true,
  val label: String = "",
  val closeLabel: String = "",
  val reduceMotion: Boolean = false,
  val modifiers: ModifierList = emptyList(),
) : ComposeProps

@OptimizedRecord
data class FabToggleEvent(@Field val expanded: Boolean = false) : Record

@OptimizedRecord
data class FabPickEvent(@Field val key: String = "") : Record

private const val ADD = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
private val MENU_INSET = 16.dp
private const val CLOSE =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"

/**
 * The M3 Expressive FAB menu, placed inside `Host` so it paints with the Host's seeded Material
 * theme: the toggle morphs from `primaryContainer` to `primary`, and the items are `primary` pills.
 * The menu's own padding hangs outside the box's bottom-end corner, so the toggle sits flush in it.
 */
@Composable
fun FabMenu(
  props: FabMenuProps,
  modifier: Modifier = Modifier,
  onToggle: (Boolean) -> Unit,
  onPick: (String) -> Unit,
) {
  // Show the toggle at once; JS confirms it with the next `expanded` prop.
  var expanded by remember { mutableStateOf(props.expanded) }
  LaunchedEffect(props.expanded) { expanded = props.expanded }
  val toggle = {
    nextExpanded(expanded, props.available)?.let {
      expanded = it
      onToggle(it)
    }
  }
  // Reduce Motion keeps the morph but drops the overshooting Expressive spring.
  MaterialExpressiveTheme(motionScheme = if (props.reduceMotion) MotionScheme.standard() else MotionScheme.expressive()) {
    val scheme = MaterialTheme.colorScheme
    val add = remember { vector(ADD) }
    val close = remember { vector(CLOSE) }
    Box(
      modifier = modifier.fillMaxSize().semantics { testTagsAsResourceId = true },
      contentAlignment = Alignment.BottomEnd,
    ) {
      FloatingActionButtonMenu(
        expanded = expanded,
        modifier = Modifier.layout { measurable, constraints ->
          val inset = MENU_INSET.roundToPx()
          val placeable = measurable.measure(
            constraints.copy(
              minWidth = 0,
              minHeight = 0,
              maxWidth = constraints.maxWidth + inset * 2,
              maxHeight = constraints.maxHeight + inset,
            ),
          )
          layout(constraints.maxWidth, constraints.maxHeight) {
            val at = menuPlacement(
              constraints.maxWidth,
              constraints.maxHeight,
              placeable.width,
              placeable.height,
              inset,
            )
            placeable.placeRelative(at.x, at.y)
          }
        },
        button = {
          ToggleFloatingActionButton(
            checked = expanded,
            onCheckedChange = { toggle() },
            modifier = Modifier
              .testTag("creation-menu-trigger")
              .semantics {
                traversalIndex = -1f
                contentDescription = if (expanded) props.closeLabel else props.label
                stateDescription = if (expanded) "expanded" else "collapsed"
              },
          ) {
            Icon(
              if (fabGlyph(checkedProgress) == FabGlyph.Close) close else add,
              contentDescription = null,
              modifier = Modifier.animateIcon(checkedProgress = { checkedProgress }),
            )
          }
        },
      ) {
        props.items.forEach { item ->
          val icon = remember(item.path) { vector(item.path) }
          FloatingActionButtonMenuItem(
            onClick = { if (props.available) onPick(item.key) },
            text = { Text(item.label) },
            icon = { Icon(icon, contentDescription = null) },
            modifier = Modifier.testTag("creation-${item.key}"),
            containerColor = scheme.primary,
            contentColor = scheme.onPrimary,
          )
        }
      }
    }
  }
}

private fun vector(path: String): ImageVector =
  ImageVector.Builder("FabMenu", 24.dp, 24.dp, 24f, 24f)
    .addPath(pathData = addPathNodes(path), fill = SolidColor(Color.Black))
    .build()
