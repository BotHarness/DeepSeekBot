package expo.modules.streamreveal

// Paint-only growth: React/Yoga always retains the final measured content height.
internal class SurfaceGrowth {
  private var from = 0f
  private var target = 0f
  private var started = 0L
  var duration = 120L

  fun value(now: Long): Float {
    val fraction = ((now - started).toFloat() / duration.coerceAtLeast(1)).coerceIn(0f, 1f)
    return from + (target - from) * fraction
  }

  fun resize(height: Int, now: Long, animate: Boolean) {
    val previous = value(now)
    target = height.toFloat()
    from = if (animate && previous > 0f && target > previous) previous else target
    started = now
  }

  fun finish() { from = target }
  fun pending(now: Long) = value(now) < target
}
