package expo.modules.latestanchor

import android.content.Context
import android.provider.Settings
import android.view.Choreographer
import android.view.View
import android.widget.ScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference
import kotlin.math.roundToInt

class LatestAnchorView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext), Choreographer.FrameCallback {
  var following = true
    set(value) {
      field = value
      if (!value) stop()
    }
  var animated = true
  private var scroller: WeakReference<ScrollView>? = null
  private var content: WeakReference<View>? = null
  private var running = false
  private var position = 0f
  private var velocity = 0f
  private var stamp = 0L
  private var expected = -1
  private val change = View.OnLayoutChangeListener { _, _, top, _, bottom, _, oldTop, _, oldBottom ->
    if (bottom - top > oldBottom - oldTop) grew()
  }

  val gliding: Boolean
    get() = running

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), 0)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attach()
  }

  override fun onDetachedFromWindow() {
    detach()
    super.onDetachedFromWindow()
  }

  private fun attach() {
    detach()
    var node = parent
    while (node != null && node !is ScrollView) node = node.parent
    val scroll = node as? ScrollView ?: return
    val inner = scroll.getChildAt(0) ?: return
    scroller = WeakReference(scroll)
    content = WeakReference(inner)
    inner.addOnLayoutChangeListener(change)
  }

  private fun detach() {
    stop()
    content?.get()?.removeOnLayoutChangeListener(change)
    content = null
    scroller = null
  }

  fun grew() {
    if (!following || running) return
    running = true
    velocity = 0f
    stamp = 0L
    expected = -1
    Choreographer.getInstance().postFrameCallback(this)
  }

  fun stop() {
    if (running) Choreographer.getInstance().removeFrameCallback(this)
    running = false
    velocity = 0f
    expected = -1
  }

  private fun motion(): Boolean {
    if (!animated) return false
    val scale = Settings.Global.getFloat(
      context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
    return scale > 0f
  }

  override fun doFrame(frameTimeNanos: Long) {
    if (!running) return
    val scroll = scroller?.get()
    if (scroll == null || !following || (expected >= 0 && scroll.scrollY != expected)) {
      stop()
      return
    }
    if (expected < 0) position = scroll.scrollY.toFloat()
    if (position <= 0f && velocity == 0f) {
      stop()
      return
    }
    if (!motion()) {
      scroll.scrollTo(scroll.scrollX, 0)
      stop()
      return
    }
    val dt = if (stamp == 0L) 1f / 60f else ((frameTimeNanos - stamp) / 1e9f).coerceIn(0f, 1f / 30f)
    stamp = frameTimeNanos
    val next = LatestSpring.step(position, velocity, 0f, LatestSpring.STIFFNESS, dt)
    if (LatestSpring.settled(next.position, next.velocity, 0f)) {
      scroll.scrollTo(scroll.scrollX, 0)
      stop()
      return
    }
    position = next.position
    velocity = next.velocity
    scroll.scrollTo(scroll.scrollX, position.roundToInt())
    expected = scroll.scrollY
    Choreographer.getInstance().postFrameCallback(this)
  }
}
