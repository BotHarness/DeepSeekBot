@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialsplitbutton

import android.content.Context
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
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.SplitButtonDefaults
import androidx.compose.material3.SplitButtonLayout
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
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
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class SplitMenuItem : Record {
  @Field val key: String = ""
  @Field val label: String = ""
  @Field val path: String = ""
}

private const val CHEVRON = "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"

class MaterialSplitButtonView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  val onPress by EventDispatcher()
  val onPick by EventDispatcher()
  val onSize by EventDispatcher()
  var label by mutableStateOf("")
  var path by mutableStateOf("")
  var menuLabel by mutableStateOf("")
  var items by mutableStateOf<List<SplitMenuItem>>(emptyList())
  var enabled by mutableStateOf(true)
  var dark by mutableStateOf(false)
  var container by mutableStateOf("")
  var content by mutableStateOf("")
  var testPrefix by mutableStateOf("split")

  init {
    addView(ComposeView(context).apply {
      setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
      setContent {
        val scheme = if (dark) darkColorScheme() else lightColorScheme()
        MaterialExpressiveTheme(colorScheme = scheme) {
          var open by remember { mutableStateOf(false) }
          val leading = remember(path) { vector(path) }
          val chevron = remember { vector(CHEVRON) }
          val turn by animateFloatAsState(if (open) 180f else 0f, label = "chevron")
          val colors = ButtonDefaults.filledTonalButtonColors(
            containerColor = color(container, scheme.secondaryContainer),
            contentColor = color(content, scheme.onSecondaryContainer),
          )
          val height = SplitButtonDefaults.SmallContainerHeight
          val density = LocalDensity.current
          Box(
            modifier = Modifier.fillMaxSize().semantics { testTagsAsResourceId = true },
            contentAlignment = Alignment.Center,
          ) {
            SplitButtonLayout(
              modifier = Modifier.wrapContentSize(unbounded = true).onSizeChanged {
                with(density) {
                  onSize(mapOf("width" to it.width.toDp().value, "height" to it.height.toDp().value))
                }
              },
              leadingButton = {
                SplitButtonDefaults.TonalLeadingButton(
                  onClick = { onPress(emptyMap<String, Any>()) },
                  enabled = enabled,
                  colors = colors,
                  modifier = Modifier.testTag(testPrefix),
                ) {
                  Icon(leading, null, Modifier.size(SplitButtonDefaults.leadingButtonIconSizeFor(height)))
                  Spacer(Modifier.size(ButtonDefaults.IconSpacing))
                  Text(label)
                }
              },
              trailingButton = {
                Box {
                  SplitButtonDefaults.TonalTrailingButton(
                    checked = open,
                    onCheckedChange = { open = nextMenuOpen(open, enabled, items.size) },
                    enabled = enabled && items.isNotEmpty(),
                    colors = colors,
                    modifier = Modifier.testTag("$testPrefix-menu").semantics { contentDescription = menuLabel },
                  ) {
                    Icon(
                      chevron,
                      null,
                      Modifier.size(SplitButtonDefaults.trailingButtonIconSizeFor(height)).graphicsLayer { rotationZ = turn },
                    )
                  }
                  DropdownMenuPopup(expanded = open, onDismissRequest = { open = false }) {
                    DropdownMenuGroup(shapes = MenuDefaults.groupShape(0, 1)) {
                      items.forEachIndexed { index, item ->
                        val icon = remember(item.path) { vector(item.path) }
                        DropdownMenuItem(
                          onClick = {
                            open = false
                            onPick(mapOf("key" to item.key))
                          },
                          text = { Text(item.label) },
                          shape = MenuDefaults.itemShape(index, items.size).shape,
                          leadingIcon = { Icon(icon, null) },
                          modifier = Modifier.testTag("$testPrefix-${item.key}"),
                        )
                      }
                    }
                  }
                }
              },
            )
          }
        }
      }
    }, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }
}

private fun vector(path: String): ImageVector =
  ImageVector.Builder("SplitButton", 24.dp, 24.dp, 24f, 24f)
    .addPath(pathData = addPathNodes(path), fill = SolidColor(Color.Black))
    .build()

private fun color(value: String, fallback: Color): Color =
  cssColor(value)?.let { Color(it) } ?: fallback
