package expo.modules.dismissibledrawer

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DismissibleDrawerSheet
import androidx.compose.material3.DismissibleNavigationDrawer
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import expo.modules.kotlin.views.ComposeProps
import expo.modules.kotlin.views.FunctionalComposableScope
import expo.modules.kotlin.views.OptimizedComposeProps
import expo.modules.ui.ModifierList
import expo.modules.ui.ModifierRegistry
import expo.modules.ui.UIComposableScope
import expo.modules.ui.isSlotWithName
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@OptimizedComposeProps
data class DismissibleDrawerProps(
  val open: Boolean = false,
  val gesturesEnabled: Boolean = true,
  val closeLabel: String = "",
  val modifiers: ModifierList = emptyList(),
) : ComposeProps

@OptimizedRecord
data class DrawerOpenChange(@Field val open: Boolean = false) : Record

/**
 * Compose `DismissibleNavigationDrawer` with two React Native slots, `panel` and `content`.
 * JavaScript owns `open`; the drawer reports each settled value back through [onOpenChange].
 * `DismissibleDrawerSheet(drawerState)` owns Back and predictive back while the panel is open.
 */
@Composable
fun FunctionalComposableScope.DismissibleDrawerContent(
  props: DismissibleDrawerProps,
  onOpenChange: (Boolean) -> Unit,
) {
  val drawerState = rememberDrawerState(if (props.open) DrawerValue.Open else DrawerValue.Closed)
  val reported = remember { mutableStateOf(props.open) }
  val scope = rememberCoroutineScope()
  val host = view

  LaunchedEffect(props.open) {
    reported.value = props.open
    try {
      when (drawerCommand(props.open, drawerState.targetValue == DrawerValue.Open)) {
        DrawerCommand.Open -> drawerState.open()
        DrawerCommand.Close -> drawerState.close()
        DrawerCommand.None -> Unit
      }
    } catch (_: CancellationException) {
      // A drag took the drawer over; it reports where it settles.
    }
  }

  LaunchedEffect(drawerState) {
    snapshotFlow { drawerState.currentValue == DrawerValue.Open }.collect { open ->
      settledReport(open, reported.value)?.let {
        reported.value = it
        onOpenChange(it)
      }
    }
  }

  // Once the drawer moves under the finger, keep React Native (its JS responder and
  // gesture-handler root) from taking the rest of the gesture.
  val claim = Modifier.pointerInput(drawerState) {
    awaitEachGesture {
      awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
      val start = drawerState.currentOffset
      var claimed = false
      do {
        val event = awaitPointerEvent(PointerEventPass.Final)
        if (!claimed && movedUnderFinger(start, drawerState.currentOffset)) {
          claimed = true
          host.parent?.requestDisallowInterceptTouchEvent(true)
        }
      } while (event.changes.any { it.pressed })
    }
  }

  BoxWithConstraints(
    ModifierRegistry.applyModifiers(props.modifiers, appContext, composableScope, globalEventDispatcher)
  ) {
    val panelWidth = panelWidthDp(maxWidth.value).dp
    DismissibleNavigationDrawer(
      drawerState = drawerState,
      gesturesEnabled = props.gesturesEnabled,
      modifier = claim,
      drawerContent = {
        DismissibleDrawerSheet(
          drawerState = drawerState,
          modifier = Modifier.width(panelWidth),
          windowInsets = WindowInsets(0, 0, 0, 0),
        ) {
          Box(Modifier.fillMaxSize()) {
            Children(UIComposableScope(boxScope = this), filter = { isSlotWithName(it, "panel") })
          }
        }
      },
    ) {
      Box(Modifier.fillMaxSize()) {
        Children(UIComposableScope(boxScope = this), filter = { isSlotWithName(it, "content") })
        if (drawerState.targetValue == DrawerValue.Open) {
          // Chats stays visible beside the panel; a tap on it closes the panel instead of
          // reaching the list. A drag still goes to the drawer, which cancels the tap.
          Box(
            Modifier.matchParentSize()
              .semantics {
                contentDescription = props.closeLabel
                role = Role.Button
                onClick {
                  scope.launch { drawerState.close() }
                  true
                }
              }
              .pointerInput(drawerState) {
                awaitEachGesture {
                  awaitFirstDown(requireUnconsumed = false)
                  if (waitForUpOrCancellation() != null) scope.launch { drawerState.close() }
                }
              }
          )
        }
      }
    }
  }
}
