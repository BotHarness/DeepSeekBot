package expo.modules.dismissibledrawer

import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.EditText
import android.widget.HorizontalScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs

class SessionDrawerContentGate(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var drawerSwipeEnabled = false
  var rtl = false

  private data class LeadingEdgeDrag(val pointerId: Int, val x: Float, val y: Float, val openingDirection: Int)

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var leadingEdgeDrag: LeadingEdgeDrag? = null

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL,
      MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_POINTER_UP -> leadingEdgeDrag = null
    }
    return super.dispatchTouchEvent(event)
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      leadingEdgeDrag = if (drawerSwipeEnabled) startLeadingEdgeDrag(event) else null
    }
    return (event.actionMasked == MotionEvent.ACTION_MOVE && interceptLeadingEdgeDrag(event)) ||
      super.onInterceptTouchEvent(event)
  }

  private fun startLeadingEdgeDrag(event: MotionEvent): LeadingEdgeDrag? {
    val target = horizontalScrollerAt(this, event.rawX, event.rawY) ?: return null
    val openingDirection = if (rtl) -1 else 1
    if (target.canScrollHorizontally(-openingDirection)) return null
    return LeadingEdgeDrag(event.getPointerId(0), event.x, event.y, openingDirection)
  }

  private fun interceptLeadingEdgeDrag(event: MotionEvent): Boolean {
    val drag = leadingEdgeDrag ?: return false
    val pointer = event.findPointerIndex(drag.pointerId)
    if (pointer < 0 || !drawerSwipeEnabled) {
      leadingEdgeDrag = null
      return false
    }
    val dx = event.getX(pointer) - drag.x
    val dy = event.getY(pointer) - drag.y
    if (maxOf(abs(dx), abs(dy)) <= touchSlop) return false
    leadingEdgeDrag = null
    return dx * drag.openingDirection > touchSlop && abs(dx) > abs(dy)
  }
}

private fun horizontalScrollerAt(view: View, x: Float, y: Float): View? {
  if (view.visibility != View.VISIBLE || view.alpha == 0f || !screenBounds(view).contains(x, y)) return null
  if (view is ViewGroup) {
    for (index in view.childCount - 1 downTo 0) {
      horizontalScrollerAt(view.getChildAt(index), x, y)?.let { return it }
    }
  }
  return view.takeIf {
    it is HorizontalScrollView || (it !is EditText && (it.canScrollHorizontally(-1) || it.canScrollHorizontally(1)))
  }
}
