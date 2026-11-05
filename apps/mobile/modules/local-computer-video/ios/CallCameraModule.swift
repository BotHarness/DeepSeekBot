import ExpoModulesCore

/// Camera keyframes for Bot calls. JS runs the keyframe picker on the thumbnails and asks for
/// a JPEG only when a frame should go to the Host.
public final class CallCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CallCamera")
    Events("onCallCameraThumb", "onCallCameraState")

    OnCreate {
      CallCamera.shared.onThumb = { [weak self] body in self?.sendEvent("onCallCameraThumb", body) }
      CallCamera.shared.onState = { [weak self] state in self?.sendEvent("onCallCameraState", ["state": state]) }
    }

    // `position` is `front` or `back`. `testVideo` (test builds) replaces the camera with a file.
    AsyncFunction("callCameraStart") {
      (position: String, testVideo: String?, thumbWidth: Int, sampleFps: Double, promise: Promise) in
      let url = testVideo.flatMap { path in
        path.hasPrefix("file://") ? URL(string: path) : URL(fileURLWithPath: path)
      }
      CallCamera.shared.start(position: position, testVideo: url, thumbWidth: thumbWidth, sampleFps: sampleFps) {
        result in
        switch result {
        case .success(let body): promise.resolve(body)
        case .failure(let failure): promise.reject(failure.rawValue, "The camera could not start.")
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("callCameraKeyframe") { (maxBytes: Int, promise: Promise) in
      CallCamera.shared.keyframe(maxBytes: maxBytes) { body in promise.resolve(body) }
    }.runOnQueue(.main)

    AsyncFunction("callCameraStop") {
      CallCamera.shared.stop()
    }.runOnQueue(.main)

    View(CallCameraView.self) {}
  }
}
