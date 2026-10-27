package expo.modules.materialsearchbar

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MaterialSearchBarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialSearchBar")
    View(MaterialSearchBarView::class) {
      Events("onQueryChange", "onExpandedChange", "onPick", "onNavigation")
      Prop("placeholder") { view: MaterialSearchBarView, value: String -> view.placeholder = value }
      Prop("navigationLabel") { view: MaterialSearchBarView, value: String -> view.navigationLabel = value }
      Prop("closeLabel") { view: MaterialSearchBarView, value: String -> view.closeLabel = value }
      Prop("clearLabel") { view: MaterialSearchBarView, value: String -> view.clearLabel = value }
      Prop("emptyText") { view: MaterialSearchBarView, value: String -> view.emptyText = value }
      Prop("busy") { view: MaterialSearchBarView, value: Boolean -> view.busy = value }
      Prop("results") { view: MaterialSearchBarView, value: List<SearchResult> -> view.results = value }
      Prop("dark") { view: MaterialSearchBarView, value: Boolean -> view.dark = value }
      Prop("foreground") { view: MaterialSearchBarView, value: String -> view.foreground = value }
      Prop("muted") { view: MaterialSearchBarView, value: String -> view.muted = value }
      Prop("surface") { view: MaterialSearchBarView, value: String -> view.surface = value }
      Prop("base") { view: MaterialSearchBarView, value: String -> view.base = value }
      Prop("accent") { view: MaterialSearchBarView, value: String -> view.accent = value }
      Prop("accentContent") { view: MaterialSearchBarView, value: String -> view.accentContent = value }
    }
  }
}
