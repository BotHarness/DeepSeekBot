package expo.modules.dismissibledrawer

import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.EditText
import android.widget.HorizontalScrollView
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs

class SessionDrawerContentGate(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var drawerSwipeEnabled = false
  var rtl = false

  private data class LeadingEdgeDrag(
    val scroller: View,
    val pointerId: Int,
    val x: Float,
    val y: Float,
    val openingDirection: Int,
  )

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
    val scroller = horizontalScrollerAt(event.rawX, event.rawY) ?: return null
    val openingDirection = if (rtl || layoutDirection == LAYOUT_DIRECTION_RTL) -1 else 1
    if (scroller.canScrollHorizontally(-openingDirection)) return null
    return LeadingEdgeDrag(scroller, event.getPointerId(0), event.x, event.y, openingDirection)
  }

  private fun horizontalScrollerAt(x: Float, y: Float): View? {
    var hit = topmostViewAt(this, x, y)
    while (hit != null && hit !== this) {
      if (hit is EditText) return null
      if (hit is HorizontalScrollView || hit.canScrollHorizontally(-1) || hit.canScrollHorizontally(1)) return hit
      hit = hit.parent as? View
    }
    return null
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
    return dx * drag.openingDirection > touchSlop && abs(dx) > abs(dy) &&
      drag.scroller.isShown && !drag.scroller.canScrollHorizontally(-drag.openingDirection)
  }
}

private fun topmostViewAt(view: View, x: Float, y: Float): View? {
  if (view.visibility != View.VISIBLE || view.alpha == 0f || !screenBounds(view).contains(x, y)) return null
  val pointerEvents = (view as? ReactPointerEventsView)?.pointerEvents ?: PointerEvents.AUTO
  if (pointerEvents == PointerEvents.NONE) return null
  if (view is ViewGroup && pointerEvents != PointerEvents.BOX_ONLY) {
    var hit: View? = null
    var hitZ = Float.NEGATIVE_INFINITY
    for (index in view.childCount - 1 downTo 0) {
      val child = view.getChildAt(index)
      if (child.z <= hitZ) continue
      val childHit = topmostViewAt(child, x, y) ?: continue
      hit = childHit
      hitZ = child.z
    }
    if (hit != null) return hit
  }
  return view.takeUnless { pointerEvents == PointerEvents.BOX_NONE }
}
