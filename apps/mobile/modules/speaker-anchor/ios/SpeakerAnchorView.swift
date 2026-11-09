import ExpoModulesCore
import UIKit

func speakerOffset(top: CGFloat, height: CGFloat, rest: CGFloat, span: CGFloat, floor: CGFloat) -> CGFloat {
  let bottom = top + rest + height
  let lift = min(max(0, bottom - floor), max(0, rest + span))
  return rest - lift
}

final class SpeakerAnchorView: ExpoView {
  let host = UIView()
  var rest: CGFloat = 0
  var span: CGFloat = 0
  var floor: CGFloat = 0
  var viewportId = "" {
    didSet { if oldValue != viewportId { viewport = nil } }
  }
  private weak var scroller: UIScrollView?
  private weak var viewport: UIView?
  private var observations: [NSKeyValueObservation] = []

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    host.isUserInteractionEnabled = true
    addSubview(host)
  }

  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    host.insertSubview(childComponentView, at: index)
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.bounds = CGRect(origin: .zero, size: bounds.size)
    host.center = CGPoint(x: bounds.midX, y: bounds.midY)
    place()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    attach()
    place()
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let inner = convert(point, to: host)
    return host.hitTest(inner, with: event)
  }

  private func attach() {
    observations.forEach { $0.invalidate() }
    observations = []
    scroller = nil
    viewport = nil
    guard window != nil else { return }
    var node = superview
    while let current = node, !(current is UIScrollView) { node = current.superview }
    guard let scroll = node as? UIScrollView else { return }
    scroller = scroll
    let update: (UIScrollView) -> Void = { [weak self] _ in self?.place() }
    observations = [
      scroll.observe(\.contentOffset, options: []) { scroll, _ in update(scroll) },
      scroll.observe(\.contentSize, options: []) { scroll, _ in update(scroll) },
      scroll.observe(\.bounds, options: []) { scroll, _ in update(scroll) },
    ]
  }

  private func findViewport() -> UIView? {
    if let viewport, viewport.window != nil { return viewport }
    guard !viewportId.isEmpty else { return nil }
    let selector = NSSelectorFromString("nativeId")
    var node = scroller?.superview
    while let current = node {
      for child in current.subviews where child.responds(to: selector) {
        if child.value(forKey: "nativeId") as? String == viewportId {
          viewport = child
          return child
        }
      }
      node = current.superview
    }
    return nil
  }

  func place() {
    guard window != nil, let scroll = scroller else { return }
    let target = findViewport() ?? scroll
    var frame = convert(bounds, to: target)
    if target === scroll { frame.origin.y -= scroll.bounds.origin.y }
    let offset = speakerOffset(
      top: frame.minY, height: bounds.height, rest: rest, span: span,
      floor: target.bounds.height - floor)
    guard offset.isFinite else { return }
    let next = CGAffineTransform(translationX: 0, y: offset)
    if host.transform == next { return }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    host.transform = next
    CATransaction.commit()
  }
}
