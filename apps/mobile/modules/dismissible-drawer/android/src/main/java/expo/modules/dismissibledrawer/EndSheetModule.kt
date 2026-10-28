package expo.modules.dismissibledrawer

import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EndSheetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EndSheet")
    View(EndSheetView::class) {
      Events("onOpenChange", "onOpening")
      Prop("open") { view: EndSheetView, value: Boolean -> view.setOpen(value) }
      Prop("active") { view: EndSheetView, value: Boolean -> view.setActive(value) }
      Prop("gesturesEnabled") { view: EndSheetView, value: Boolean -> view.gesturesEnabled = value }
      Prop("fullWidth") { view: EndSheetView, value: Boolean -> view.fullWidth = value }
      Prop("panelWidth") { view: EndSheetView, value: Double -> view.panelWidth = value.toFloat() }
      Prop("sheetColor") { view: EndSheetView, value: Int -> view.sheetColor = value }
      GroupView<EndSheetView> {
        AddChildView { parent: EndSheetView, child: View, index: Int -> parent.addSlot(child, index) }
        GetChildCount { parent -> parent.slotCount }
        GetChildViewAt { parent, index -> parent.slotAt(index) }
        RemoveChildView { parent: EndSheetView, child: View -> parent.removeSlot(child) }
        RemoveChildViewAt { parent, index -> parent.removeSlot(parent.slotAt(index)) }
      }
    }
  }
}
