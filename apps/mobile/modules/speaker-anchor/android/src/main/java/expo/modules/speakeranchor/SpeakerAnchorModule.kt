package expo.modules.speakeranchor

import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SpeakerAnchorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SpeakerAnchor")
    View(SpeakerAnchorView::class) {
      Prop("rest") { view: SpeakerAnchorView, value: Double -> view.rest = value.toFloat() }
      Prop("span") { view: SpeakerAnchorView, value: Double -> view.span = value.toFloat() }
      Prop("floor") { view: SpeakerAnchorView, value: Double -> view.floor = value.toFloat() }
      Prop("viewport") { view: SpeakerAnchorView, value: String -> view.viewportId = value }
      OnViewDidUpdateProps { view: SpeakerAnchorView -> view.place() }
      GroupView<SpeakerAnchorView> {
        AddChildView { parent: SpeakerAnchorView, child: View, index: Int -> parent.addView(child, index) }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt { parent, index -> parent.getChildAt(index) }
        RemoveChildView { parent: SpeakerAnchorView, child: View -> parent.removeView(child) }
        RemoveChildViewAt { parent, index -> parent.removeViewAt(index) }
      }
    }
  }
}
