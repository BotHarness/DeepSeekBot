package expo.modules.materialfabmenu

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView
import expo.modules.ui.ModifierRegistry

class MaterialFabMenuModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialFabMenu")
    ExpoUIView<FabMenuProps>("MaterialFabMenuView") {
      val onToggle by Event<FabToggleEvent>()
      val onPick by Event<FabPickEvent>()

      Content { props ->
        FabMenu(
          props,
          modifier = ModifierRegistry.applyModifiers(props.modifiers, appContext, composableScope, globalEventDispatcher),
          onToggle = { onToggle(FabToggleEvent(it)) },
          onPick = { onPick(FabPickEvent(it)) },
        )
      }
    }
  }
}
