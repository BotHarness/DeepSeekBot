package expo.modules.speakeranchor

import android.content.Context
import android.graphics.RectF
import android.view.View
import android.view.ViewTreeObserver
import com.facebook.react.uimanager.util.ReactFindViewUtil
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference

class SpeakerAnchorView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var rest = 0f
  var span = 0f
  var floor = 0f
  var viewportId = ""
    set(value) {
      if (field != value) viewport = null
      field = value
    }
  private var viewport: WeakReference<View>? = null
  private val own = RectF()
  private val frame = RectF()
  private val listener = ViewTreeObserver.OnPreDrawListener {
    place()
    true
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(listener)
    place()
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(listener)
    viewport = null
    super.onDetachedFromWindow()
  }

  private fun findViewport(): View? {
    viewport?.get()?.takeIf { it.isAttachedToWindow }?.let { return it }
    if (viewportId.isEmpty()) return null
    val found = ReactFindViewUtil.findView(rootView, viewportId) ?: return null
    viewport = WeakReference(found)
    return found
  }

  fun place() {
    if (!isAttachedToWindow || height == 0) return
    val target = findViewport() ?: return
    val density = resources.displayMetrics.density
    SpeakerGeometry.windowRect(this, false, own)
    SpeakerGeometry.windowRect(target, true, frame)
    val offset = SpeakerGeometry.offset(
      top = own.top - frame.top,
      height = height.toFloat(),
      rest = rest * density,
      span = span * density,
      floor = frame.height() - floor * density,
    )
    if (!offset.isFinite() || offset == translationY) return
    translationY = offset
  }
}
