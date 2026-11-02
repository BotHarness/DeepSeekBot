package expo.modules.materialbuttongroup

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView

class MaterialButtonGroupModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialButtonGroup")
    ExpoUIView<ButtonGroupProps>("MaterialButtonGroupView") {
      val onButtonSelect by Event<ButtonGroupSelectEvent>()

      Content { props ->
        ButtonGroupContent(props) { onButtonSelect(ButtonGroupSelectEvent(it)) }
      }
    }
  }
}
