import AVFoundation
import UIKit
import WebRTC

/// Where the one live Bot call's audio comes from and goes, chosen the way meeting apps
/// do it: a microphone (the iPhone's or the headset's) and an output (the receiver,
/// the connected headphones, Bluetooth or car audio, or the loudspeaker).
///
/// Every combination is a voice call (voice-chat mode, Apple's voice processing, HFP for
/// a Bluetooth headset) except one: headphones out with the iPhone microphone is music
/// mode. It plays in the default mode with A2DP quality, lets other apps keep playing,
/// and runs without Apple's voice processing, so WebRTC's software echo canceller takes
/// over. The session is activated once per call; choosing a route only reconfigures it.
/// Everything here runs on the main queue.
enum CallAudioRoute {
  enum Output: String { case receiver, speaker, external }
  enum Microphone: String { case iphone, headset }

  private static var output: Output = .speaker
  private static var microphone: Microphone = .iphone
  /// The microphone the person wants while headphones are in use, kept across calls.
  private static var headsetMicrophone: Microphone = .headset
  /// The external output and headset microphone last seen, kept while they are
  /// connected but hidden by the current configuration.
  private static var external: [String: Any]?
  private static var headsetInput: [String: Any]?
  /// Tells the live call whether to run in music mode.
  static var onMusicMode: ((Bool) -> Void)?

  private static var music: Bool { output == .external && microphone == .iphone }

  /// Configures and activates the session for a new call. Connected headphones take the
  /// call, with the headset microphone unless the person chose the iPhone's; otherwise
  /// the loudspeaker and the iPhone microphone.
  static func start(headsetMicrophone preferred: String) -> Bool {
    headsetMicrophone = Microphone(rawValue: preferred) ?? .headset
    external = nil
    headsetInput = nil
    output = .external
    microphone = .headset
    guard apply(activate: true) else { return false }
    if !routeIsExternal() {
      output = .speaker
      microphone = .iphone
      apply(activate: false)
    } else if headsetMicrophone == .iphone {
      microphone = .iphone
      apply(activate: false)
    }
    return true
  }

  /// Switches the live call's output or microphone without restarting the peer. The
  /// headset microphone needs the headset output, and a built-in output takes the
  /// iPhone microphone.
  static func choose(output: String, microphone: String) -> [String: Any]? {
    guard var nextOutput = Output(rawValue: output), var nextMicrophone = Microphone(rawValue: microphone)
    else { return nil }
    if nextMicrophone == .headset, self.microphone != .headset { nextOutput = .external }
    if nextOutput != .external { nextMicrophone = .iphone }
    if nextOutput == .external, self.output != .external, nextMicrophone == self.microphone {
      nextMicrophone = headsetMicrophone
    }
    self.output = nextOutput
    self.microphone = nextMicrophone
    if nextOutput == .external { headsetMicrophone = nextMicrophone }
    return apply(activate: false) ? state() : nil
  }

  /// Follows devices coming and going: new headphones take the call, and losing the
  /// ones in use returns it to the loudspeaker.
  static func routeChanged(_ reason: AVAudioSession.RouteChangeReason, previous: AVAudioSessionRouteDescription) {
    switch reason {
    case .newDeviceAvailable:
      external = nil
      headsetInput = nil
      if output != .external, externalOutput() != nil {
        output = .external
        microphone = headsetMicrophone
        apply(activate: false)
      }
    case .oldDeviceUnavailable:
      let wasExternal =
        previous.outputs.contains { !isBuiltIn($0.portType) } || previous.inputs.contains { !isBuiltIn($0.portType) }
      guard wasExternal else { return }
      external = nil
      headsetInput = nil
      if output == .external, externalOutput() == nil {
        output = .speaker
        microphone = .iphone
        apply(activate: false)
      }
    default:
      break
    }
  }

  /// The route the call screen shows: the output and microphone actually in use and the
  /// ones the person can pick.
  static func state() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    var outputs: [[String: Any]] = []
    if UIDevice.current.userInterfaceIdiom == .phone {
      outputs.append(["id": Output.receiver.rawValue, "kind": "receiver", "name": ""])
    }
    if let external = externalOutput() { outputs.append(external) }
    outputs.append(["id": Output.speaker.rawValue, "kind": "speaker", "name": ""])
    var microphones: [[String: Any]] = [["id": Microphone.iphone.rawValue, "kind": "iphone", "name": ""]]
    if let headset = headsetMicrophoneInput() { microphones.append(headset) }
    let currentOutput: String
    switch session.currentRoute.outputs.first?.portType {
    case .builtInSpeaker?: currentOutput = Output.speaker.rawValue
    case .builtInReceiver?: currentOutput = Output.receiver.rawValue
    case nil: currentOutput = output.rawValue
    default: currentOutput = Output.external.rawValue
    }
    let currentMicrophone: String
    switch session.currentRoute.inputs.first?.portType {
    case .builtInMic?: currentMicrophone = Microphone.iphone.rawValue
    case nil: currentMicrophone = microphone.rawValue
    default: currentMicrophone = Microphone.headset.rawValue
    }
    return [
      "output": currentOutput, "outputs": outputs,
      "microphone": currentMicrophone, "microphones": microphones,
      "music": music,
    ]
  }

  static func syncMusicMode() {
    onMusicMode?(music)
  }

  static func reset() {
    external = nil
    headsetInput = nil
    onMusicMode = nil
  }

  @discardableResult
  private static func apply(activate: Bool) -> Bool {
    let session = RTCAudioSession.sharedInstance()
    session.lockForConfiguration()
    defer { session.unlockForConfiguration() }
    do {
      if activate {
        try session.setConfiguration(configuration(), active: true)
      } else {
        try session.setConfiguration(configuration())
      }
    } catch {
      return false
    }
    try? session.overrideOutputAudioPort(output == .speaker ? .speaker : .none)
    let inputs = AVAudioSession.sharedInstance().availableInputs ?? []
    let headset = inputs.first { !isBuiltIn($0.portType) }
    let mic = inputs.first { $0.portType == .builtInMic }
    if let preferred = microphone == .headset ? headset ?? mic : mic {
      try? session.setPreferredInput(preferred)
    }
    _ = externalOutput()
    _ = headsetMicrophoneInput()
    onMusicMode?(music)
    return true
  }

  /// Music mode leaves HFP out so Bluetooth headphones stay on A2DP. A voice call allows
  /// HFP; the loudspeaker is an override, so a connected headset stays listed.
  private static func configuration() -> RTCAudioSessionConfiguration {
    let config = RTCAudioSessionConfiguration.webRTC()
    config.category = AVAudioSession.Category.playAndRecord.rawValue
    if music {
      config.mode = AVAudioSession.Mode.default.rawValue
      config.categoryOptions = [.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker]
    } else {
      config.mode = AVAudioSession.Mode.voiceChat.rawValue
      config.categoryOptions = output == .receiver ? [.allowBluetooth] : [.allowBluetooth, .defaultToSpeaker]
    }
    return config
  }

  private static func routeIsExternal() -> Bool {
    AVAudioSession.sharedInstance().currentRoute.outputs.contains { !isBuiltIn($0.portType) }
  }

  private static func externalOutput() -> [String: Any]? {
    let session = AVAudioSession.sharedInstance()
    if let port = session.currentRoute.outputs.first(where: { !isBuiltIn($0.portType) }) {
      external = ["id": Output.external.rawValue, "kind": kind(port.portType), "name": port.portName]
    } else if let port = session.availableInputs?.first(where: { !isBuiltIn($0.portType) }) {
      external = ["id": Output.external.rawValue, "kind": kind(port.portType), "name": port.portName]
    }
    return external
  }

  private static func headsetMicrophoneInput() -> [String: Any]? {
    let session = AVAudioSession.sharedInstance()
    let port =
      session.currentRoute.inputs.first(where: { !isBuiltIn($0.portType) })
      ?? session.availableInputs?.first(where: { !isBuiltIn($0.portType) })
    if let port {
      headsetInput = ["id": Microphone.headset.rawValue, "kind": kind(port.portType), "name": port.portName]
    }
    return headsetInput
  }

  private static func kind(_ port: AVAudioSession.Port) -> String {
    switch port {
    case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE: return "bluetooth"
    case .headphones, .headsetMic, .usbAudio, .lineOut: return "headphones"
    case .carAudio: return "car"
    case .airPlay: return "airplay"
    default: return "other"
    }
  }

  private static func isBuiltIn(_ port: AVAudioSession.Port) -> Bool {
    port == .builtInSpeaker || port == .builtInReceiver || port == .builtInMic
  }
}
