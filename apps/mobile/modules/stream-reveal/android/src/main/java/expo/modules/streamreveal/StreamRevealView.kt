package expo.modules.streamreveal

import android.content.Context
import android.view.View
import android.widget.TextView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

// Yoga and the existing React Text retain layout, selection and accessibility.
// This parent only observes the single paragraph's already-rendered native text.
class StreamRevealView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var active = false
  var duration = 180L
  var stagger = 72L
  var maxGlyphs = 48
  private val observers = mutableMapOf<TextView, TextReveal>()

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
    sync()
  }

  override fun onDetachedFromWindow() {
    clear()
    super.onDetachedFromWindow()
  }
}
