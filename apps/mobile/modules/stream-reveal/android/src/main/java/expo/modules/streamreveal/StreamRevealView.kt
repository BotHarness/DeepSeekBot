package expo.modules.streamreveal

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.view.View
import android.view.ViewTreeObserver
import android.widget.TextView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

// Yoga and the existing React Text retain layout, selection and accessibility.
// During a huge active paragraph, draw the same child into a viewport-sized buffer.
// The viewport buffer bounds rasterization; the original TextView still draws its styles and spans.
class StreamRevealView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var active = false
  var duration = 180L
  var stagger = 72L
  var maxGlyphs = 48
  private var viewportBitmap: Bitmap? = null
  private val viewportBounds = Rect()
  private val nextViewportBounds = Rect()
  private var drawViewport = false
  private val updateViewport = ViewTreeObserver.OnPreDrawListener {
    val child = if (childCount == 1) getChildAt(0) as? TextView else null
    var next = active && scrollX == 0 && scrollY == 0 && child != null && child.height > resources.displayMetrics.heightPixels * 2 &&
      child.matrix.isIdentity && child.alpha == 1f && child.scrollX == 0 && child.scrollY == 0 &&
      child.animation == null && child.layerType == View.LAYER_TYPE_NONE &&
      child.clipBounds == null && !child.clipToOutline && child.elevation == 0f
    nextViewportBounds.setEmpty()
    if (next && !getLocalVisibleRect(nextViewportBounds)) nextViewportBounds.setEmpty()
    if (nextViewportBounds.width() > resources.displayMetrics.widthPixels ||
        nextViewportBounds.height() > resources.displayMetrics.heightPixels) {
      next = false
      nextViewportBounds.setEmpty()
    }
    if (next != drawViewport || nextViewportBounds != viewportBounds) {
      // Direct child.draw() does not update the child's hardware display list.
      if (drawViewport && !next) child?.invalidate()
      drawViewport = next
      if (!drawViewport) viewportBitmap = null
      viewportBounds.set(nextViewportBounds)
      invalidate()
    }
    true
  }

  override fun onDescendantInvalidated(child: View, target: View) {
    super.onDescendantInvalidated(child, target)
    if (drawViewport) invalidate()
  }

  override fun dispatchDraw(canvas: Canvas) {
    if (!drawViewport) {
      super.dispatchDraw(canvas)
      return
    }
    val child = getChildAt(0) ?: return
    if (viewportBounds.isEmpty || child.visibility != View.VISIBLE) return
    val w = viewportBounds.width()
    val h = resources.displayMetrics.heightPixels
    var bitmap = viewportBitmap
    if (bitmap == null || bitmap.width != w || bitmap.height != h) {
      bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      viewportBitmap = bitmap
    }
    bitmap.eraseColor(Color.TRANSPARENT)
    val software = Canvas(bitmap)
    software.clipRect(0, 0, w, viewportBounds.height())
    software.translate((child.left - viewportBounds.left).toFloat(), (child.top - viewportBounds.top).toFloat())
    child.draw(software)
    val saved = canvas.save()
    try {
      canvas.clipRect(viewportBounds)
      canvas.drawBitmap(bitmap, viewportBounds.left.toFloat(), viewportBounds.top.toFloat(), null)
    } finally {
      canvas.restoreToCount(saved)
    }
  }

  private val observers = mutableMapOf<TextView, TextReveal>()

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  fun sync() {
    if (!active || !isAttachedToWindow) {
      clear()
      return
    }
    for (index in 0 until childCount) {
      val child = getChildAt(index) as? TextView ?: continue
      if (!observers.containsKey(child)) {
        observers[child] = TextReveal(child, duration, stagger, maxGlyphs).also { it.attach() }
      }
    }
  }

  private fun clear() {
    observers.values.forEach { it.detach() }
    observers.clear()
  }

  override fun onViewAdded(child: View) {
    super.onViewAdded(child)
    sync()
  }

  override fun onViewRemoved(child: View) {
    if (child is TextView) observers.remove(child)?.detach()
    super.onViewRemoved(child)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(updateViewport)
    sync()
  }

  override fun onDetachedFromWindow() {
    clear()
    if (viewTreeObserver.isAlive) viewTreeObserver.removeOnPreDrawListener(updateViewport)
    drawViewport = false
    viewportBitmap = null
    viewportBounds.setEmpty()
    super.onDetachedFromWindow()
  }
}
