package expo.modules.dismissibledrawer

/** The strip of content that stays visible beside an open Session drawer. */
const val SESSION_GUTTER_DP = 56f

/** The Session drawer is nearly full width: the window minus a thin closing strip. */
fun sessionDrawerWidthDp(windowWidthDp: Float): Float =
  (windowWidthDp - SESSION_GUTTER_DP).coerceAtLeast(0f)

/**
 * The value to report once the Session drawer stops moving, or null while it still animates or
 * when JavaScript already knows. An interrupted open that settles Closed never changes
 * `currentValue`, so the report is tied to the end of each animation, not to a value change.
 */
fun sessionSettledReport(animating: Boolean, settledOpen: Boolean, lastReported: Boolean): Boolean? =
  if (animating) null else settledReport(settledOpen, lastReported)

/** Report a new open fraction once it moves a visible step or reaches either end. */
fun progressChanged(last: Float, next: Float): Boolean =
  last < 0f || ((next == 0f || next == 1f) && next != last) || kotlin.math.abs(next - last) >= 0.01f
