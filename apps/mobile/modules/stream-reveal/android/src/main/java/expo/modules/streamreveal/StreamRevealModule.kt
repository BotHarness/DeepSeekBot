package expo.modules.streamreveal

import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StreamRevealModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StreamReveal")
    View(StreamRevealView::class) {
      Prop("active") { view: StreamRevealView, value: Boolean -> view.active = value }
      Prop("duration") { view: StreamRevealView, value: Double -> view.duration = value.toLong().coerceAtLeast(1) }
      Prop("stagger") { view: StreamRevealView, value: Double -> view.stagger = value.toLong().coerceAtLeast(0) }
      Prop("maxGlyphs") { view: StreamRevealView, value: Int -> view.maxGlyphs = value.coerceIn(1, 512) }
      OnViewDidUpdateProps { view: StreamRevealView -> view.sync() }
      GroupView<StreamRevealView> {
        AddChildView { parent: StreamRevealView, child: View, index: Int -> parent.addView(child, index) }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt { parent, index -> parent.getChildAt(index) }
        RemoveChildView { parent: StreamRevealView, child: View -> parent.removeView(child) }
        RemoveChildViewAt { parent, index -> parent.removeViewAt(index) }
      }
    }
  }
}
