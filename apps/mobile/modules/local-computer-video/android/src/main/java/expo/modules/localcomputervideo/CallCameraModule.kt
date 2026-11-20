package expo.modules.localcomputervideo

import android.Manifest
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Camera keyframes for Bot calls. JS runs the shared keyframe picker on the thumbnails and
 * asks for a JPEG only when a frame should go to the Host, exactly as on iPhone.
 */
class CallCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallCamera")
    Events("onCallCameraThumb", "onCallCameraState")

    OnCreate {
      CallCamera.onThumb = { body -> sendEvent("onCallCameraThumb", body) }
      CallCamera.onState = { state -> sendEvent("onCallCameraState", mapOf("state" to state)) }
    }

    OnDestroy {
      CallCamera.dispose()
    }

    // `position` is `front` or `back`. `testVideo` (test builds) replaces the camera with a file.
    AsyncFunction("callCameraStart") { position: String, testVideo: String?, thumbWidth: Int, sampleFps: Double, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("camera-missing", "The camera could not start on this phone.", null)
        return@AsyncFunction
      }
      val start = {
        CallCamera.start(context, position, testVideo, thumbWidth, sampleFps) { result ->
          result.fold(
            onSuccess = { promise.resolve(it) },
            onFailure = {
              promise.reject(
                (it as? CallCameraFailure)?.code ?: "camera-missing",
                "The camera could not start.",
                null,
              )
            },
          )
        }
      }
      if (testVideo != null || CallCamera.hasPermission(context)) {
        start()
        return@AsyncFunction
      }
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.reject("camera-missing", "Camera permissions are unavailable.", null)
        return@AsyncFunction
      }
      // A permission dialog pauses the activity and ADR-0284 ends calls on a background
      // pause; the call owner reads this flag to keep this one pause alive. #3423 removes it.
      CallCamera.askingPermission = true
      permissions.askForPermissions(
        object : PermissionsResponseListener {
          override fun onResult(result: Map<String, PermissionsResponse>) {
            CallCamera.askingPermission = false
            if (result[Manifest.permission.CAMERA]?.status == PermissionsStatus.GRANTED) start()
            else promise.reject("camera-denied", "The camera permission was denied.", null)
          }
        },
        Manifest.permission.CAMERA,
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("callCameraKeyframe") { maxBytes: Int, promise: Promise ->
      CallCamera.keyframe(maxBytes) { body -> promise.resolve(body) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("callCameraStop") {
      CallCamera.stop()
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersBackground {
      CallCamera.pause()
    }

    OnActivityEntersForeground {
      CallCamera.resume()
    }

    View(CallCameraView::class) {}
  }
}
