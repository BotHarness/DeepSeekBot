package expo.modules.hardwaresend

import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HardwareSendModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HardwareSend")
    View(HardwareSendView::class) {
      Events("onSend")
      Prop("enabled") { view: HardwareSendView, value: Boolean -> view.sending = value }
      Prop("enter") { view: HardwareSendView, value: Boolean -> view.enter = value }
      GroupView<HardwareSendView> {
        AddChildView { parent: HardwareSendView, child: View, index: Int -> parent.addView(child, index) }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt { parent, index -> parent.getChildAt(index) }
        RemoveChildView { parent: HardwareSendView, child: View -> parent.removeView(child) }
        RemoveChildViewAt { parent, index -> parent.removeViewAt(index) }
      }
    }
  }
}
