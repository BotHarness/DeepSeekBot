package expo.modules.latestanchor

/**
 * Swipe-to-reply thresholds in logical pixels, matching reply-swipe-model.ts: the row follows the
 * finger up to [reach], then at a quarter of the speed, and a release past [commit] replies.
 */
data class ReplySwipe(val start: Float, val backFail: Float, val verticalFail: Float, val commit: Float, val reach: Float) {
  fun travel(x: Float): Float = when {
    x <= 0f -> 0f
    x <= reach -> x
    else -> reach + (x - reach) / 4f
  }
  fun replies(x: Float) = x >= commit

  /** What a move of ([dx], [dy]) from touch-down, already turned toward the reply side, means. */
  fun classify(dx: Float, dy: Float): Intent = when {
    kotlin.math.abs(dy) > verticalFail || -dx > backFail -> Intent.CANCEL
    dx >= start -> Intent.SWIPE
    else -> Intent.WAIT
  }

  enum class Intent { WAIT, SWIPE, CANCEL }
}
