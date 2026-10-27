package expo.modules.materialbuttongroup

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView

class MaterialButtonGroupModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialButtonGroup")
    ExpoUIView<ButtonGroupProps>("MaterialButtonGroupView") {
      val onSelect by Event<ButtonGroupSelectEvent>()

      Content { props ->
        ButtonGroupContent(props) { onSelect(ButtonGroupSelectEvent(it)) }
      }
    }
  }
}
