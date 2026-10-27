package expo.modules.materialfabmenu

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MaterialFabMenuModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialFabMenu")
    View(MaterialFabMenuView::class) {
      Events("onToggle", "onPick")
      Prop("items") { view: MaterialFabMenuView, value: List<FabMenuItem> -> view.items = value }
      Prop("expanded") { view: MaterialFabMenuView, value: Boolean -> view.expanded = value }
      Prop("enabled") { view: MaterialFabMenuView, value: Boolean -> view.enabled = value }
      Prop("label") { view: MaterialFabMenuView, value: String -> view.label = value }
      Prop("closeLabel") { view: MaterialFabMenuView, value: String -> view.closeLabel = value }
      Prop("dark") { view: MaterialFabMenuView, value: Boolean -> view.dark = value }
      Prop("buttonContainer") { view: MaterialFabMenuView, value: String -> view.buttonContainer = value }
      Prop("buttonContent") { view: MaterialFabMenuView, value: String -> view.buttonContent = value }
      Prop("itemContainer") { view: MaterialFabMenuView, value: String -> view.itemContainer = value }
      Prop("itemContent") { view: MaterialFabMenuView, value: String -> view.itemContent = value }
      Prop("reduceMotion") { view: MaterialFabMenuView, value: Boolean -> view.reduceMotion = value }
    }
  }
}
