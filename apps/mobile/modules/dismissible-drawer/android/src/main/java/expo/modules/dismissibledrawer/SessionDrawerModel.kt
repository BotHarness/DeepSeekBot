package expo.modules.dismissibledrawer

/** The strip of content that stays visible beside an open Session drawer. */
const val SESSION_GUTTER_DP = 56f

/** Blur radius of the content behind a fully open Session drawer (API 31+). */
const val SESSION_BLUR_DP = 12f

/** Opacity the content keeps behind a fully open Session drawer. */
const val SESSION_CONTENT_ALPHA = 0.5f

/** The Session drawer is nearly full width: the window minus a thin closing strip. */
fun sessionDrawerWidthDp(windowWidthDp: Float): Float =
  (windowWidthDp - SESSION_GUTTER_DP).coerceAtLeast(0f)

/** Content opacity for a drawer [progress] from 0 (closed) to 1 (open). */
fun sessionContentAlpha(progress: Float): Float =
  1f - (1f - SESSION_CONTENT_ALPHA) * progress.coerceIn(0f, 1f)
