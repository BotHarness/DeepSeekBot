@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialfabmenu

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FloatingActionButtonMenu
import androidx.compose.material3.FloatingActionButtonMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleFloatingActionButton
import androidx.compose.material3.ToggleFloatingActionButtonDefaults
import androidx.compose.material3.ToggleFloatingActionButtonDefaults.animateIcon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class FabMenuItem : Record {
  @Field val key: String = ""
  @Field val label: String = ""
  @Field val path: String = ""
}

private const val ADD = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
private val MENU_INSET = 16.dp
private const val CLOSE =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"

class MaterialFabMenuView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  val onToggle by EventDispatcher()
  val onPick by EventDispatcher()
  var items by mutableStateOf<List<FabMenuItem>>(emptyList())
  var expanded by mutableStateOf(false)
  var available by mutableStateOf(true)
  var label by mutableStateOf("")
  var closeLabel by mutableStateOf("")
  var dark by mutableStateOf(false)
  var buttonContainer by mutableStateOf("")
  var buttonContent by mutableStateOf("")
  var itemContainer by mutableStateOf("")
  var itemContent by mutableStateOf("")
  var reduceMotion by mutableStateOf(false)

  private fun toggle() {
    val next = nextExpanded(expanded, available) ?: return
    expanded = next
    onToggle(mapOf("expanded" to next))
  }

  init {
    clipChildren = false
    clipToPadding = false
    addView(ComposeView(context).apply {
      setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
      setContent {
        val scheme = if (dark) darkColorScheme() else lightColorScheme()
        MaterialExpressiveTheme(
          colorScheme = scheme,
          motionScheme = if (reduceMotion) MotionScheme.standard() else MotionScheme.expressive(),
        ) {
          val add = remember { vector(ADD) }
          val close = remember { vector(CLOSE) }
          val closedContainer = color(buttonContainer, scheme.primaryContainer)
          val openContainer = color(itemContainer, scheme.primary)
          val closedContent = color(buttonContent, scheme.onPrimaryContainer)
          val openContent = color(itemContent, scheme.onPrimary)
          Box(
            modifier = Modifier.fillMaxSize().semantics { testTagsAsResourceId = true },
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
                  placeable.place(at.x, at.y)
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
                      contentDescription = if (expanded) closeLabel else label
                      stateDescription = if (expanded) "expanded" else "collapsed"
                    },
                  containerColor = ToggleFloatingActionButtonDefaults.containerColor(
                    initialColor = closedContainer,
                    finalColor = openContainer,
                  ),
                ) {
                  Icon(
                    if (fabGlyph(checkedProgress) == FabGlyph.Close) close else add,
                    contentDescription = null,
                    modifier = Modifier.animateIcon(
                      checkedProgress = { checkedProgress },
                      color = ToggleFloatingActionButtonDefaults.iconColor(
                        initialColor = closedContent,
                        finalColor = openContent,
                      ),
                    ),
                  )
                }
              },
            ) {
              items.forEach { item ->
                val icon = remember(item.path) { vector(item.path) }
                FloatingActionButtonMenuItem(
                  onClick = { if (available) onPick(mapOf("key" to item.key)) },
                  text = { Text(item.label) },
                  icon = { Icon(icon, contentDescription = null) },
                  modifier = Modifier.testTag("creation-${item.key}"),
                  containerColor = openContainer,
                  contentColor = openContent,
                )
              }
            }
          }
        }
      }
    }, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }
}

private fun vector(path: String): ImageVector =
  ImageVector.Builder("FabMenu", 24.dp, 24.dp, 24f, 24f)
    .addPath(pathData = addPathNodes(path), fill = SolidColor(Color.Black))
    .build()

private fun color(value: String, fallback: Color): Color =
  cssColor(value)?.let { Color(it) } ?: fallback
