import ExpoModulesCore
import UIKit

struct NativeTabMenuItem: Record, Equatable {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var symbol: String = ""

  static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.id == rhs.id && lhs.label == rhs.label && lhs.symbol == rhs.symbol
  }
}

struct NativeTabMenuSpec: Record {
  @Field var tab: String = ""
  @Field var name: String = ""
  @Field var recent: [NativeTabMenuItem] = []
  @Field var actions: [NativeTabMenuItem] = []
}

public final class NativeTabMenusModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeTabMenus")
    View(NativeTabMenusView.self) {
      Events("onSelect", "onPill")
      Prop("tabs") { (view: NativeTabMenusView, tabs: [NativeTabMenuSpec]) in view.update(tabs) }
      Prop("pill") { (view: NativeTabMenusView, pill: Bool) in view.pillEnabled = pill }
      Prop("pillFade") { (view: NativeTabMenusView, ms: Double) in view.pillFade = ms / 1000 }
      Prop("pillHold") { (view: NativeTabMenusView, ms: Double) in view.pillHold = ms / 1000 }
      Prop("fade") { (view: NativeTabMenusView, ms: Double) in view.fade = ms / 1000 }
    }
  }
}

final class NativeTabMenusView: ExpoView, UIContextMenuInteractionDelegate, UIGestureRecognizerDelegate {
  let onSelect = EventDispatcher()
  let onPill = EventDispatcher()
  var pillEnabled = false
  var pillFade = 0.16
  var pillHold = 0.7
  var fade = 0.0
  private var selectedAtTouch: String?
  private var specs: [NativeTabMenuSpec] = []
  private weak var controller: UITabBarController?
  private weak var attachedBar: UITabBar?
  private lazy var interaction = UIContextMenuInteraction(delegate: self)
  private lazy var tap: UITapGestureRecognizer = {
    let recognizer = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
    recognizer.cancelsTouchesInView = false
    recognizer.delaysTouchesEnded = false
    recognizer.delegate = self
    return recognizer
  }()
  private weak var pill: UIView?
  private var attempts = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    isAccessibilityElement = false
    accessibilityElementsHidden = true
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detach()
      return
    }
    attempts = 0
    attach()
  }

  func update(_ next: [NativeTabMenuSpec]) {
    specs = next
    attempts = 0
    attach()
  }

  private func attach() {
    guard #available(iOS 18.0, *), let root = window?.rootViewController else { return }
    if let found = Self.tabBarController(from: root), found.tabBar.window != nil {
      if found !== controller || found.tabBar !== attachedBar {
        detach()
        controller = found
        attachedBar = found.tabBar
        found.tabBar.addInteraction(interaction)
        found.tabBar.addGestureRecognizer(tap)
      }
    }
    guard attempts < 12 else { return }
    attempts += 1
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.attach() }
  }

  private func detach() {
    attachedBar?.removeInteraction(interaction)
    attachedBar?.removeGestureRecognizer(tap)
    attachedBar = nil
    controller = nil
  }

  private static func tabBarController(from root: UIViewController) -> UITabBarController? {
    var queue: [UIViewController] = [root]
    var found: UITabBarController?
    while !queue.isEmpty {
      let next = queue.removeFirst()
      if let tabs = next as? UITabBarController, tabs.viewIfLoaded?.window != nil { found = tabs }
      queue.append(contentsOf: next.children)
      if let presented = next.presentedViewController { queue.append(presented) }
    }
    return found
  }

  private func buttons(in bar: UITabBar) -> [UIView] {
    var byCenter: [Int: UIView] = [:]
    func visit(_ view: UIView) {
      if view is UIControl, view.isAccessibilityElement, !view.isHidden, view.alpha > 0.01 {
        byCenter[Int(view.convert(view.bounds, to: bar).midX.rounded())] = view
        return
      }
      view.subviews.forEach(visit)
    }
    visit(bar)
    let ordered = byCenter.keys.sorted().compactMap { byCenter[$0] }
    return bar.effectiveUserInterfaceLayoutDirection == .rightToLeft ? ordered.reversed() : ordered
  }

  private func spec(at location: CGPoint, in bar: UITabBar) -> (NativeTabMenuSpec, UIView)? {
    guard #available(iOS 18.0, *), let controller else { return nil }
    let visible = controller.tabs.filter { !$0.isHidden }
    let views = buttons(in: bar)
    guard views.count == visible.count,
      let index = views.firstIndex(where: { $0.convert($0.bounds, to: bar).contains(location) })
    else { return nil }
    let identifier = visible[index].identifier
    guard let match = specs.first(where: { identifier == $0.tab || identifier.hasPrefix($0.tab + "-") })
    else { return nil }
    return (match, views[index])
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    guard let bar = attachedBar, let (spec, view) = spec(at: location, in: bar) else { return nil }
    if spec.recent.isEmpty && spec.actions.isEmpty {
      if pillEnabled, !spec.name.isEmpty { showPill(spec.name, over: view, in: bar) }
      return nil
    }
    return UIContextMenuConfiguration(identifier: spec.tab as NSString, previewProvider: nil) {
      [weak self] _ in
      guard let self else { return nil }
      let recent = spec.recent.map { self.action(spec.tab, $0) }
      let actions = spec.actions.map { self.action(spec.tab, $0) }
      let groups: [UIMenuElement] = recent.isEmpty ? actions : [UIMenu(options: .displayInline, children: recent)] + actions
      return UIMenu(title: spec.name, children: groups)
    }
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configuration: UIContextMenuConfiguration,
    highlightPreviewForItemWithIdentifier identifier: any NSCopying
  ) -> UITargetedPreview? {
    preview(for: configuration)
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configuration: UIContextMenuConfiguration,
    dismissalPreviewForItemWithIdentifier identifier: any NSCopying
  ) -> UITargetedPreview? {
    preview(for: configuration)
  }

  private func preview(for configuration: UIContextMenuConfiguration) -> UITargetedPreview? {
    guard #available(iOS 18.0, *), let bar = attachedBar, let controller,
      let tab = configuration.identifier as? String
    else { return nil }
    let visible = controller.tabs.filter { !$0.isHidden }
    let views = buttons(in: bar)
    guard views.count == visible.count,
      let index = visible.firstIndex(where: { $0.identifier == tab || $0.identifier.hasPrefix(tab + "-") })
    else { return nil }
    let frame = views[index].convert(views[index].bounds, to: bar)
    let anchor = UIView(frame: CGRect(origin: .zero, size: frame.size))
    anchor.backgroundColor = .clear
    let parameters = UIPreviewParameters()
    parameters.visiblePath = UIBezierPath(roundedRect: anchor.bounds, cornerRadius: frame.height / 2)
    parameters.backgroundColor = .clear
    parameters.shadowPath = UIBezierPath()
    return UITargetedPreview(
      view: anchor, parameters: parameters,
      target: UIPreviewTarget(container: bar, center: CGPoint(x: frame.midX, y: frame.midY)))
  }

  private func action(_ tab: String, _ item: NativeTabMenuItem) -> UIAction {
    UIAction(
      title: item.label, image: item.symbol.isEmpty ? nil : UIImage(systemName: item.symbol),
      identifier: UIAction.Identifier("\(tab)/\(item.id)")
    ) { [weak self] _ in
      self?.onSelect(["tab": tab, "id": item.id])
    }
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
  ) -> Bool {
    true
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    if #available(iOS 18.0, *) { selectedAtTouch = controller?.selectedTab?.identifier }
    return true
  }

  @objc private func tapped(_ recognizer: UITapGestureRecognizer) {
    guard recognizer.state == .ended, let bar = attachedBar,
      let (spec, view) = spec(at: recognizer.location(in: bar), in: bar)
    else { return }
    let switching = selectedAtTouch.map { $0 != spec.tab && !$0.hasPrefix(spec.tab + "-") } ?? false
    if switching { crossFade(above: bar) }
    guard pillEnabled, !spec.name.isEmpty else { return }
    showPill(spec.name, over: view, in: bar)
    onPill(["tab": spec.tab])
  }

  private func crossFade(above bar: UITabBar) {
    guard fade > 0, !UIAccessibility.isReduceMotionEnabled, let host = controller?.view,
      let snapshot = host.snapshotView(afterScreenUpdates: false)
    else { return }
    let barTop = bar.convert(bar.bounds, to: host).minY
    let mask = CALayer()
    mask.backgroundColor = UIColor.black.cgColor
    mask.frame = CGRect(x: 0, y: 0, width: host.bounds.width, height: barTop)
    snapshot.layer.mask = mask
    snapshot.isUserInteractionEnabled = false
    snapshot.isAccessibilityElement = false
    snapshot.accessibilityElementsHidden = true
    snapshot.frame = host.bounds
    host.addSubview(snapshot)
    if let pill { host.bringSubviewToFront(pill) }
    UIView.animate(withDuration: fade, delay: 0, options: [.curveEaseOut]) {
      snapshot.alpha = 0
    } completion: { _ in
      snapshot.removeFromSuperview()
    }
  }

  private func showPill(_ text: String, over item: UIView, in bar: UITabBar) {
    guard let host = controller?.view else { return }
    pill?.removeFromSuperview()
    let label = UILabel()
    label.text = text
    label.font = UIFontMetrics(forTextStyle: .footnote).scaledFont(
      for: .systemFont(ofSize: UIFont.preferredFont(forTextStyle: .footnote).pointSize, weight: .semibold))
    label.adjustsFontForContentSizeCategory = true
    label.textColor = .systemBackground
    label.numberOfLines = 1
    let capsule = UIView()
    capsule.backgroundColor = .label
    capsule.isUserInteractionEnabled = false
    capsule.isAccessibilityElement = false
    capsule.accessibilityElementsHidden = true
    capsule.accessibilityIdentifier = "native-tab-name-pill"
    capsule.addSubview(label)
    let size = label.sizeThatFits(CGSize(width: host.bounds.width - 32, height: .greatestFiniteMagnitude))
    let width = min(size.width + 24, host.bounds.width - 16)
    let height = size.height + 8
    let frame = item.convert(item.bounds, to: host)
    let x = min(max(frame.midX - width / 2, 8), host.bounds.width - width - 8)
    capsule.frame = CGRect(x: x, y: frame.minY - height - 4, width: width, height: height)
    capsule.layer.cornerRadius = height / 2
    capsule.layer.cornerCurve = .continuous
    label.frame = capsule.bounds.insetBy(dx: 12, dy: 4)
    label.textAlignment = .center
    host.addSubview(capsule)
    pill = capsule
    let reduced = UIAccessibility.isReduceMotionEnabled
    capsule.alpha = reduced ? 1 : 0
    UIView.animate(withDuration: reduced ? 0 : pillFade) { capsule.alpha = 1 }
    UIView.animate(
      withDuration: reduced ? 0 : pillFade, delay: pillFade + pillHold, options: [.beginFromCurrentState]
    ) {
      capsule.alpha = reduced ? 1 : 0
    } completion: { [weak capsule] _ in
      capsule?.removeFromSuperview()
    }
  }
}
