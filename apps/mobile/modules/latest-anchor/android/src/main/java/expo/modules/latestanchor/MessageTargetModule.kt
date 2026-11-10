package expo.modules.latestanchor

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MessageTargetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MessageTarget")
    Constants("supported" to (android.os.Build.VERSION.SDK_INT >= 29))
    View(MessageTargetView::class) {
      Events("onPositioned")
      Prop("request") { view: MessageTargetView, value: String -> view.request = value }
      Prop("active") { view: MessageTargetView, value: Boolean -> view.active = value }
      Prop("top") { view: MessageTargetView, value: Double -> view.top = value }
      Prop("bottom") { view: MessageTargetView, value: Double -> view.bottom = value }
      GroupView {
        AddChildView { parent, child, index -> parent.addView(child, index) }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt { parent, index -> parent.getChildAt(index) }
        RemoveChildView { parent, child -> parent.removeView(child) }
        RemoveChildViewAt { parent, index -> parent.removeViewAt(index) }
      }
    }
  }
}
