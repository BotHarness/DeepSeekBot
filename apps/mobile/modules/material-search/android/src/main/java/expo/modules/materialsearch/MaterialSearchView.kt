@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package expo.modules.materialsearch

import android.view.View
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DockedSearchBar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
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

@OptimizedComposeProps
data class SearchProps(
  val query: String = "",
  val maxLength: Int = 0,
  val eventCount: Int = 0,
  val placeholder: String = "",
  val autoFocus: Boolean = false,
  val closable: Boolean = false,
  val closeLabel: String = "",
  val clearLabel: String = "",
  val modifiers: ModifierList = emptyList(),
) : ComposeProps

@OptimizedRecord
data class QueryChangeEvent(@Field val value: String = "", @Field val eventCount: Int = 0) : Record

@OptimizedRecord
data class FocusChangeEvent(@Field val focused: Boolean = false) : Record

@OptimizedRecord
data class SubmitEvent(@Field val value: String = "") : Record

/**
 * The editable docked M3 search field, placed inside `Host` so its container, text and icons come
 * from the Host's seeded Material theme.
 */
@Composable
fun FunctionalComposableScope.SearchContent(
  props: SearchProps,
  onQueryChange: (QueryChangeEvent) -> Unit,
  onFocusChange: (Boolean) -> Unit,
  onClose: () -> Unit,
  onSubmit: (String) -> Unit,
) {
  val edits = remember { SearchQuery() }
  var text by remember { mutableStateOf(props.query) }
  // Ignore delayed JS echoes while the native IME already holds a newer edit.
  LaunchedEffect(props.query, props.eventCount) {
    edits.acknowledge(props.query, props.eventCount)
    if (edits.value != text) text = edits.value
  }
  val edit = { value: String ->
    // InputField owns IME selection/composition; only query changes cross the bridge.
    edits.edit(value, props.maxLength)
    text = edits.value
    onQueryChange(QueryChangeEvent(text, edits.eventCount))
  }
  val attached = rememberAttached(view)
  val requester = remember { FocusRequester() }
  val focus = LocalFocusManager.current
  val keyboard = LocalSoftwareKeyboardController.current
  var focused by remember { mutableStateOf(false) }
  val close = {
    onClose()
    keyboard?.hide()
    focus.clearFocus()
  }
  // Host keeps its composition while React Native Screens detaches an inactive screen,
  // so a hidden screen's search must not take Back.
  BackHandler(enabled = attached && (focused || props.closable)) {
    if (props.closable) close() else {
      keyboard?.hide()
      focus.clearFocus()
    }
  }
  LaunchedEffect(props.autoFocus) {
    if (props.autoFocus) {
      requester.requestFocus()
      keyboard?.show()
    }
  }
  // Results stay in the screen's existing virtualized list. The native search
  // bar is deliberately inline, rather than expanding an empty results overlay.
  DockedSearchBar(
    expanded = false,
    onExpandedChange = {},
    modifier = ModifierRegistry.applyModifiers(props.modifiers, appContext, composableScope, globalEventDispatcher)
      .fillMaxWidth()
      .semantics { testTagsAsResourceId = true },
    inputField = {
      SearchBarDefaults.InputField(
        query = text,
        onQueryChange = edit,
        onSearch = {
          onSubmit(text)
          keyboard?.hide()
          focus.clearFocus()
        },
        expanded = false,
        onExpandedChange = {},
        placeholder = { Text(props.placeholder) },
        leadingIcon = {
          if (props.closable) {
            IconButton(onClick = close, modifier = Modifier.testTag("search-close")) { Icon(backIcon, props.closeLabel) }
          } else Icon(searchIcon, null)
        },
        trailingIcon = {
          if (text.isNotEmpty()) {
            IconButton(onClick = { edit("") }, modifier = Modifier.testTag("search-clear")) { Icon(clearIcon, props.clearLabel) }
          }
        },
        modifier = Modifier.focusRequester(requester)
          .semantics { contentDescription = props.placeholder }
          .onFocusChanged {
            if (focused != it.isFocused) {
              focused = it.isFocused
              onFocusChange(focused)
            }
          },
      )
    },
  ) {}
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

private val searchIcon = ImageVector.Builder("Search", 24.dp, 24.dp, 24f, 24f).apply {
  path(fill = androidx.compose.ui.graphics.SolidColor(Color.Black)) {
    moveTo(9.5f, 3f); curveTo(5.91f, 3f, 3f, 5.91f, 3f, 9.5f)
    reflectiveCurveTo(5.91f, 16f, 9.5f, 16f)
    curveTo(11.11f, 16f, 12.59f, 15.41f, 13.73f, 14.43f)
    lineTo(19.49f, 20.19f); lineTo(20.9f, 18.78f); lineTo(15.14f, 13.02f)
    curveTo(15.69f, 12f, 16f, 10.79f, 16f, 9.5f)
    curveTo(16f, 5.91f, 13.09f, 3f, 9.5f, 3f); close()
    moveTo(9.5f, 5f); curveTo(11.99f, 5f, 14f, 7.01f, 14f, 9.5f)
    reflectiveCurveTo(11.99f, 14f, 9.5f, 14f)
    reflectiveCurveTo(5f, 11.99f, 5f, 9.5f)
    reflectiveCurveTo(7.01f, 5f, 9.5f, 5f); close()
  }
}.build()
private val backIcon = ImageVector.Builder("Back", 24.dp, 24.dp, 24f, 24f, autoMirror = true).apply {
  path(fill = androidx.compose.ui.graphics.SolidColor(Color.Black)) {
    moveTo(20f, 11f); lineTo(7.83f, 11f); lineTo(13.42f, 5.41f)
    lineTo(12f, 4f); lineTo(4f, 12f); lineTo(12f, 20f); lineTo(13.42f, 18.59f)
    lineTo(7.83f, 13f); lineTo(20f, 13f); close()
  }
}.build()
private val clearIcon = ImageVector.Builder("Clear", 24.dp, 24.dp, 24f, 24f).apply {
  path(fill = androidx.compose.ui.graphics.SolidColor(Color.Black)) {
    moveTo(19f, 6.41f); lineTo(17.59f, 5f); lineTo(12f, 10.59f)
    lineTo(6.41f, 5f); lineTo(5f, 6.41f); lineTo(10.59f, 12f)
    lineTo(5f, 17.59f); lineTo(6.41f, 19f); lineTo(12f, 13.41f)
    lineTo(17.59f, 19f); lineTo(19f, 17.59f); lineTo(13.41f, 12f); close()
  }
}.build()
