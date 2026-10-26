package expo.modules.materialbuttongroup

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MaterialButtonGroupModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialButtonGroup")
    View(MaterialButtonGroupView::class) {
      Events("onSelect")
      Prop("items") { view: MaterialButtonGroupView, value: List<ButtonGroupItem> -> view.items = value }
      Prop("selected") { view: MaterialButtonGroupView, value: String -> view.selected = value }
      Prop("dark") { view: MaterialButtonGroupView, value: Boolean -> view.dark = value }
      Prop("foreground") { view: MaterialButtonGroupView, value: String -> view.foreground = value }
      Prop("container") { view: MaterialButtonGroupView, value: String -> view.container = value }
      Prop("checkedContainer") { view: MaterialButtonGroupView, value: String -> view.checkedContainer = value }
      Prop("checkedForeground") { view: MaterialButtonGroupView, value: String -> view.checkedForeground = value }
      Prop("reduceMotion") { view: MaterialButtonGroupView, value: Boolean -> view.reduceMotion = value }
    }
  }
}
