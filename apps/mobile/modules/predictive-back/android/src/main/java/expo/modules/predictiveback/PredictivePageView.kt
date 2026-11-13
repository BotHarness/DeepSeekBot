package expo.modules.predictiveback

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.os.Build
import android.view.View
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/** Paints the current route over the real retained preceding route; JS alone owns the pop. */
class PredictivePageView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val page = FrameLayout(context)
  private val slots = mutableListOf<View>()
  private val onBack by EventDispatcher()
  private var callback: OnBackInvokedCallback? = null
  private var animator: ValueAnimator? = null
  private var active = false
  private var ime = false
  private var tracking = false
  private var committed = false
  var reducedMotion = false

  init {
    addView(page, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
      ime = insets.isVisible(WindowInsetsCompat.Type.ime())
      syncBack()
      insets
    }
  }
  fun setActive(value: Boolean) {
    if (active == value) return
    active = value
    if (!active && !committed) reset()
    if (active) { committed = false; reset() }
    syncBack()
  }
  private fun reset() {
    animator?.cancel()
    tracking = false
    page.translationX = 0f
  }
  val slotCount: Int get() = slots.size
  fun slotAt(index: Int): View = slots[index]
  fun addSlot(child: View, index: Int) {
    slots.add(index, child)
    page.addView(child, index, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    requestLayout()
  }
  fun removeSlot(child: View) { page.removeView(child); slots.remove(child) }
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    page.measure(MeasureSpec.makeMeasureSpec(right - left, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(bottom - top, MeasureSpec.EXACTLY))
    page.layout(0, 0, right - left, bottom - top)
  }
  override fun onAttachedToWindow() { super.onAttachedToWindow(); post { syncBack() } }
  override fun onDetachedFromWindow() { stopBack(); animator?.cancel(); super.onDetachedFromWindow() }
  private fun stopBack() {
    if (Build.VERSION.SDK_INT >= 33) callback?.let { findOnBackInvokedDispatcher()?.unregisterOnBackInvokedCallback(it) }
    callback = null
  }
  private fun commit() {
    if (committed || !active) return
    committed = true
    stopBack()
    onBack(emptyMap<String, Any>())
  }
  private fun settle(commit: Boolean) {
    animator?.cancel()
    animator = ValueAnimator.ofFloat(page.translationX, if (commit) width.toFloat() else 0f).apply {
      duration = if (!reducedMotion && ValueAnimator.areAnimatorsEnabled()) 180L else 0L
      interpolator = PathInterpolator(0.05f, 0.7f, 0.1f, 1f)
      addUpdateListener { page.translationX = it.animatedValue as Float }
      addListener(object : AnimatorListenerAdapter() {
        private var cancelled = false
        override fun onAnimationCancel(animation: Animator) { cancelled = true }
        override fun onAnimationEnd(animation: Animator) {
          if (cancelled) return
          tracking = false
          if (commit) this@PredictivePageView.commit()
        }
      })
      start()
    }
  }
  private fun syncBack() {
    if (Build.VERSION.SDK_INT < 34) return
    if (!active || ime || committed || !isAttachedToWindow) { stopBack(); return }
    if (callback != null) return
    val next = object : OnBackAnimationCallback {
      override fun onBackStarted(event: BackEvent) {
        animator?.cancel()
        tracking = true
      }
      override fun onBackProgressed(event: BackEvent) {
        if (!reducedMotion && ValueAnimator.areAnimatorsEnabled()) page.translationX = width * event.progress.coerceIn(0f, 1f)
      }
      override fun onBackCancelled() = settle(false)
      override fun onBackInvoked() { if (tracking) settle(true) else commit() }
    }
    // JS suspends this surface for local Back owners; native IME insets suspend it too.
    findOnBackInvokedDispatcher()?.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_OVERLAY, next)
    callback = next
  }
}
