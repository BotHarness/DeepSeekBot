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
      GroupView<MessageTargetView> {
        AddChildView { parent: MessageTargetView, child: android.view.View, index: Int -> parent.addView(child, index) }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt { parent, index -> parent.getChildAt(index) }
        RemoveChildView { parent: MessageTargetView, child: android.view.View -> parent.removeView(child) }
        RemoveChildViewAt { parent, index -> parent.removeViewAt(index) }
      }
    }
  }
}
