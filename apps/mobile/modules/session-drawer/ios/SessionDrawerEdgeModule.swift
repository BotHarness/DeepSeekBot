import ExpoModulesCore
import UIKit

public final class SessionDrawerEdgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SessionDrawerEdge")
    View(SessionDrawerEdgeView.self) {
      Prop("edge") { (view: SessionDrawerEdgeView, edge: String) in
        view.edge = edge == "bottom" ? .bottom : .top
      }
    }
  }
}

/// A header or footer that floats over the drawer's Session list. It registers itself with the
/// list as a scroll edge element container, so UIKit draws its own scroll edge effect under the
/// whole bar, the way it does under a navigation bar or toolbar, instead of only the safe area.
final class SessionDrawerEdgeView: ExpoView {
  var edge: UIRectEdge = .top {
    didSet { if edge != oldValue { attach() } }
  }
  private var interaction: UIInteraction?
  private weak var attachedScrollView: UIScrollView?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    attach()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if window != nil, attachedScrollView == nil { attach() }
  }

  private func attach() {
    guard #available(iOS 26.0, *) else { return }
    if let old = interaction {
      removeInteraction(old)
      interaction = nil
      attachedScrollView = nil
    }
    guard window != nil, let scrollView = siblingScrollView() else { return }
    let next = UIScrollEdgeElementContainerInteraction()
    next.scrollView = scrollView
    next.edge = edge
    addInteraction(next)
    interaction = next
    attachedScrollView = scrollView
  }

  /// The nearest scroll view that is not inside this bar, searched breadth-first from the bar's
  /// parent outward, which is the Session list the bar floats over.
  private func siblingScrollView() -> UIScrollView? {
    var parent = superview
    while let current = parent {
      var queue = current.subviews.filter { $0 !== self }
      while !queue.isEmpty {
        let view = queue.removeFirst()
        if let scrollView = view as? UIScrollView { return scrollView }
        queue.append(contentsOf: view.subviews)
      }
      parent = current.superview
    }
    return nil
  }
}
