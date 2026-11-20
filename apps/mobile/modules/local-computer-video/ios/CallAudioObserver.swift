import AVFoundation
import Foundation
import UIKit
import WebRTC

/// Watches the shared audio session for the one live Bot call. A phone call, Siri or
/// another app can interrupt it; WebRTC stops and restarts its audio unit around the
/// interruption, and the call itself stays open on the Host. Headphones, Bluetooth
/// and car audio coming and going move the call's output and are reported with the
/// route. Nothing here ends the call.
///
/// Media apps such as YouTube often never send the interruption's end, so while the
/// call is interrupted the observer also tries to take the audio back: every few
/// seconds, when the app becomes active and when other audio stops. Once the session
/// activates again it posts the system's own "interruption ended" notification, so
/// WebRTC restarts its audio unit through its usual path and the activation count
/// stays balanced.
final class CallAudioObserver: NSObject, RTCAudioSessionDelegate {
  private let emit: ([String: Any]) -> Void
  private(set) var interrupted = false
  private var retry: Timer?
  private var observers: [NSObjectProtocol] = []

  init(emit: @escaping ([String: Any]) -> Void) {
    self.emit = emit
    super.init()
    RTCAudioSession.sharedInstance().add(self)
    let center = NotificationCenter.default
    observers = [
      center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) {
        [weak self] _ in self?.resume()
      },
      center.addObserver(forName: AVAudioSession.silenceSecondaryAudioHintNotification, object: nil, queue: .main) {
        [weak self] note in
        let raw = note.userInfo?[AVAudioSessionSilenceSecondaryAudioHintTypeKey] as? UInt
        if raw == AVAudioSession.SilenceSecondaryAudioHintType.end.rawValue { self?.resume() }
      },
    ]
  }

  func stop() {
    RTCAudioSession.sharedInstance().remove(self)
    observers.forEach(NotificationCenter.default.removeObserver)
    observers = []
    retry?.invalidate()
    retry = nil
  }

  func audioSessionDidBeginInterruption(_ session: RTCAudioSession) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.interrupted = true
      self.emit(["interrupted": true, "route": CallAudioRoute.state()])
      self.retry?.invalidate()
      self.retry = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.resume() }
    }
  }

  func audioSessionDidEndInterruption(_ session: RTCAudioSession, shouldResumeSession: Bool) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.retry?.invalidate()
      self.retry = nil
      self.interrupted = false
      self.emit(["interrupted": false, "resumed": shouldResumeSession, "route": CallAudioRoute.state()])
    }
  }

  func audioSessionDidChangeRoute(
    _ session: RTCAudioSession, reason: AVAudioSession.RouteChangeReason, previousRoute: AVAudioSessionRouteDescription
  ) {
    switch reason {
    case .newDeviceAvailable, .oldDeviceUnavailable, .override, .categoryChange, .routeConfigurationChange:
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        CallAudioRoute.routeChanged(reason, previous: previousRoute)
        self.emit(["interrupted": self.interrupted, "route": CallAudioRoute.state()])
      }
    default:
      break
    }
  }

  /// Takes the audio back once the session can activate again, then lets WebRTC resume.
  private func resume() {
    guard interrupted else { return }
    let session = AVAudioSession.sharedInstance()
    guard (try? session.setActive(true)) != nil else { return }
    NotificationCenter.default.post(
      name: AVAudioSession.interruptionNotification, object: session,
      userInfo: [
        AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue,
        AVAudioSessionInterruptionOptionKey: AVAudioSession.InterruptionOptions.shouldResume.rawValue,
      ])
  }
}
