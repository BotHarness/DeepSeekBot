package expo.modules.dismissibledrawer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView

class DismissibleDrawerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DismissibleDrawer")

    ExpoUIView<DismissibleDrawerProps>("DismissibleDrawerView") {
      val onOpenChange by Event<DrawerOpenChange>()

      Content { props ->
        DismissibleDrawerContent(props) { open -> onOpenChange(DrawerOpenChange(open)) }
      }
    }
  }
}
