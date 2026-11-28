import ExpoModulesCore
import UIKit

struct SheetSearchQuery: Record {
  @Field var value = ""
  @Field var eventCount = 0
}

public final class SheetSearchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SheetSearch")
    View(SheetSearchView.self) {
      Events("onQueryChange")
      Prop("query") { (view: SheetSearchView, query: SheetSearchQuery) in view.apply(query) }
      Prop("placeholder") { (view: SheetSearchView, placeholder: String) in
        view.searchBar.placeholder = placeholder
        view.searchBar.searchTextField.accessibilityLabel = placeholder
      }
      Prop("inputID") { (view: SheetSearchView, id: String) in
        view.searchBar.searchTextField.accessibilityIdentifier = id
      }
      Prop("scheme") { (view: SheetSearchView, scheme: String) in
        let dark = scheme == "dark"
        view.overrideUserInterfaceStyle = dark ? .dark : .light
        view.searchBar.keyboardAppearance = dark ? .dark : .light
      }
    }
  }
}

final class SheetSearchView: ExpoView, UISearchBarDelegate {
  let onQueryChange = EventDispatcher()
  let searchBar = UISearchBar()
  private var eventCount = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    searchBar.searchBarStyle = .minimal
    searchBar.autocapitalizationType = .none
    searchBar.autocorrectionType = .no
    searchBar.returnKeyType = .search
    searchBar.searchTextField.clearButtonMode = .whileEditing
    searchBar.searchTextField.font = UIFont.preferredFont(forTextStyle: .body)
    searchBar.searchTextField.adjustsFontForContentSizeCategory = true
    searchBar.delegate = self
    addSubview(searchBar)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    searchBar.frame = bounds
  }

  func apply(_ query: SheetSearchQuery) {
    // UIKit may already hold a newer edit than the value returned by React.
    guard query.eventCount == eventCount, searchBar.text != query.value else { return }
    searchBar.text = query.value
  }

  func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
    eventCount += 1
    onQueryChange(["value": searchText, "eventCount": eventCount])
  }

  func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
    searchBar.searchTextField.resignFirstResponder()
  }
}
