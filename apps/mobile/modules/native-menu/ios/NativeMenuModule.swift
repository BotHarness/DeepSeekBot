import ExpoModulesCore
import UIKit

struct NativeMenuItem: Record, Equatable {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var symbol: String = ""
  @Field var children: [NativeMenuItem] = []

  static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.id == rhs.id && lhs.label == rhs.label && lhs.symbol == rhs.symbol && lhs.children == rhs.children
  }
}

public final class NativeMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeMenu")
    View(NativeMenuView.self) {
      Events("onOpen", "onSelect")
      Prop("items") { (view: NativeMenuView, items: [NativeMenuItem]) in view.updateItems(items) }
      Prop("label") { (view: NativeMenuView, label: String) in view.button.accessibilityLabel = label }
      Prop("identifier") { (view: NativeMenuView, id: String) in view.button.accessibilityIdentifier = id }
      Prop("disabled") { (view: NativeMenuView, disabled: Bool) in view.button.isEnabled = !disabled }
      Prop("embedded") { (view: NativeMenuView, embedded: Bool) in view.embedded = embedded }
      Prop("ink") { (view: NativeMenuView, ink: UIColor) in view.ink = ink }
      Prop("fill") { (view: NativeMenuView, fill: UIColor) in view.fill = fill }
      Prop("iconSize") { (view: NativeMenuView, size: Double) in view.iconSize = size }
      Prop("scheme") { (view: NativeMenuView, scheme: String) in
        view.overrideUserInterfaceStyle = scheme == "dark" ? .dark : .light
      }
    }
  }
}

final class NativeMenuView: ExpoView {
  let onOpen = EventDispatcher()
  let onSelect = EventDispatcher()
  let button = UIButton(type: .system)
  private var items: [NativeMenuItem] = []
  var embedded = false { didSet { configure() } }
  var ink = UIColor.label { didSet { configure() } }
  var fill = UIColor.secondarySystemBackground { didSet { configure() } }
  var iconSize = 22.0 { didSet { configure() } }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addSubview(button)
    button.showsMenuAsPrimaryAction = true
    button.preferredMenuElementOrder = .fixed
    button.addTarget(self, action: #selector(opening), for: .menuActionTriggered)
    configure()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
  }

  private func configure() {
    var config = UIButton.Configuration.plain()
    if !embedded {
      if #available(iOS 26.0, *) {
        config = .glass()
      } else {
        config = .gray()
        config.baseBackgroundColor = fill
      }
    }
    config.cornerStyle = .capsule
    config.baseForegroundColor = ink
    config.image = UIImage(systemName: "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: iconSize))
    config.contentInsets = .zero
    button.configuration = config
  }

  func updateItems(_ next: [NativeMenuItem]) {
    guard next != items else { return }
    items = next
    button.menu = UIMenu(children: next.map(element))
  }

  private func element(_ item: NativeMenuItem) -> UIMenuElement {
    let image = UIImage(systemName: item.symbol)
    if !item.children.isEmpty {
      return UIMenu(title: item.label, image: image, identifier: UIMenu.Identifier(item.id), children: item.children.map(element))
    }
    return UIAction(title: item.label, image: image, identifier: UIAction.Identifier(item.id)) { [weak self] _ in
      guard let self, self.button.isEnabled else { return }
      self.onSelect(["id": item.id])
    }
  }

  @objc private func opening() {
    guard button.isEnabled else { return }
    onOpen()
  }
}
