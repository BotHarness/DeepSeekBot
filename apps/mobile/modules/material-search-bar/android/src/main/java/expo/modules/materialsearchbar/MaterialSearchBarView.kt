@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialsearchbar

import android.view.View
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.SearchBarValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSearchBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import expo.modules.kotlin.views.ComposeProps
import expo.modules.kotlin.views.FunctionalComposableScope
import expo.modules.kotlin.views.OptimizedComposeProps
import expo.modules.ui.ModifierList
import expo.modules.ui.ModifierRegistry
import kotlinx.coroutines.launch

class SearchResult : Record {
  @Field val key: String = ""
  @Field val title: String = ""
  @Field val subtitle: String = ""
  @Field val initial: String = ""
  @Field val section: String = ""
  @Field val trailing: String = ""
}

@OptimizedComposeProps
data class SearchBarProps(
  val placeholder: String = "",
  val navigationLabel: String = "",
  val closeLabel: String = "",
  val clearLabel: String = "",
  val emptyText: String = "",
  val busy: Boolean = false,
  val results: List<SearchResult> = emptyList(),
  val modifiers: ModifierList = emptyList(),
) : ComposeProps

@OptimizedRecord
data class SearchBarQueryEvent(@Field val value: String = "") : Record

@OptimizedRecord
data class SearchBarExpandedEvent(@Field val expanded: Boolean = false) : Record

@OptimizedRecord
data class SearchBarPickEvent(@Field val key: String = "") : Record

private const val MENU = "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"
private const val SEARCH =
  "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
private const val BACK = "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
private const val CLEAR =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"

/**
 * The M3 search app bar and its full-screen search, placed inside `Host` so the pill, the search
 * window and the result avatars paint with the Host's seeded Material theme.
 */
@Composable
fun FunctionalComposableScope.SearchBarContent(
  props: SearchBarProps,
  onQueryChange: (String) -> Unit,
  onExpandedChange: (Boolean) -> Unit,
  onPick: (String) -> Unit,
  onNavigation: () -> Unit,
) {
  val text = rememberTextFieldState()
  val bar = rememberSearchBarState()
  val scope = rememberCoroutineScope()
  val menu = remember { vector(MENU) }
  val search = remember { vector(SEARCH) }
  val back = remember { vector(BACK, mirrored = true) }
  val clear = remember { vector(CLEAR) }
  val expanded = bar.currentValue == SearchBarValue.Expanded
  val attached = rememberAttached(view)
  val queryChanged by rememberUpdatedState(onQueryChange)
  val expandedChanged by rememberUpdatedState(onExpandedChange)
  LaunchedEffect(text) {
    snapshotFlow { text.text.toString() }.collect { queryChanged(it) }
  }
  LaunchedEffect(bar) {
    snapshotFlow { bar.currentValue == SearchBarValue.Expanded }.collect { open ->
      expandedChanged(open)
      if (clearsOnCollapse(open, text.text.toString())) text.clearText()
    }
  }
  // Host keeps its composition while React Native Screens detaches an inactive screen, so the
  // full-screen search window closes with its screen instead of staying over the next one.
  LaunchedEffect(attached) { if (!attached) bar.snapTo(0f) }
  val inputField = @Composable {
    SearchBarDefaults.InputField(
      textFieldState = text,
      searchBarState = bar,
      onSearch = {},
      modifier = Modifier.testTag("search-input"),
      placeholder = { Text(props.placeholder, maxLines = 1, overflow = TextOverflow.Ellipsis) },
      leadingIcon = {
        if (expanded) {
          IconButton(
            onClick = { scope.launch { bar.animateToCollapsed() } },
            modifier = Modifier.testTag("search-close"),
          ) { Icon(back, props.closeLabel) }
        } else Icon(search, null)
      },
      trailingIcon = {
        if (expanded && text.text.isNotEmpty()) {
          IconButton(onClick = { text.clearText() }, modifier = Modifier.testTag("search-clear")) {
            Icon(clear, props.clearLabel)
          }
        } else if (!expanded && props.busy) {
          CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
        }
      },
    )
  }
  AppBarWithSearch(
    state = bar,
    inputField = inputField,
    modifier = ModifierRegistry.applyModifiers(props.modifiers, appContext, composableScope, globalEventDispatcher)
      .fillMaxWidth()
      .semantics { testTagsAsResourceId = true },
    navigationIcon = {
      IconButton(
        onClick = onNavigation,
        modifier = Modifier.testTag("chats-view-button"),
      ) { Icon(menu, props.navigationLabel) }
    },
    colors = SearchBarDefaults.appBarWithSearchColors(
      appBarContainerColor = Color.Transparent,
      scrolledAppBarContainerColor = Color.Transparent,
    ),
    windowInsets = WindowInsets(0, 0, 0, 0),
  )
  if (attached) {
    ExpandedFullScreenSearchBar(state = bar, inputField = inputField) {
      if (showsEmpty(text.text.toString(), props.results.size)) {
        Text(
          props.emptyText,
          modifier = Modifier.padding(horizontal = 16.dp, vertical = 24.dp),
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      LazyColumn(modifier = Modifier.semantics { testTagsAsResourceId = true }) {
        props.results.forEach { result ->
          if (result.section.isNotEmpty()) {
            item(key = "section:${result.key}") {
              Text(
                result.section,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelLarge,
              )
            }
          }
          item(key = result.key) {
            SearchResultItem(result) {
              onPick(result.key)
              scope.launch { bar.animateToCollapsed() }
            }
          }
        }
      }
    }
  }
}

/** One search result row: initial avatar, title, optional subtitle and trailing time. */
@Composable
private fun SearchResultItem(result: SearchResult, onPick: () -> Unit) {
  val trailing: (@Composable () -> Unit)? =
    if (result.trailing.isEmpty()) null
    else {
      {
        Text(
          result.trailing,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          style = MaterialTheme.typography.labelSmall,
        )
      }
    }
  val subtitle: (@Composable () -> Unit)? =
    if (result.subtitle.isEmpty()) null
    else {
      { Text(result.subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis) }
    }
  ListItem(
    onClick = onPick,
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
    trailingContent = trailing,
    colors = ListItemDefaults.colors(
      containerColor = Color.Transparent,
      contentColor = MaterialTheme.colorScheme.onSurface,
    ),
  ) {
    Text(result.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
  }
}

/** Whether [view] is in a window: false while React Native Screens has detached its screen. */
@Composable
private fun rememberAttached(view: View): Boolean {
  var attached by remember { mutableStateOf(view.isAttachedToWindow) }
  DisposableEffect(view) {
    val listener = object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(v: View) { attached = true }
      override fun onViewDetachedFromWindow(v: View) { attached = false }
    }
    view.addOnAttachStateChangeListener(listener)
    attached = view.isAttachedToWindow
    onDispose { view.removeOnAttachStateChangeListener(listener) }
  }
  return attached
}

private fun vector(path: String, mirrored: Boolean = false): ImageVector =
  ImageVector.Builder("SearchBar", 24.dp, 24.dp, 24f, 24f, autoMirror = mirrored)
    .addPath(pathData = addPathNodes(path), fill = SolidColor(Color.Black))
    .build()
