package expo.modules.dismissibledrawer

import android.graphics.Color
import android.os.Build
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
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

/**
 * Compose Material 3 `ModalNavigationDrawer` for the phone's Session drawer, with two React
 * Native slots, `panel` and `content`. The drawer is nearly full width; its scrim closes it, and
 * `ModalDrawerSheet(drawerState)` owns Back and predictive back while it is open. The content
 * slides right, fades and blurs with the drawer's progress, after Claude's drawer. JavaScript owns
 * `open`; [onOpenChange] reports the drawer's target as soon as a drag or Back commits to it.
 */
@Composable
fun FunctionalComposableScope.SessionDrawerContent(
  props: SessionDrawerProps,
  onOpenChange: (Boolean) -> Unit,
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
    snapshotFlow { drawerState.targetValue == DrawerValue.Open }.collect { open ->
      settledReport(open, reported.value)?.let {
        reported.value = it
        onOpenChange(it)
      }
    }
  }

  // Once the drawer moves under the finger, keep React Native from taking the rest of the gesture.
  val host = view
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
    val panelWidth = sessionDrawerWidthDp(maxWidth.value).dp
    val panelPx = with(LocalDensity.current) { panelWidth.toPx() }
    val progress = { openProgress(drawerState.currentOffset, panelPx) }
    ModalNavigationDrawer(
      drawerState = drawerState,
      modifier = claim,
      gesturesEnabled = props.gesturesEnabled || drawerState.targetValue == DrawerValue.Open,
      scrimColor = DrawerDefaults.scrimColor,
      drawerContent = {
        ModalDrawerSheet(
          drawerState = drawerState,
          modifier = Modifier.width(panelWidth),
          drawerShape = RectangleShape,
          drawerContainerColor = props.containerColor.composeOrNull ?: DrawerDefaults.modalContainerColor,
          windowInsets = WindowInsets(0, 0, 0, 0),
        ) {
          Box(Modifier.fillMaxSize().graphicsLayer { alpha = progress() }) {
            Children(UIComposableScope(boxScope = this), filter = { isSlotWithName(it, "panel") })
          }
        }
      },
    ) {
      val blur =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          Modifier.blur((SESSION_BLUR_DP * progress()).dp)
        } else {
          Modifier
        }
      Box(
        Modifier.fillMaxSize()
          .graphicsLayer {
            translationX = progress() * panelPx
            alpha = sessionContentAlpha(progress())
          }
          .then(blur)
      ) {
        Children(UIComposableScope(boxScope = this), filter = { isSlotWithName(it, "content") })
      }
    }
  }
}
