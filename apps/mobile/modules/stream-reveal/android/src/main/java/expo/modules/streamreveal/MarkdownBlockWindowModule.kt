package expo.modules.streamreveal

import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MarkdownBlockWindowModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MarkdownBlockWindow")
    View(MarkdownBlockWindowView::class) {
      Events("onWindowChange")
      Prop("eligible") { view: MarkdownBlockWindowView, value: Boolean -> view.eligible = value }
      Prop("placeholder") { view: MarkdownBlockWindowView, value: Boolean -> view.placeholder = value }
      GroupView<MarkdownBlockWindowView> {
        AddChildView { parent: MarkdownBlockWindowView, child: View, index: Int -> parent.addView(child, index) }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt { parent, index -> parent.getChildAt(index) }
        RemoveChildView { parent: MarkdownBlockWindowView, child: View -> parent.removeView(child) }
        RemoveChildViewAt { parent, index -> parent.removeViewAt(index) }
      }
    }
  }
}
