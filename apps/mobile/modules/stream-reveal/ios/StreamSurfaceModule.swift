import ExpoModulesCore
import UIKit

public final class StreamSurfaceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StreamSurface")
    View(StreamSurfaceView.self) {
      Prop("active") { (view: StreamSurfaceView, value: Bool) in view.active = value }
      Prop("surfaceColor") { (view: StreamSurfaceView, value: UIColor) in
        view.background.fillColor = value.cgColor
      }
      Prop("corners") { (view: StreamSurfaceView, value: [Double]) in view.corners = value }
      Prop("duration") { (view: StreamSurfaceView, value: Double) in view.duration = value }
      Prop("mass") { (view: StreamSurfaceView, value: Double) in view.mass = value }
      Prop("stiffness") { (view: StreamSurfaceView, value: Double) in view.stiffness = value }
      Prop("damping") { (view: StreamSurfaceView, value: Double) in view.damping = value }
      OnViewDidUpdateProps { (view: StreamSurfaceView) in view.sync() }
    }
  }
}
