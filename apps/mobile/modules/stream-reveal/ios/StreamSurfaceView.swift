import ExpoModulesCore
import UIKit

final class StreamSurfaceView: ExpoView {
  let surface = UIView()
  let background = CAShapeLayer()
  var active = false
  var corners: [Double] = []
  var duration = 0.0
  var mass = 0.0
  var stiffness = 0.0
  var damping = 0.0
  private let boundary = CAShapeLayer()
  private var previousBounds = CGRect.zero
  private var previousCorners: [Double] = []
  private var deadline: CFTimeInterval = 0
  private var reduceMotionObserver: NSObjectProtocol?
  private let animationKey = "stream-growth"

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    surface.layer.addSublayer(background)
    addSubview(surface)
    reduceMotionObserver = NotificationCenter.default.addObserver(
      forName: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.sync() }
  }

  deinit {
    if let reduceMotionObserver { NotificationCenter.default.removeObserver(reduceMotionObserver) }
  }

  // Fabric retains each child's final frame; only its parent clipping layer animates.
  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    surface.insertSubview(childComponentView, at: index)
    surface.layer.insertSublayer(background, at: 0)
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sync()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    deadline = 0
    boundary.removeAllAnimations()
    previousBounds = .zero
    sync()
  }

  func setSurfaceColor(_ color: UIColor) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    background.fillColor = color.cgColor
    CATransaction.commit()
  }

  func sync() {
    let rect = CGRect(origin: .zero, size: bounds.size)
    guard rect.width.isFinite, rect.height.isFinite, rect.width >= 0, rect.height >= 0 else {
      boundary.removeAllAnimations()
      deadline = 0
      return
    }
    let geometryChanged = previousBounds != rect || previousCorners != corners
    let enabled = active && window != nil && !UIAccessibility.isReduceMotionEnabled
    if !geometryChanged && enabled { return }
    let now = CACurrentMediaTime()
    let from = (boundary.presentation() as? CAShapeLayer)?.path ?? boundary.path
    let pending = boundary.animation(forKey: animationKey) != nil
    let canGrow = enabled && previousBounds.width == rect.width && previousBounds.height > 0
      && rect.height > previousBounds.height && previousCorners == corners
      && duration.isFinite && duration > 0 && mass.isFinite && mass > 0
      && stiffness.isFinite && stiffness > 0 && damping.isFinite && damping > 0
    let target = surfacePath(rect, corners: corners)
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    surface.frame = rect
    boundary.frame = rect
    background.frame = rect
    background.path = target
    boundary.path = target
    surface.layer.mask = active ? boundary : nil
    CATransaction.commit()
    previousBounds = rect
    previousCorners = corners
    boundary.removeAnimation(forKey: animationKey)
    guard canGrow, let from else { deadline = 0; return }
    // Retarget within the original budget instead of accumulating reveal latency.
    if !pending { deadline = now + min(duration / 1000, 0.3) }
    let remaining = deadline - now
    guard remaining > 0 else { deadline = 0; return }
    let animation = CASpringAnimation(keyPath: "path")
    animation.mass = mass
    animation.stiffness = stiffness
    animation.damping = damping
    animation.fromValue = from
    animation.toValue = target
    animation.duration = animation.settlingDuration
    guard animation.duration.isFinite, animation.duration > 0 else { deadline = 0; return }
    animation.speed = Float(animation.duration / remaining)
    boundary.add(animation, forKey: animationKey)
  }
}

// Fixed path topology lets Core Animation interpolate all four corners together.
private func surfacePath(_ rect: CGRect, corners: [Double]) -> CGPath {
  let raw = (0..<4).map { index -> CGFloat in
    guard index < corners.count, corners[index].isFinite else { return 0 }
    return max(0, CGFloat(corners[index]))
  }
  let w = rect.width, h = rect.height
  let ratios = [(w, raw[0] + raw[1]), (w, raw[3] + raw[2]),
                (h, raw[0] + raw[3]), (h, raw[1] + raw[2])]
  let scale = ratios.reduce(CGFloat(1)) { result, pair in
    pair.1 > 0 ? min(result, pair.0 / pair.1) : result
  }
  let r = raw.map { $0 * scale }
  let path = CGMutablePath()
  let k: CGFloat = 0.5522847498307936
  path.move(to: CGPoint(x: r[0], y: 0))
  path.addLine(to: CGPoint(x: w - r[1], y: 0))
  path.addCurve(to: CGPoint(x: w, y: r[1]),
    control1: CGPoint(x: w - r[1] + k * r[1], y: 0),
    control2: CGPoint(x: w, y: r[1] - k * r[1]))
  path.addLine(to: CGPoint(x: w, y: h - r[2]))
  path.addCurve(to: CGPoint(x: w - r[2], y: h),
    control1: CGPoint(x: w, y: h - r[2] + k * r[2]),
    control2: CGPoint(x: w - r[2] + k * r[2], y: h))
  path.addLine(to: CGPoint(x: r[3], y: h))
  path.addCurve(to: CGPoint(x: 0, y: h - r[3]),
    control1: CGPoint(x: r[3] - k * r[3], y: h),
    control2: CGPoint(x: 0, y: h - r[3] + k * r[3]))
  path.addLine(to: CGPoint(x: 0, y: r[0]))
  path.addCurve(to: CGPoint(x: r[0], y: 0),
    control1: CGPoint(x: 0, y: r[0] - k * r[0]),
    control2: CGPoint(x: r[0] - k * r[0], y: 0))
  path.closeSubpath()
  return path
}
