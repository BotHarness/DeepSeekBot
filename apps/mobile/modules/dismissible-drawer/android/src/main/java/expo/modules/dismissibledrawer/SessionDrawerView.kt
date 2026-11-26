package expo.modules.dismissibledrawer

import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DrawerDefaults
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
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
import expo.modules.ui.composeOrNull
import expo.modules.ui.isSlotWithName
import kotlinx.coroutines.CancellationException

@OptimizedComposeProps
data class SessionDrawerProps(
  val open: Boolean = false,
  val gesturesEnabled: Boolean = true,
  val containerColor: Color? = null,
  val modifiers: ModifierList = emptyList(),
) : ComposeProps

@OptimizedRecord
data class SessionDrawerChange(@Field val open: Boolean = false) : Record

@OptimizedRecord
data class SessionDrawerProgress(@Field val progress: Float = 0f) : Record

/**
 * Compose Material 3 `ModalNavigationDrawer` for the phone's Session drawer (#5255), wrapped
 * around the React Native Sessions stack: `content` holds the stack and `panel` the drawer
 * contents. The drawer owns the open and close gesture and motion. A horizontal drag anywhere on
 * the stack opens it while [SessionDrawerProps.gesturesEnabled]; the panel slides in over the
 * stack, which stays still under the M3 scrim, and a scrim tap or a drag back closes it.
 * JavaScript owns `open` and holds Back while the drawer is open; [onOpenChange] reports each
 * value the drawer settles at and [onProgress] streams its open fraction for the tab bar fade.
 */
@Composable
fun FunctionalComposableScope.SessionDrawerContent(
  props: SessionDrawerProps,
  onOpenChange: (Boolean) -> Unit,
  onProgress: (Float) -> Unit,
) {
  val drawerState = rememberDrawerState(if (props.open) DrawerValue.Open else DrawerValue.Closed)
  val reported = remember { mutableStateOf(props.open) }

  LaunchedEffect(props.open) {
    reported.value = props.open
    try {
      when (drawerCommand(props.open, drawerState.targetValue == DrawerValue.Open)) {
        DrawerCommand.Open -> drawerState.open()
        DrawerCommand.Close -> drawerState.close()
        DrawerCommand.None -> Unit
      }
    } catch (_: CancellationException) {
      // A drag took the drawer over; it reports where it is going.
    }
  }

  LaunchedEffect(drawerState) {
    snapshotFlow { drawerState.isAnimationRunning to (drawerState.currentValue == DrawerValue.Open) }
      .collect { (running, open) ->
        sessionSettledReport(running, open, reported.value)?.let {
          reported.value = it
          onOpenChange(it)
        }
      }
  }

  // A swipe that starts on a horizontal scroller which can still scroll back belongs to it: the
  // drawer stays off until the finger lifts. At the scroller's leading edge the drawer wins (#5463).
  val yielded = remember { mutableStateOf(false) }
  val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
  val placed = remember { mutableStateOf(Offset.Zero) }

  // Once the drawer moves under the finger, keep React Native from taking the rest of the gesture.
  val host = view
  val claim = Modifier.pointerInput(drawerState, rtl) {
    awaitEachGesture {
      val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
      if (drawerState.currentValue == DrawerValue.Closed && !drawerState.isAnimationRunning) {
        // The React Native views sit in Compose's interop layer, not under this view: search the
        // window, from the drawer's place in it.
        val root = host.rootView
        val window = IntArray(2).also(root::getLocationOnScreen)
        val x = window[0] + placed.value.x + down.position.x
        val y = window[1] + placed.value.y + down.position.y
        yielded.value = scrollsBack(root, x, y, rtl)
      }
      val start = drawerState.currentOffset
      var claimed = false
      try {
        do {
          val event = awaitPointerEvent(PointerEventPass.Final)
          if (!claimed && movedUnderFinger(start, drawerState.currentOffset)) {
            claimed = true
            host.parent?.requestDisallowInterceptTouchEvent(true)
          }
        } while (event.changes.any { it.pressed })
      } finally {
        yielded.value = false
      }
    }
  }

  BoxWithConstraints(
    ModifierRegistry.applyModifiers(props.modifiers, appContext, composableScope, globalEventDispatcher)
  ) {
    val panelWidth = sessionDrawerWidthDp(maxWidth.value).dp
    val panelPx = with(LocalDensity.current) { panelWidth.toPx() }
    LaunchedEffect(drawerState, panelPx) {
      var last = -1f
      snapshotFlow { openProgress(drawerState.currentOffset, panelPx) }.collect { progress ->
        if (progressChanged(last, progress)) {
          last = progress
          onProgress(progress)
        }
      }
    }
    ModalNavigationDrawer(
      drawerState = drawerState,
      modifier = claim.onGloballyPositioned { placed.value = it.positionInWindow() },
      gesturesEnabled = !yielded.value &&
        (props.gesturesEnabled || drawerState.targetValue == DrawerValue.Open),
      scrimColor = DrawerDefaults.scrimColor,
      drawerContent = {
        // No drawerState here: its predictive Back handler would take Back from the React Native
        // callback that JavaScript holds while the drawer is open, and JavaScript closes it.
        ModalDrawerSheet(
          modifier = Modifier.width(panelWidth),
          drawerShape = RectangleShape,
          drawerContainerColor = props.containerColor.composeOrNull ?: DrawerDefaults.modalContainerColor,
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
      }
    }
  }
}

/**
 * Whether a horizontal scroller under ([x], [y]) on screen can still scroll toward the leading
 * edge, so a wide code block or table keeps a swipe it can scroll back. Mirrors `scrollsBack` in
 * the iOS `SessionDrawerModule.swift`.
 */
internal fun scrollsBack(view: View, x: Float, y: Float, rtl: Boolean): Boolean {
  if (!view.isShown || !screenBounds(view).contains(x, y)) return false
  if (view.canScrollHorizontally(if (rtl) 1 else -1)) return true
  if (view is ViewGroup) {
    for (i in view.childCount - 1 downTo 0) if (scrollsBack(view.getChildAt(i), x, y, rtl)) return true
  }
  return false
}
