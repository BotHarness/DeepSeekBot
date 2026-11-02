package expo.modules.streamreveal

import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StreamSurfaceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StreamSurface")
    View(StreamSurfaceView::class) {
      Prop("active") { view: StreamSurfaceView, value: Boolean -> view.active = value }
      Prop("duration") { view: StreamSurfaceView, value: Double -> view.duration = value.toLong().coerceAtLeast(1) }
      Prop("surfaceColor") { view: StreamSurfaceView, value: Int -> view.surfaceColor = value }
      Prop("corners") { view: StreamSurfaceView, value: List<Double> -> view.corners = value }
      OnViewDidUpdateProps { view: StreamSurfaceView -> view.invalidate() }
      GroupView<StreamSurfaceView> {
        AddChildView { parent: StreamSurfaceView, child: View, index: Int -> parent.addView(child, index) }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt { parent, index -> parent.getChildAt(index) }
        RemoveChildView { parent: StreamSurfaceView, child: View -> parent.removeView(child) }
        RemoveChildViewAt { parent, index -> parent.removeViewAt(index) }
      }
    }
  }
}
