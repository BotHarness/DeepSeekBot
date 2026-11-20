import ExpoModulesCore
import UIKit

public final class LatestAnchorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LatestAnchor")
    View(LatestAnchorView.self) {
      Prop("following") { (view: LatestAnchorView, value: Bool) in view.following = value }
      Prop("animated") { (view: LatestAnchorView, value: Bool) in view.animated = value }
    }
  }
}
