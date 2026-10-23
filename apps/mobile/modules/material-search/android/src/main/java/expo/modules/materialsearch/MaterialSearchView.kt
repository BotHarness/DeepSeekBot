@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package expo.modules.materialsearch

import android.content.Context
import android.graphics.Color as AndroidColor
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class MaterialSearchView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  val onQueryChange by EventDispatcher()
  val onFocusChange by EventDispatcher()
  val onClose by EventDispatcher()
  val onSubmit by EventDispatcher()
  var maxLength = 0
  var query = ""
  var acknowledged = 0
  private val edits = SearchQuery()
  private var text by mutableStateOf("")
  var placeholder by mutableStateOf("")
  var autoFocus by mutableStateOf(false)
  var closable by mutableStateOf(false)
  var dark by mutableStateOf(false)
  var foreground by mutableStateOf("")
  var surface by mutableStateOf("")
  var accent by mutableStateOf("")
  var closeLabel by mutableStateOf("")
  var clearLabel by mutableStateOf("")

  fun synchronizeQuery() {
    // Ignore delayed JS echoes while the native IME already holds a newer edit.
    edits.acknowledge(query, acknowledged)
    if (edits.value != text) text = edits.value
  }

  private fun edit(value: String) {
    // InputField owns IME selection/composition; only query changes cross the bridge.
    edits.edit(value, maxLength)
    text = edits.value
    onQueryChange(mapOf("value" to text, "eventCount" to edits.eventCount))
  }

  init {
    addView(ComposeView(context).apply {
      setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
      setContent {
        val scheme = if (dark) darkColorScheme() else lightColorScheme()
        val colors = scheme.copy(
          primary = color(accent, scheme.primary),
          onSurface = color(foreground, scheme.onSurface),
          onSurfaceVariant = color(foreground, scheme.onSurfaceVariant),
          surface = color(surface, scheme.surface),
          surfaceContainerHigh = color(surface, scheme.surfaceContainerHigh),
        )
        MaterialTheme(colorScheme = colors) {
          val requester = remember { FocusRequester() }
          val searchState = rememberSearchBarState()
          val focus = LocalFocusManager.current
          val keyboard = LocalSoftwareKeyboardController.current
          var focused by remember { mutableStateOf(false) }
          val close = {
            onClose(emptyMap<String, Any>())
            keyboard?.hide()
            focus.clearFocus()
          }
          BackHandler(enabled = focused || closable) {
            if (closable) close() else {
              keyboard?.hide()
              focus.clearFocus()
            }
          }
          LaunchedEffect(autoFocus) {
            if (autoFocus) {
              requester.requestFocus()
              keyboard?.show()
            }
          }
          // Results stay in the screen's existing virtualized list. The native search
          // bar is deliberately inline, rather than expanding an empty results overlay.
          SearchBar(
            state = searchState,
            modifier = Modifier.fillMaxWidth().semantics { testTagsAsResourceId = true },
            inputField = {
              SearchBarDefaults.InputField(
                query = text,
                onQueryChange = ::edit,
                onSearch = {
                  onSubmit(mapOf("value" to text))
                  keyboard?.hide()
                  focus.clearFocus()
                },
                expanded = false,
                onExpandedChange = {},
                placeholder = { Text(placeholder) },
                leadingIcon = {
                  if (closable) {
                    IconButton(onClick = close, modifier = Modifier.testTag("search-close")) { Icon(backIcon, closeLabel) }
                  } else Icon(searchIcon, null)
                },
                trailingIcon = {
                  if (text.isNotEmpty()) {
                    IconButton(onClick = { edit("") }, modifier = Modifier.testTag("search-clear")) { Icon(clearIcon, clearLabel) }
                  }
                },
                modifier = Modifier.focusRequester(requester)
                  .semantics { contentDescription = placeholder }
                  .onFocusChanged {
                    if (focused != it.isFocused) {
                      focused = it.isFocused
                      onFocusChange(mapOf("focused" to focused))
                    }
                  },
              )
            },
          )
        }
      }
    }, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }
}

private fun color(value: String, fallback: Color): Color =
  if (value.isEmpty()) fallback else Color(AndroidColor.parseColor(value))

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
