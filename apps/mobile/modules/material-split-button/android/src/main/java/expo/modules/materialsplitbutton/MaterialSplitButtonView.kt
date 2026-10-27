@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialsplitbutton

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuGroup
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenuPopup
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.SplitButtonDefaults
import androidx.compose.material3.SplitButtonLayout
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
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

class SplitMenuItem : Record {
  @Field val key: String = ""
  @Field val label: String = ""
  @Field val path: String = ""
}

@OptimizedComposeProps
data class SplitButtonProps(
  val label: String = "",
  val path: String = "",
  val menuLabel: String = "",
  val items: List<SplitMenuItem> = emptyList(),
  val available: Boolean = true,
  val testPrefix: String = "split",
  val modifiers: ModifierList = emptyList(),
) : ComposeProps

@OptimizedRecord
data class SplitPickEvent(@Field val key: String = "") : Record

@OptimizedRecord
data class SplitSizeEvent(@Field val width: Float = 0f, @Field val height: Float = 0f) : Record

private const val CHEVRON = "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"

/**
 * A tonal M3 Expressive split button, placed inside `Host` so its tonal colours, menu and motion
 * come from the Host's seeded Material theme. It reports its measured size; React Native sizes the
 * Host with it.
 */
@Composable
fun FunctionalComposableScope.SplitButtonContent(
  props: SplitButtonProps,
  onPress: () -> Unit,
  onPick: (String) -> Unit,
  onSize: (width: Float, height: Float) -> Unit,
) {
  var open by remember { mutableStateOf(false) }
  val leading = remember(props.path) { vector(props.path) }
  val chevron = remember { vector(CHEVRON) }
  val turn by animateFloatAsState(if (open) 180f else 0f, label = "chevron")
  val height = SplitButtonDefaults.SmallContainerHeight
  val density = LocalDensity.current
  Box(
    modifier = ModifierRegistry.applyModifiers(props.modifiers, appContext, composableScope, globalEventDispatcher)
      .fillMaxSize()
      .semantics { testTagsAsResourceId = true },
    contentAlignment = Alignment.Center,
  ) {
    SplitButtonLayout(
      modifier = Modifier.wrapContentSize(unbounded = true).onSizeChanged {
        with(density) { onSize(it.width.toDp().value, it.height.toDp().value) }
      },
      leadingButton = {
        SplitButtonDefaults.TonalLeadingButton(
          onClick = onPress,
          enabled = props.available,
          modifier = Modifier.testTag(props.testPrefix),
        ) {
          Icon(leading, null, Modifier.size(SplitButtonDefaults.leadingButtonIconSizeFor(height)))
          Spacer(Modifier.size(ButtonDefaults.IconSpacing))
          Text(props.label)
        }
      },
      trailingButton = {
        Box {
          SplitButtonDefaults.TonalTrailingButton(
            checked = open,
            onCheckedChange = { open = nextMenuOpen(open, props.available, props.items.size) },
            enabled = props.available && props.items.isNotEmpty(),
            modifier = Modifier.testTag("${props.testPrefix}-menu").semantics { contentDescription = props.menuLabel },
          ) {
            Icon(
              chevron,
              null,
              Modifier.size(SplitButtonDefaults.trailingButtonIconSizeFor(height)).graphicsLayer { rotationZ = turn },
            )
          }
          DropdownMenuPopup(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuGroup(shapes = MenuDefaults.groupShape(0, 1)) {
              props.items.forEachIndexed { index, item ->
                val icon = remember(item.path) { vector(item.path) }
                DropdownMenuItem(
                  onClick = {
                    open = false
                    onPick(item.key)
                  },
                  text = { Text(item.label) },
                  shape = MenuDefaults.itemShape(index, props.items.size).shape,
                  leadingIcon = { Icon(icon, null) },
                  modifier = Modifier.testTag("${props.testPrefix}-${item.key}"),
                )
              }
            }
          }
        }
      },
    )
  }
}

private fun vector(path: String): ImageVector =
  ImageVector.Builder("SplitButton", 24.dp, 24.dp, 24f, 24f)
    .addPath(pathData = addPathNodes(path), fill = SolidColor(Color.Black))
    .build()
