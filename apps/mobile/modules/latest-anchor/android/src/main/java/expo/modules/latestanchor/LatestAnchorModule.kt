package expo.modules.latestanchor

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LatestAnchorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LatestAnchor")
    View(LatestAnchorView::class) {
      Prop("following") { view: LatestAnchorView, value: Boolean -> view.following = value }
      Prop("animated") { view: LatestAnchorView, value: Boolean -> view.animated = value }
    }
  }
}
