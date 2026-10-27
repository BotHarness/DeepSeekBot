package expo.modules.materialsplitbutton

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MaterialSplitButtonModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialSplitButton")
    View(MaterialSplitButtonView::class) {
      Events("onPress", "onPick", "onSize")
      Prop("label") { view: MaterialSplitButtonView, value: String -> view.label = value }
      Prop("path") { view: MaterialSplitButtonView, value: String -> view.path = value }
      Prop("menuLabel") { view: MaterialSplitButtonView, value: String -> view.menuLabel = value }
      Prop("items") { view: MaterialSplitButtonView, value: List<SplitMenuItem> -> view.items = value }
      Prop("available") { view: MaterialSplitButtonView, value: Boolean -> view.available = value }
      Prop("dark") { view: MaterialSplitButtonView, value: Boolean -> view.dark = value }
      Prop("container") { view: MaterialSplitButtonView, value: String -> view.container = value }
      Prop("content") { view: MaterialSplitButtonView, value: String -> view.content = value }
      Prop("testPrefix") { view: MaterialSplitButtonView, value: String -> view.testPrefix = value }
    }
  }
}
