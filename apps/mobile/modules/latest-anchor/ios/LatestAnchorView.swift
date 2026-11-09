import ExpoModulesCore
import QuartzCore
import UIKit

let latestStiffness: CGFloat = 22

func latestOffset(content: CGFloat, viewport: CGFloat, inset: UIEdgeInsets) -> CGFloat {
  max(-inset.top, content + inset.bottom - viewport)
}

func latestStep(
  position: CGFloat, velocity: CGFloat, target: CGFloat, omega: CGFloat, dt: CGFloat
) -> (position: CGFloat, velocity: CGFloat) {
  let offset = position - target
  let decay = exp(-omega * dt)
  let drift = velocity + omega * offset
  return (
    target + (offset + drift * dt) * decay,
    (velocity - omega * drift * dt) * decay
  )
}

private final class LatestTicker: NSObject {
  weak var view: LatestAnchorView?
  init(_ view: LatestAnchorView) { self.view = view }
  @objc func tick(_ link: CADisplayLink) { view?.tick(link) }
}

final class LatestAnchorView: ExpoView {
  var following = true {
    didSet { if !following { stop() } }
  }
  var animated = true
  private weak var scroller: UIScrollView?
  private var observation: NSKeyValueObservation?
  private var link: CADisplayLink?
  private var velocity: CGFloat = 0
  private var stamp: CFTimeInterval = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
  }

  deinit {
    link?.invalidate()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    attach()
  }

  var gliding: Bool { link != nil }

  private func attach() {
    observation?.invalidate()
    observation = nil
    stop()
    scroller = nil
    guard window != nil else { return }
    var node = superview
    while let current = node, !(current is UIScrollView) { node = current.superview }
    guard let scroll = node as? UIScrollView else { return }
    scroller = scroll
    observation = scroll.observe(\.contentSize, options: [.old, .new]) { [weak self] scroll, change in
      guard let old = change.oldValue, let new = change.newValue, old.height != new.height else {
        return
      }
      self?.grew(scroll, from: old.height)
    }
  }

  func grew(_ scroll: UIScrollView, from height: CGFloat) {
    guard following, height > 0, !scroll.isTracking, !scroll.isDecelerating else {
      stop()
      return
    }
    let target = latestOffset(
      content: scroll.contentSize.height, viewport: scroll.bounds.height,
      inset: scroll.adjustedContentInset)
    if !animated || !UIView.areAnimationsEnabled || UIAccessibility.isReduceMotionEnabled {
      stop()
      scroll.contentOffset.y = target
      return
    }
    start()
  }

  private func start() {
    guard link == nil else { return }
    velocity = 0
    stamp = 0
    let next = CADisplayLink(target: LatestTicker(self), selector: #selector(LatestTicker.tick(_:)))
    next.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
    next.add(to: .main, forMode: .common)
    link = next
  }

  func stop() {
    link?.invalidate()
    link = nil
    velocity = 0
  }

  func tick(_ link: CADisplayLink) {
    guard following, let scroll = scroller, !scroll.isTracking, !scroll.isDecelerating else {
      stop()
      return
    }
    let now = link.targetTimestamp
    let dt = stamp == 0 ? link.targetTimestamp - link.timestamp : now - stamp
    stamp = now
    let target = latestOffset(
      content: scroll.contentSize.height, viewport: scroll.bounds.height,
      inset: scroll.adjustedContentInset)
    let step = latestStep(
      position: scroll.contentOffset.y, velocity: velocity, target: target,
      omega: latestStiffness, dt: CGFloat(min(max(dt, 0), 1.0 / 30)))
    if abs(step.position - target) < 0.5 && abs(step.velocity) < 4 {
      scroll.contentOffset.y = target
      stop()
      return
    }
    velocity = step.velocity
    scroll.contentOffset.y = step.position
  }
}
