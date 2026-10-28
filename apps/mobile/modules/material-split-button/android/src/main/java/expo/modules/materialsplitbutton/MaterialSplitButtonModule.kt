package expo.modules.materialsplitbutton

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView

class MaterialSplitButtonModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialSplitButton")
    ExpoUIView<SplitButtonProps>("MaterialSplitButtonView") {
      val onPress by Event<Unit>()
      val onPick by Event<SplitPickEvent>()
      val onSize by Event<SplitSizeEvent>()

      Content { props ->
        SplitButtonContent(
          props,
          onPress = { onPress(Unit) },
          onPick = { onPick(SplitPickEvent(it)) },
          // Posted, like Host's own size event: dispatching from a measure pass can re-enter it.
          onSize = { width, height -> view.post { onSize(SplitSizeEvent(width, height)) } },
        )
      }
    }
  }
}
