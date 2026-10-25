import MetalKit
import WebRTC

// A single latest decoded frame and one GPU command buffer bound retained work. Counts
// advance from drawable presentation, never from a timer repaint or decoder arrivals alone.
final class VideoRenderer: MTKView, RTCVideoRenderer, MTKViewDelegate {
  private let mutex = NSLock()
  private let gpuWork = DispatchGroup()
  private var latest: RTCVideoFrame?
  private var stopped = false
  private var received = 0
  private var rendered = 0
  private var presented = 0
  private var lastPresented: CFTimeInterval = 0
  private var lastSequence = 0
  private var inFlight = false
  private let commands: MTLCommandQueue
  private let pipeline: MTLRenderPipelineState

  init?(maximumFramesPerSecond: Int) {
    guard (1...30).contains(maximumFramesPerSecond) else { return nil }
    guard let device = MTLCreateSystemDefaultDevice(), let commands = device.makeCommandQueue() else { return nil }
    self.commands = commands
    let shader = """
    #include <metal_stdlib>
    using namespace metal;
    struct V { float4 position [[position]]; float2 uv; };
    vertex V vertex_main(uint i [[vertex_id]]) {
      float2 p[4] = {float2(-1,1),float2(-1,-1),float2(1,1),float2(1,-1)};
      float2 t[4] = {float2(0,0),float2(0,1),float2(1,0),float2(1,1)};
      return {float4(p[i],0,1),t[i]};
    }
    fragment float4 fragment_main(V v [[stage_in]], texture2d<float> y [[texture(0)]], texture2d<float> u [[texture(1)]], texture2d<float> c [[texture(2)]]) {
      constexpr sampler s(filter::linear, address::clamp_to_edge);
      float Y = 1.16438356 * (y.sample(s,v.uv).r - 16.0/255.0);
      float U = u.sample(s,v.uv).r - 0.5, Vv = c.sample(s,v.uv).r - 0.5;
      return float4(Y + 1.59602678*Vv, Y - 0.39176229*U - 0.81296764*Vv, Y + 2.01723214*U, 1);
    }
    """
    do {
      let library = try device.makeLibrary(source: shader, options: nil)
      let descriptor = MTLRenderPipelineDescriptor()
      descriptor.vertexFunction = library.makeFunction(name: "vertex_main")
      descriptor.fragmentFunction = library.makeFunction(name: "fragment_main")
      descriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
      pipeline = try device.makeRenderPipelineState(descriptor: descriptor)
    } catch { return nil }
    super.init(frame: .zero, device: device)
    colorPixelFormat = .bgra8Unorm
    framebufferOnly = true
    preferredFramesPerSecond = maximumFramesPerSecond
    enableSetNeedsDisplay = false
    delegate = self
    isOpaque = true
    clearColor = MTLClearColorMake(0, 0, 0, 1)
    autoResizeDrawable = true
  }
  required init(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
  func setSize(_ size: CGSize) {}
  func renderFrame(_ frame: RTCVideoFrame?) {
    guard let frame, frame.width > 0, frame.height > 0, frame.width <= 8192, frame.height <= 8192, frame.rotation.rawValue == 0 else { return }
    mutex.lock(); defer { mutex.unlock() }
    guard !stopped else { return }
    latest = frame; received += 1
  }
  func stop() {
    mutex.lock(); stopped = true; latest = nil; mutex.unlock()
    // Called on main by the view lifecycle before the asynchronous peer cleanup.
    isPaused = true; alpha = 0
  }
  func waitForGPU() { gpuWork.wait() }
  func sample() -> (Int, Int, Int, Double) {
    mutex.lock(); defer { mutex.unlock() }
    return (received, rendered, presented, lastPresented == 0 ? 60000 : (CACurrentMediaTime() - lastPresented) * 1000)
  }
  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}
  func draw(in view: MTKView) {
    mutex.lock()
    guard !stopped, !inFlight, received != lastSequence, let frame = latest else { mutex.unlock(); return }
    let sequence = received
    inFlight = true
    gpuWork.enter()
    mutex.unlock()
    func abandon() { mutex.lock(); inFlight = false; mutex.unlock(); gpuWork.leave() }
    let buffer = frame.buffer.toI420()
    let planes: [(UnsafePointer<UInt8>, Int, Int, Int)] = [
      (buffer.dataY, Int(buffer.width), Int(buffer.height), Int(buffer.strideY)),
      (buffer.dataU, Int(buffer.chromaWidth), Int(buffer.chromaHeight), Int(buffer.strideU)),
      (buffer.dataV, Int(buffer.chromaWidth), Int(buffer.chromaHeight), Int(buffer.strideV))
    ]
    var textures: [MTLTexture] = []
    for (bytes, width, height, stride) in planes {
      let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .r8Unorm, width: width, height: height, mipmapped: false)
      descriptor.usage = .shaderRead
      guard let texture = device?.makeTexture(descriptor: descriptor) else { abandon(); return }
      texture.replace(region: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0, withBytes: bytes, bytesPerRow: stride)
      textures.append(texture)
    }
    // Reveal only once a current frame exists. Hidden MTKViews do not vend a drawable.
    alpha = 1
    guard let drawable = currentDrawable, let descriptor = currentRenderPassDescriptor,
      let command = commands.makeCommandBuffer(), let encoder = command.makeRenderCommandEncoder(descriptor: descriptor) else { abandon(); return }
    encoder.setRenderPipelineState(pipeline)
    for (index, texture) in textures.enumerated() { encoder.setFragmentTexture(texture, index: index) }
    encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    encoder.endEncoding()
    #if !targetEnvironment(simulator)
    drawable.addPresentedHandler { [weak self] drawable in
      guard let self else { return }
      self.mutex.lock(); defer { self.mutex.unlock() }
      guard !self.stopped, drawable.presentedTime > 0 else { return }
      self.presented += 1; self.lastPresented = CACurrentMediaTime()
    }
    #endif
    // Simulator lacks drawable presentation receipts. Keep rendering diagnostic-only;
    // never turn a GPU completion into permission to drive the real desktop.
    command.addCompletedHandler { [self] command in
      defer { gpuWork.leave() }
      self.mutex.lock(); defer { self.mutex.unlock() }
      if !self.stopped && command.status == .completed { self.rendered += 1; self.lastSequence = sequence }
      self.inFlight = false
    }
    command.present(drawable)
    command.commit()
  }
}
