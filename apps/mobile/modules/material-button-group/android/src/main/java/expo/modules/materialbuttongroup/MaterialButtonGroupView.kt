@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialbuttongroup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ButtonGroupDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.ToggleButtonShapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import expo.modules.kotlin.views.ComposeProps
import expo.modules.kotlin.views.FunctionalComposableScope
import expo.modules.kotlin.views.OptimizedComposeProps
import expo.modules.ui.ModifierList
import expo.modules.ui.ModifierRegistry

class ButtonGroupItem : Record {
  @Field val value: String = ""
  @Field val label: String = ""
  // Material Symbols path data on a 24 × 24 viewport.
  @Field val path: String = ""
}

@OptimizedComposeProps
data class ButtonGroupProps(
  val items: List<ButtonGroupItem> = emptyList(),
  val selected: String = "",
  val reduceMotion: Boolean = false,
  val modifiers: ModifierList = emptyList(),
) : ComposeProps

@OptimizedRecord
data class ButtonGroupSelectEvent(@Field val value: String = "") : Record

/**
 * An M3 Expressive connected button group of icon-only toggle buttons, placed inside `Host` so it
 * paints with the Host's seeded Material theme. Each button keeps its connected leading, middle or
 * trailing shape; the selected one morphs to a full round shape on the Expressive spatial spring.
 * TalkBack hears each button as a tab with its name and state.
 */
@Composable
fun FunctionalComposableScope.ButtonGroupContent(props: ButtonGroupProps, onSelect: (String) -> Unit) {
  // Show the press at once; JS confirms it with the next `selected` prop.
  var selected by remember { mutableStateOf(props.selected) }
  LaunchedEffect(props.selected) { selected = props.selected }
  val select = { value: String, checked: Boolean ->
    nextSelection(selected, value, checked)?.let {
      selected = it
      onSelect(it)
    }
  }
  // Reduce Motion keeps the shape change but drops the overshooting Expressive spring.
  MaterialExpressiveTheme(motionScheme = if (props.reduceMotion) MotionScheme.standard() else MotionScheme.expressive()) {
    Row(
      modifier = ModifierRegistry.applyModifiers(props.modifiers, appContext, composableScope, globalEventDispatcher)
        .fillMaxWidth()
        .semantics {
          testTagsAsResourceId = true
          isTraversalGroup = true
        },
      horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween),
    ) {
      props.items.forEachIndexed { index, item ->
        val checked = item.value == selected
        val icon = remember(item.path) { vector(item.path) }
        ToggleButton(
          checked = checked,
          onCheckedChange = { select(item.value, it) },
          modifier = Modifier
            .weight(1f)
            .heightIn(min = 48.dp)
            .testTag("profile-tab-${item.value}")
            .clearAndSetSemantics {
              role = Role.Tab
              this.selected = checked
              contentDescription = item.label
              onClick(label = item.label) {
                select(item.value, true)
                true
              }
            },
          shapes = shapes(connectedPosition(index, props.items.size)),
        ) {
          Icon(icon, contentDescription = null)
        }
      }
    }
  }
}

// The connected shapes' checked shape is already CornerFull, the fully round selected state.
@Composable
private fun shapes(position: ConnectedPosition): ToggleButtonShapes = when (position) {
  ConnectedPosition.Leading -> ButtonGroupDefaults.connectedLeadingButtonShapes()
  ConnectedPosition.Middle -> ButtonGroupDefaults.connectedMiddleButtonShapes()
  ConnectedPosition.Trailing -> ButtonGroupDefaults.connectedTrailingButtonShapes()
  ConnectedPosition.Only -> ToggleButtonShapes(CircleShape, CircleShape, CircleShape)
}

private fun vector(path: String): ImageVector =
  ImageVector.Builder("Tab", 24.dp, 24.dp, 24f, 24f)
    .addPath(pathData = addPathNodes(path), fill = SolidColor(Color.Black))
    .build()
