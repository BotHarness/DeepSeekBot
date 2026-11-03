import AVFoundation
import Foundation
import WebRTC

/// Watches the shared audio session for the one live Bot call. A phone call, Siri or
/// another app can interrupt it; WebRTC stops and restarts its audio unit around the
/// interruption, and the call itself stays open on the Host. Headphones, Bluetooth
/// and car audio coming and going are reported too. Nothing here ends the call.
final class CallAudioObserver: NSObject, RTCAudioSessionDelegate {
  private let emit: ([String: Any]) -> Void
  private(set) var interrupted = false

  init(emit: @escaping ([String: Any]) -> Void) {
    self.emit = emit
    super.init()
    RTCAudioSession.sharedInstance().add(self)
  }

  func stop() {
    RTCAudioSession.sharedInstance().remove(self)
  }

  func audioSessionDidBeginInterruption(_ session: RTCAudioSession) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.interrupted = true
      self.emit(["interrupted": true, "output": CallAttempt.currentOutput()])
    }
  }

  func audioSessionDidEndInterruption(_ session: RTCAudioSession, shouldResumeSession: Bool) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.interrupted = false
      self.emit(["interrupted": false, "resumed": shouldResumeSession, "output": CallAttempt.currentOutput()])
    }
  }

  func audioSessionDidChangeRoute(
    _ session: RTCAudioSession, reason: AVAudioSession.RouteChangeReason, previousRoute: AVAudioSessionRouteDescription
  ) {
    switch reason {
    case .newDeviceAvailable, .oldDeviceUnavailable, .override, .categoryChange, .routeConfigurationChange:
      let output = CallAttempt.currentOutput()
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.emit(["interrupted": self.interrupted, "output": output])
      }
    default:
      break
    }
  }
}
