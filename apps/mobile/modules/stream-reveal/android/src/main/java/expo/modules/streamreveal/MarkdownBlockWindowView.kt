package expo.modules.streamreveal

import android.content.Context
import android.graphics.Matrix
import android.graphics.RectF
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import android.view.accessibility.AccessibilityManager
import android.widget.ScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class MarkdownBlockWindowView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var eligible = false
  var placeholder = false
  private val onWindowChange by EventDispatcher()
  internal var hidden = false
    private set
  private var measuredWidth = 0
  private var measuredHeight = 0
  private val accessibility = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
  private var observer: ViewTreeObserver? = null
  private val preDraw = ViewTreeObserver.OnPreDrawListener { updateWindow(); true }
  private val accessibilityChanged = AccessibilityManager.AccessibilityStateChangeListener { updateWindow() }
  private val matrix = Matrix()
  private val blockBounds = RectF()
  private val viewportBounds = RectF()

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  private fun globalBounds(view: View, bounds: RectF) {
    bounds.set(0f, 0f, view.width.toFloat(), view.height.toFloat())
    matrix.reset()
    view.transformMatrixToGlobal(matrix)
    matrix.mapRect(bounds)
  }

  internal fun updateWindow() {
    if (!isAttachedToWindow) return
    if (!placeholder && !hidden && width > 0 && height > 0 && childCount > 0) {
      measuredWidth = width
      measuredHeight = height
    }
    if (!eligible || accessibility.isEnabled || Build.VERSION.SDK_INT < 29) {
      report(false)
      return
    }
    var ancestor = parent
    while (ancestor != null && ancestor !is ScrollView && !(ancestor is View && ancestor.isScrollContainer)) ancestor = ancestor.parent
    val scroll = ancestor as? View
    if (scroll == null || measuredWidth <= 0 || measuredHeight <= 0 || scroll.height <= 0) {
      report(false)
      return
    }
    globalBounds(this, blockBounds)
    globalBounds(scroll, viewportBounds)
    val overscan = viewportBounds.height() * 2f
    val outside = blockBounds.bottom < viewportBounds.top - overscan ||
      blockBounds.top > viewportBounds.bottom + overscan
    report(outside)
  }

  private fun report(next: Boolean) {
    if (hidden == next) return
    hidden = next
    val density = resources.displayMetrics.density
    onWindowChange(mapOf(
      "hidden" to next,
      "width" to measuredWidth / density,
      "height" to measuredHeight / density,
    ))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    observer = viewTreeObserver.also { it.addOnPreDrawListener(preDraw) }
    accessibility.addAccessibilityStateChangeListener(accessibilityChanged)
  }

  override fun onDetachedFromWindow() {
    observer?.takeIf { it.isAlive }?.removeOnPreDrawListener(preDraw)
    observer = null
    accessibility.removeAccessibilityStateChangeListener(accessibilityChanged)
    super.onDetachedFromWindow()
  }
}
