package expo.modules.streamreveal

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.SystemClock
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class StreamSurfaceView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var active = false
  var duration = 120L
  var surfaceColor = 0
  var corners = listOf(0.0, 0.0, 0.0, 0.0)
  private val growth = SurfaceGrowth()
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val path = Path()
  private val bounds = RectF()
  private val radii = FloatArray(8)

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  // Fabric owns the child bounds; a paint tick must never measure or lay them out.
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    growth.duration = duration
    growth.resize(h, SystemClock.uptimeMillis(), active && w == oldw && oldh > 0)
    invalidate()
  }

  override fun dispatchDraw(canvas: Canvas) {
    val now = SystemClock.uptimeMillis()
    if (!active) growth.finish()
    bounds.set(0f, 0f, width.toFloat(), growth.value(now))
    val density = resources.displayMetrics.density
    for (i in 0..3) {
      val radius = (corners.getOrElse(i) { 0.0 }.toFloat() * density).coerceAtLeast(0f)
      radii[i * 2] = radius
      radii[i * 2 + 1] = radius
    }
    path.reset()
    path.addRoundRect(bounds, radii, Path.Direction.CW)
    paint.color = surfaceColor
    canvas.drawPath(path, paint)
    val saved = canvas.save()
    try {
      canvas.clipPath(path)
      super.dispatchDraw(canvas)
    } finally {
      canvas.restoreToCount(saved)
    }
    if (active && growth.pending(now)) postInvalidateOnAnimation()
  }

  override fun onDetachedFromWindow() {
    growth.finish()
    super.onDetachedFromWindow()
  }
}
