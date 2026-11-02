package expo.modules.dismissibledrawer

import kotlin.math.abs

/** Material's maximum navigation drawer width. */
const val PANEL_MAX_WIDTH_DP = 360f

/** The strip of Chats that stays on screen beside an open panel, as on a launcher -1 screen. */
const val CONTENT_GUTTER_DP = 56f

/** Offset change, in px, that counts as the drawer moving under the finger. */
const val DRAG_EPSILON_PX = 0.5f

fun panelWidthDp(windowWidthDp: Float): Float =
  minOf(PANEL_MAX_WIDTH_DP, (windowWidthDp - CONTENT_GUTTER_DP).coerceAtLeast(0f))

enum class DrawerCommand { Open, Close, None }

/** What the drawer has to do so it ends where JavaScript asked. */
fun drawerCommand(requested: Boolean, targetOpen: Boolean): DrawerCommand =
  when {
    requested == targetOpen -> DrawerCommand.None
    requested -> DrawerCommand.Open
    else -> DrawerCommand.Close
  }

/** The value to report to JavaScript once the drawer settles, or null when it already knows. */
fun settledReport(settledOpen: Boolean, lastReported: Boolean): Boolean? =
  if (settledOpen == lastReported) null else settledOpen

/** 0 when closed, 1 when open. The drawer offset runs from -width (closed) to 0 (open). */
fun openProgress(offset: Float, width: Float): Float =
  if (offset.isNaN() || width <= 0f) 0f else (1f + offset / width).coerceIn(0f, 1f)

/**
 * Whether the drawer moved during a touch that started at [start]. Before the first layout the
 * offset is NaN, which never counts as movement.
 */
fun movedUnderFinger(start: Float, now: Float): Boolean =
  !start.isNaN() && !now.isNaN() && abs(now - start) > DRAG_EPSILON_PX
