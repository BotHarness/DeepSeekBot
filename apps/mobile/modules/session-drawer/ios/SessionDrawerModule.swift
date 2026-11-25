import ExpoModulesCore
import UIKit

struct SessionDrawerSpring: Record {
  @Field var mass: Double = 1
  @Field var stiffness: Double = 300
  @Field var damping: Double = 35
}

public final class SessionDrawerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SessionDrawer")
    View(SessionDrawerView.self) {
      Events("onOpenChange", "onDragStart")
      Prop("open") { (view: SessionDrawerView, open: Bool) in view.request(open) }
      Prop("animated") { (view: SessionDrawerView, animated: Bool) in view.animated = animated }
      Prop("enabled") { (view: SessionDrawerView, enabled: Bool) in view.enabled = enabled }
      Prop("spring") { (view: SessionDrawerView, spring: SessionDrawerSpring) in view.spring = spring }
      Prop("shadowRadius") { (view: SessionDrawerView, radius: Double) in view.shadowRadius = CGFloat(radius) }
      Prop("shadowOpacity") { (view: SessionDrawerView, opacity: Double) in view.shadowOpacity = Float(opacity) }
      Prop("dimColor") { (view: SessionDrawerView, color: UIColor) in view.dimColor = color }
    }
  }
}

/// Modal Session drawer over its React Native children, which arrive in order: the page content,
/// the scrim and the panel. React Native lays them out; this view moves only the panel's
/// transform, the alpha of its own dimming view inside the scrim and the tab bar's alpha, so the
/// content never moves.
final class SessionDrawerView: ExpoView, UIGestureRecognizerDelegate {
  let onOpenChange = EventDispatcher()
  let onDragStart = EventDispatcher()
  var enabled = false
  var animated = true
  var spring = SessionDrawerSpring()
  var shadowRadius: CGFloat = 16
  var shadowOpacity: Float = 0.12
  var dimColor: UIColor = UIColor.black.withAlphaComponent(0.2) {
    didSet { dim.backgroundColor = dimColor }
  }

  /// The dimming is a plain UIView inside the React Native scrim, never the scrim's own alpha:
  /// Fabric's `invalidateLayer` resets a component view's `layer.opacity` to its `opacity` prop on
  /// every appearance change or background update, which left the closed page dimmed.
  private lazy var dim: UIView = {
    let view = UIView()
    view.isUserInteractionEnabled = false
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.backgroundColor = dimColor
    view.alpha = 0
    return view
  }()
  private var progress: CGFloat = 0
  private var start: CGFloat = 0
  private var target = false
  private var reported = false
  private var animator: UIViewPropertyAnimator?
  private var tabAlpha: CGFloat?
  /// Kept while attached: after the view leaves its superview the responder chain no longer
  /// reaches the tab bar controller, and the bar must still get its alpha back.
  private weak var attachedTabBar: UITabBar?
  private lazy var pan: UIPanGestureRecognizer = {
    let recognizer = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
    recognizer.delegate = self
    recognizer.maximumNumberOfTouches = 1
    return recognizer
  }()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addGestureRecognizer(pan)
  }

  private var scrim: UIView? { subviews.count > 2 ? subviews[1] : nil }
  private var panel: UIView? { subviews.count > 2 ? subviews[2] : nil }
  private var width: CGFloat { max(panel?.bounds.width ?? 0, 1) }
  private var leading: CGFloat { effectiveUserInterfaceLayoutDirection == .rightToLeft ? -1 : 1 }

  func request(_ open: Bool) {
    if open == target && (animator != nil || progress == (open ? 1 : 0)) { return }
    target = open
    reported = open
    settle(open, velocity: 0, animate: animated)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if animator == nil, pan.state != .changed { apply(progress) }
  }

  override func willRemoveSubview(_ subview: UIView) {
    super.willRemoveSubview(subview)
    // Fabric recycles component views; never hand one back moved, dimmed or shadowed.
    if dim.superview === subview { dim.removeFromSuperview() }
    subview.transform = .identity
    subview.alpha = 1
    subview.layer.shadowOpacity = 0
    subview.layer.shadowPath = nil
  }

  /// Compact width only: a regular-width window (iPad, a Plus or Max iPhone in landscape) gets a
  /// real split-view sidebar in #5263, so the swipe stays off there.
  private var compact: Bool { traitCollection.horizontalSizeClass != .regular }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil, tabAlpha != nil {
      attachedTabBar?.alpha = 1
      tabAlpha = nil
    }
  }

  private var tabBar: UITabBar? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController { return controller.tabBarController?.tabBar }
      responder = current.next
    }
    return nil
  }

  private func apply(_ value: CGFloat) {
    if value > 0 { shadow(true) }
    panel?.transform = CGAffineTransform(translationX: (value - 1) * width * leading, y: 0)
    if let scrim, dim.superview !== scrim {
      dim.removeFromSuperview()
      dim.frame = scrim.bounds
      scrim.insertSubview(dim, at: 0)
    }
    dim.alpha = value
    let alpha = 1 - value
    if tabAlpha != alpha {
      tabAlpha = alpha
      if let bar = tabBar { attachedTabBar = bar }
      attachedTabBar?.alpha = alpha
    }
  }

  /// The overlay sidebar's trailing-edge shadow. It stays on while the drawer moves or is open and
  /// goes off once it settles closed, so no shadow bleeds in from the closed panel at the edge.
  private func shadow(_ on: Bool) {
    guard let panel else { return }
    panel.layer.shadowColor = UIColor.black.cgColor
    panel.layer.shadowOffset = .zero
    panel.layer.shadowRadius = shadowRadius
    panel.layer.shadowOpacity = on ? shadowOpacity : 0
    panel.layer.shadowPath = on ? UIBezierPath(rect: panel.bounds).cgPath : nil
  }

  private func current() -> CGFloat {
    guard let panel else { return progress }
    return min(1, max(0, 1 + panel.transform.tx / (width * leading)))
  }

  private func settle(_ open: Bool, velocity: CGFloat, animate: Bool) {
    if let running = animator {
      running.stopAnimation(true)
      animator = nil
      progress = current()
    }
    let to: CGFloat = open ? 1 : 0
    let distance = to - progress
    guard animate, !UIAccessibility.isReduceMotionEnabled, abs(distance) > 0.001, panel != nil else {
      progress = to
      apply(to)
      finished(open)
      return
    }
    let timing = UISpringTimingParameters(
      mass: CGFloat(spring.mass),
      stiffness: CGFloat(spring.stiffness),
      damping: CGFloat(spring.damping),
      initialVelocity: CGVector(dx: velocity / distance, dy: 0)
    )
    let next = UIViewPropertyAnimator(duration: 0, timingParameters: timing)
    next.isInterruptible = true
    next.addAnimations { [weak self] in self?.apply(to) }
    next.addCompletion { [weak self] position in
      guard let self, position == .end else { return }
      self.animator = nil
      self.progress = to
      self.finished(open)
    }
    animator = next
    progress = to
    next.startAnimation()
  }

  private func finished(_ open: Bool) {
    target = open
    shadow(open)
    // Every settle at closed is reported, so a drag that started closed and fell back clears
    // the panel JavaScript revealed on `onDragStart`; an open is reported only when it changes.
    guard reported != open || !open else { return }
    reported = open
    onOpenChange(["open": open])
  }

  @objc private func panned(_ recognizer: UIPanGestureRecognizer) {
    switch recognizer.state {
    case .began:
      if let running = animator {
        running.stopAnimation(true)
        animator = nil
      }
      progress = current()
      start = progress
      onDragStart()
    case .changed:
      let travel = recognizer.translation(in: self).x * leading
      progress = min(1, max(0, start + travel / width))
      apply(progress)
    case .ended, .cancelled, .failed:
      let speed = recognizer.velocity(in: self).x * leading
      let open = sessionDrawerSettles(progress: progress, velocity: speed)
      target = open
      settle(open, velocity: speed / width, animate: true)
    default:
      break
    }
  }

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === pan else { return super.gestureRecognizerShouldBegin(gestureRecognizer) }
    let velocity = pan.velocity(in: self)
    guard abs(velocity.x) > abs(velocity.y) else { return false }
    let forward = velocity.x * leading > 0
    if target || progress > 0 { return !forward }
    guard enabled, compact, forward, panel != nil else { return false }
    return !scrollsBack(at: pan.location(in: self))
  }

  /// A horizontal scroller under the finger that can still scroll toward the leading edge keeps
  /// the swipe, so wide code blocks and tables scroll before the drawer opens.
  private func scrollsBack(at point: CGPoint) -> Bool {
    var view = hitTest(point, with: nil)
    while let current = view, current !== self {
      if let scroller = current as? UIScrollView,
        scroller.contentSize.width > scroller.bounds.width + 1
      {
        let edge = -scroller.adjustedContentInset.left
        let back = leading > 0 ? scroller.contentOffset.x > edge + 0.5 : true
        if back { return true }
      }
      view = current.superview
    }
    return false
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldBeRequiredToFailBy other: UIGestureRecognizer
  ) -> Bool {
    // A vertical list under the drawer waits until the swipe proves vertical, which the drawer
    // decides on its first movement, so a horizontal swipe never scrolls the list first.
    guard gestureRecognizer === pan, let scroller = other.view as? UIScrollView,
      other === scroller.panGestureRecognizer, scroller.isDescendant(of: self)
    else { return false }
    return scroller.contentSize.width <= scroller.bounds.width + 1
  }
}

/// Mirrors `settleSessionDrawer` in `session-drawer-model.ts`: a fling decides, otherwise the
/// drawer opens once it is more than 40% out.
func sessionDrawerSettles(progress: CGFloat, velocity: CGFloat) -> Bool {
  if velocity > 500 { return true }
  if velocity < -500 { return false }
  return progress > 0.4
}
