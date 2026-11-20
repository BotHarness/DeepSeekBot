import ExpoModulesCore
import UIKit

public final class SpeakerAnchorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SpeakerAnchor")
    View(SpeakerAnchorView.self) {
      Prop("rest") { (view: SpeakerAnchorView, value: Double) in view.rest = CGFloat(value) }
      Prop("span") { (view: SpeakerAnchorView, value: Double) in view.span = CGFloat(value) }
      Prop("floor") { (view: SpeakerAnchorView, value: Double) in view.floor = CGFloat(value) }
      Prop("viewport") { (view: SpeakerAnchorView, value: String) in view.viewportId = value }
      OnViewDidUpdateProps { (view: SpeakerAnchorView) in view.place() }
    }
  }
}
