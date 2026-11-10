package expo.modules.latestanchor

import android.content.Context
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.RectF
import android.view.View
import android.view.ViewTreeObserver
import android.widget.ScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.viewevent.EventDispatcher
import kotlin.math.abs
import kotlin.math.roundToInt

class MessageTargetView(context: Context, app: AppContext) : ExpoView(context, app) {
  var request = ""
  var active = false
  var top = 0.0
  var bottom = 0.0
  private var completed: String? = null
  private var previous: String? = null
  private var stable = 0
  private val onPositioned by EventDispatcher()
  private var observer: ViewTreeObserver? = null
  private val draw = ViewTreeObserver.OnPreDrawListener { position(); true }

  override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(MeasureSpec.getSize(w), MeasureSpec.getSize(h))
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit

  private fun bounds(view: View): RectF {
    val matrix = Matrix()
    view.transformMatrixToGlobal(matrix)
    return RectF(0f, 0f, view.width.toFloat(), view.height.toFloat()).also { matrix.mapRect(it) }
  }

  internal fun position() {
    if (!active || !isAttachedToWindow || height <= 0 || width <= 0) { previous = null; stable = 0; return }
    if (completed == request) return
    var node = parent
    while (node != null && node !is ScrollView) node = node.parent
    val scroll = node as? ScrollView ?: return
    val viewport = bounds(scroll)
    val visible = Rect()
    scroll.getWindowVisibleDisplayFrame(visible)
    val density = resources.displayMetrics.density
    val start = maxOf(viewport.top, visible.top.toFloat()) + top.toFloat() * density
    val end = minOf(viewport.bottom, visible.bottom.toFloat()) - bottom.toFloat() * density
    if (end <= start) return
    val target = bounds(this)
    val desired = if (target.height() >= end - start) start else (start + end - target.height()) / 2f
    val matrix = Matrix()
    scroll.transformMatrixToGlobal(matrix)
    val vector = floatArrayOf(0f, 1f)
    matrix.mapVectors(vector)
    if (abs(vector[1]) < 0.001f) return
    val delta = (target.top - desired) / vector[1]
    val content = scroll.getChildAt(0) ?: return
    val maximum = maxOf(0, content.height - scroll.height + scroll.paddingTop + scroll.paddingBottom)
    val offset = (scroll.scrollY + delta).roundToInt().coerceIn(0, maximum)
    if (offset != scroll.scrollY) {
      scroll.scrollTo(scroll.scrollX, offset)
      previous = null
      stable = 0
      return
    }
    val geometry = "$request:${target.top}:${target.bottom}:$start:$end:$offset"
    stable = if (previous == geometry) stable + 1 else 0
    previous = geometry
    if (stable < 1) postInvalidateOnAnimation()
    if (stable >= 1 && target.bottom > start && target.top < end) {
      completed = request
      onPositioned(mapOf("request" to request))
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    observer = viewTreeObserver.also { it.addOnPreDrawListener(draw) }
  }
  override fun onDetachedFromWindow() {
    observer?.takeIf { it.isAlive }?.removeOnPreDrawListener(draw)
    observer = null
    previous = null
    stable = 0
    super.onDetachedFromWindow()
  }
}
