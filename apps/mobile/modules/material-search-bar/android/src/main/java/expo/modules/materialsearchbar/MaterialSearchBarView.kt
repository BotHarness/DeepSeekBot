@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialsearchbar

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.input.clearText
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.AppBarWithSearch
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExpandedFullScreenSearchBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.SearchBarValue
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.rememberSearchBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.launch

class SearchResult : Record {
  @Field val key: String = ""
  @Field val title: String = ""
  @Field val subtitle: String = ""
  @Field val initial: String = ""
}

private const val MENU = "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"
private const val SEARCH =
  "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
private const val BACK = "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
private const val CLEAR =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"

class MaterialSearchBarView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  val onQueryChange by EventDispatcher()
  val onExpandedChange by EventDispatcher()
  val onPick by EventDispatcher()
  val onNavigation by EventDispatcher()
  var placeholder by mutableStateOf("")
  var navigationLabel by mutableStateOf("")
  var closeLabel by mutableStateOf("")
  var clearLabel by mutableStateOf("")
  var emptyText by mutableStateOf("")
  var busy by mutableStateOf(false)
  var results by mutableStateOf<List<SearchResult>>(emptyList())
  var dark by mutableStateOf(false)
  var surfaceContent by mutableStateOf("")
  var muted by mutableStateOf("")
  var surface by mutableStateOf("")
  var base by mutableStateOf("")
  var accent by mutableStateOf("")
  var accentContent by mutableStateOf("")

  init {
    addView(ComposeView(context).apply {
      setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
      setContent {
        val scheme = if (dark) darkColorScheme() else lightColorScheme()
        val colors = scheme.copy(
          primary = color(accent, scheme.primary),
          onPrimary = color(accentContent, scheme.onPrimary),
          onSurface = color(surfaceContent, scheme.onSurface),
          onSurfaceVariant = color(muted, scheme.onSurfaceVariant),
          surface = color(base, scheme.surface),
          surfaceContainerHigh = color(surface, scheme.surfaceContainerHigh),
          surfaceContainerHighest = color(surface, scheme.surfaceContainerHighest),
        )
        MaterialExpressiveTheme(colorScheme = colors) {
          val text = rememberTextFieldState()
          val bar = rememberSearchBarState()
          val scope = rememberCoroutineScope()
          val menu = remember { vector(MENU) }
          val search = remember { vector(SEARCH) }
          val back = remember { vector(BACK, mirrored = true) }
          val clear = remember { vector(CLEAR) }
          val expanded = bar.currentValue == SearchBarValue.Expanded
          LaunchedEffect(text) {
            snapshotFlow { text.text.toString() }.collect { onQueryChange(mapOf("value" to it)) }
          }
          LaunchedEffect(bar) {
            snapshotFlow { bar.currentValue == SearchBarValue.Expanded }.collect { open ->
              onExpandedChange(mapOf("expanded" to open))
              if (clearsOnCollapse(open, text.text.toString())) text.clearText()
            }
          }
          val inputField = @Composable {
            SearchBarDefaults.InputField(
              textFieldState = text,
              searchBarState = bar,
              onSearch = {},
              modifier = Modifier.testTag("search-input"),
              placeholder = { Text(placeholder, maxLines = 1, overflow = TextOverflow.Ellipsis) },
              leadingIcon = {
                if (expanded) {
                  IconButton(
                    onClick = { scope.launch { bar.animateToCollapsed() } },
                    modifier = Modifier.testTag("search-close"),
                  ) { Icon(back, closeLabel) }
                } else Icon(search, null)
              },
              trailingIcon = {
                if (expanded && text.text.isNotEmpty()) {
                  IconButton(onClick = { text.clearText() }, modifier = Modifier.testTag("search-clear")) {
                    Icon(clear, clearLabel)
                  }
                } else if (!expanded && busy) {
                  CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                }
              },
            )
          }
          AppBarWithSearch(
            state = bar,
            inputField = inputField,
            modifier = Modifier.fillMaxWidth().semantics { testTagsAsResourceId = true },
            navigationIcon = {
              IconButton(
                onClick = { onNavigation(emptyMap<String, Any>()) },
                modifier = Modifier.testTag("chats-view-button"),
              ) { Icon(menu, navigationLabel) }
            },
            colors = SearchBarDefaults.appBarWithSearchColors(
              appBarContainerColor = Color.Transparent,
              scrolledAppBarContainerColor = Color.Transparent,
            ),
            windowInsets = WindowInsets(0, 0, 0, 0),
          )
          ExpandedFullScreenSearchBar(state = bar, inputField = inputField) {
            if (showsEmpty(text.text.toString(), results.size)) {
              Text(
                emptyText,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 24.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
              )
            }
            LazyColumn(modifier = Modifier.semantics { testTagsAsResourceId = true }) {
              items(results, key = { it.key }) { result ->
                val subtitle: (@Composable () -> Unit)? =
                  if (result.subtitle.isEmpty()) null
                  else {
                    { Text(result.subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                  }
                ListItem(
                  onClick = {
                    onPick(mapOf("key" to result.key))
                    scope.launch { bar.animateToCollapsed() }
                  },
                  modifier = Modifier.testTag("search-result"),
                  leadingContent = {
                    Box(
                      modifier = Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
                      contentAlignment = Alignment.Center,
                    ) {
                      Text(
                        result.initial,
                        color = MaterialTheme.colorScheme.onPrimary,
                        style = MaterialTheme.typography.titleMedium,
                      )
                    }
                  },
                  supportingContent = subtitle,
                  colors = ListItemDefaults.colors(
                    containerColor = Color.Transparent,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                  ),
                ) {
                  Text(result.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
              }
            }
          }
        }
      }
    }, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }
}

private fun vector(path: String, mirrored: Boolean = false): ImageVector =
  ImageVector.Builder("SearchBar", 24.dp, 24.dp, 24f, 24f, autoMirror = mirrored)
    .addPath(pathData = addPathNodes(path), fill = SolidColor(Color.Black))
    .build()

private fun color(value: String, fallback: Color): Color =
  cssColor(value)?.let { Color(it) } ?: fallback
