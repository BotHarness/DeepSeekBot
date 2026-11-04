import AVFoundation
import CoreImage
import UIKit

enum CallCameraFailure: String, Error {
  case denied = "camera-denied"
  case missing = "camera-missing"
  case busy = "camera-busy"
}

/// The phone camera during a Bot call. It hands JS a small grey thumbnail twice a second for
/// the shared keyframe picker, and a JPEG of the newest frame when JS asks for a keyframe.
/// Test builds can read a video file in real time instead of the camera.
final class CallCamera: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  static let shared = CallCamera()

  let session = AVCaptureSession()
  private let queue = DispatchQueue(label: "deepseekbot.call-camera")
  private let context = CIContext()
  private var latest: CIImage?
  private var lastThumb: CFTimeInterval = 0
  private var lastPreview: CFTimeInterval = 0
  private var startedAt: CFTimeInterval = 0
  private var thumbWidth = 64
  private var interval: CFTimeInterval = 0.5
  private var reader: AVAssetReader?
  private var readerOutput: AVAssetReaderTrackOutput?
  private var timer: DispatchSourceTimer?
  private var generation = 0
  private(set) var running = false
  private(set) var testing = false
  private(set) var paused = false
  private(set) var position: AVCaptureDevice.Position = .front
  private var views = NSHashTable<CallCameraView>.weakObjects()

  var onThumb: (([String: Any]) -> Void)?
  var onState: ((String) -> Void)?

  override init() {
    super.init()
    let center = NotificationCenter.default
    center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) {
      [weak self] _ in self?.pause()
    }
    center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) {
      [weak self] _ in self?.resume()
    }
  }

  func attach(_ view: CallCameraView) {
    views.add(view)
    view.show(session: testing || !running ? nil : session, mirrored: position == .front)
  }

  private func refreshViews() {
    let live = running && !testing
    for view in views.allObjects { view.show(session: live ? session : nil, mirrored: position == .front) }
  }

  func start(
    position: String, testVideo: URL?, thumbWidth: Int, sampleFps: Double,
    done: @escaping (Result<[String: Any], CallCameraFailure>) -> Void
  ) {
    stop()
    self.thumbWidth = max(16, min(256, thumbWidth))
    interval = 1.0 / max(0.5, min(10, sampleFps))
    self.position = position == "back" ? .back : .front
    generation += 1
    let current = generation
    if let testVideo {
      queue.async {
        guard self.openReader(testVideo) else {
          DispatchQueue.main.async { done(.failure(.missing)) }
          return
        }
        self.testing = true
        self.begin()
        self.runReader(current)
        DispatchQueue.main.async {
          self.refreshViews()
          done(.success(["position": "test"]))
        }
      }
      return
    }
    let open = {
      self.queue.async {
        guard current == self.generation else { return }
        guard self.configure() else {
          DispatchQueue.main.async { done(.failure(.missing)) }
          return
        }
        self.begin()
        self.session.startRunning()
        DispatchQueue.main.async {
          self.refreshViews()
          done(.success(["position": self.position == .back ? "back" : "front"]))
        }
      }
    }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: open()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        if granted { open() } else { DispatchQueue.main.async { done(.failure(.denied)) } }
      }
    default: done(.failure(.denied))
    }
  }

  private func begin() {
    running = true
    paused = false
    latest = nil
    lastThumb = 0
    startedAt = CACurrentMediaTime()
  }

  private func configure() -> Bool {
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    for input in session.inputs { session.removeInput(input) }
    for output in session.outputs { session.removeOutput(output) }
    if session.canSetSessionPreset(.hd1280x720) { session.sessionPreset = .hd1280x720 }
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
      let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { return false }
    session.addInput(input)
    let output = AVCaptureVideoDataOutput()
    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: queue)
    guard session.canAddOutput(output) else { return false }
    session.addOutput(output)
    if let connection = output.connection(with: .video) {
      if #available(iOS 17.0, *) {
        if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
      } else if connection.isVideoOrientationSupported {
        connection.videoOrientation = .portrait
      }
    }
    return true
  }

  private func openReader(_ url: URL) -> Bool {
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first,
      let reader = try? AVAssetReader(asset: asset) else { return false }
    let output = AVAssetReaderTrackOutput(
      track: track,
      outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { return false }
    reader.add(output)
    guard reader.startReading() else { return false }
    self.reader = reader
    readerOutput = output
    return true
  }

  /// Plays the test video at its own pace and keeps showing the last frame once it ends.
  private func runReader(_ current: Int) {
    let timer = DispatchSource.makeTimerSource(queue: queue)
    let began = CACurrentMediaTime()
    var pending: CMSampleBuffer?
    timer.schedule(deadline: .now(), repeating: 1.0 / 30)
    timer.setEventHandler { [weak self] in
      guard let self, current == self.generation else { return }
      let elapsed = CACurrentMediaTime() - began
      while true {
        if pending == nil { pending = self.readerOutput?.copyNextSampleBuffer() }
        guard let sample = pending else { break }
        let at = CMSampleBufferGetPresentationTimeStamp(sample).seconds
        guard at <= elapsed else { break }
        pending = nil
        if let buffer = CMSampleBufferGetImageBuffer(sample) {
          self.latest = CIImage(cvPixelBuffer: buffer)
        }
      }
      if let image = self.latest { self.received(image) }
    }
    self.timer = timer
    timer.resume()
  }

  func captureOutput(
    _ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection
  ) {
    guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let image = CIImage(cvPixelBuffer: buffer)
    latest = image
    received(image)
  }

  private func received(_ image: CIImage) {
    let now = CACurrentMediaTime()
    if testing, now - lastPreview >= 0.1, let preview = context.createCGImage(image, from: image.extent) {
      lastPreview = now
      DispatchQueue.main.async {
        for view in self.views.allObjects { view.show(image: preview) }
      }
    }
    guard !paused, now - lastThumb >= interval else { return }
    lastThumb = now
    guard let grey = thumbnail(image) else { return }
    let body: [String: Any] = [
      "grey": grey.bytes.base64EncodedString(),
      "width": grey.width,
      "height": grey.height,
      "atMs": Int((now - startedAt) * 1000),
    ]
    DispatchQueue.main.async { self.onThumb?(body) }
  }

  private func thumbnail(_ image: CIImage) -> (bytes: Data, width: Int, height: Int)? {
    let extent = image.extent
    guard extent.width > 0, extent.height > 0,
      let source = context.createCGImage(image, from: extent) else { return nil }
    let width = thumbWidth
    let height = max(1, Int((extent.height / extent.width * CGFloat(width)).rounded()))
    var bytes = Data(count: width * height)
    let drawn = bytes.withUnsafeMutableBytes { raw -> Bool in
      guard let graphics = CGContext(
        data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
      graphics.interpolationQuality = .medium
      graphics.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    return drawn ? (bytes, width, height) : nil
  }

  /// The newest frame at most 1280 pixels on its long edge, as a JPEG no larger than `maxBytes`.
  func keyframe(maxBytes: Int, done: @escaping ([String: Any]?) -> Void) {
    queue.async {
      guard let image = self.latest, let space = CGColorSpace(name: CGColorSpace.sRGB) else {
        DispatchQueue.main.async { done(nil) }
        return
      }
      let began = CACurrentMediaTime()
      let extent = image.extent
      let scale = min(1, 1280 / max(extent.width, extent.height))
      let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      var chosen: Data?
      for quality in [0.8, 0.6, 0.45] {
        let options = [
          CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): quality
        ]
        guard let data = self.context.jpegRepresentation(of: scaled, colorSpace: space, options: options)
        else { continue }
        chosen = data
        if data.count <= maxBytes { break }
      }
      guard let data = chosen, data.count <= maxBytes else {
        DispatchQueue.main.async { done(nil) }
        return
      }
      let body: [String: Any] = [
        "jpeg": data.base64EncodedString(),
        "bytes": data.count,
        "width": Int(scaled.extent.width.rounded()),
        "height": Int(scaled.extent.height.rounded()),
        "prepareMs": Int((CACurrentMediaTime() - began) * 1000),
      ]
      DispatchQueue.main.async { done(body) }
    }
  }

  func pause() {
    guard running, !paused else { return }
    paused = true
    if !testing { queue.async { self.session.stopRunning() } }
    onState?("paused")
  }

  func resume() {
    guard running, paused else { return }
    queue.async {
      if !self.testing { self.session.startRunning() }
      self.lastThumb = 0
      self.paused = false
      DispatchQueue.main.async { self.onState?("resumed") }
    }
  }

  func stop() {
    generation += 1
    let wasRunning = running
    running = false
    paused = false
    timer?.cancel()
    timer = nil
    reader?.cancelReading()
    reader = nil
    readerOutput = nil
    testing = false
    if wasRunning {
      queue.async {
        if self.session.isRunning { self.session.stopRunning() }
        self.latest = nil
      }
    }
    refreshViews()
  }
}

/// The self-preview: the live camera layer, or the test video's frames.
final class CallCameraView: ExpoView {
  private let preview = AVCaptureVideoPreviewLayer()
  private let still = CALayer()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    preview.videoGravity = .resizeAspectFill
    still.contentsGravity = .resizeAspectFill
    layer.addSublayer(still)
    layer.addSublayer(preview)
    CallCamera.shared.attach(self)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    preview.frame = bounds
    still.frame = bounds
    CATransaction.commit()
  }

  func show(session: AVCaptureSession?, mirrored: Bool) {
    preview.session = session
    preview.isHidden = session == nil
    if let connection = preview.connection, connection.isVideoMirroringSupported {
      connection.automaticallyAdjustsVideoMirroring = false
      connection.isVideoMirrored = mirrored
    }
    if session != nil { still.contents = nil }
  }

  func show(image: CGImage) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    still.contents = image
    CATransaction.commit()
  }
}
