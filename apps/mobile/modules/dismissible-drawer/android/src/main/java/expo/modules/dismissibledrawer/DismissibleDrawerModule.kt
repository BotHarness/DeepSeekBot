package expo.modules.dismissibledrawer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView

class DismissibleDrawerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DismissibleDrawer")

    Function("hasModalSessionDrawer") { true }

    ExpoUIView<DismissibleDrawerProps>("DismissibleDrawerView") {
      val onOpenChange by Event<DrawerOpenChange>()

      Content { props ->
        DismissibleDrawerContent(props) { open -> onOpenChange(DrawerOpenChange(open)) }
      }
    }

    ExpoUIView<SessionDrawerProps>("SessionDrawerView") {
      val onOpenChange by Event<SessionDrawerChange>()
      val onProgress by Event<SessionDrawerProgress>()

      Content { props ->
        SessionDrawerContent(
          props,
          onOpenChange = { open -> onOpenChange(SessionDrawerChange(open)) },
          onProgress = { progress -> onProgress(SessionDrawerProgress(progress)) },
        )
      }
    }
  }
}
