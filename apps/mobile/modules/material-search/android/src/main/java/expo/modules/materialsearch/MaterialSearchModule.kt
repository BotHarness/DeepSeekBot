package expo.modules.materialsearch

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MaterialSearchModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialSearch")
    View(MaterialSearchView::class) {
      Events("onQueryChange", "onFocusChange", "onClose", "onSubmit")
      Prop("maxLength") { view: MaterialSearchView, value: Int -> view.maxLength = value }
      Prop("query") { view: MaterialSearchView, value: String -> view.query = value }
      Prop("eventCount") { view: MaterialSearchView, value: Int -> view.acknowledged = value }
      Prop("placeholder") { view: MaterialSearchView, value: String -> view.placeholder = value }
      Prop("autoFocus") { view: MaterialSearchView, value: Boolean -> view.autoFocus = value }
      Prop("closable") { view: MaterialSearchView, value: Boolean -> view.closable = value }
      Prop("dark") { view: MaterialSearchView, value: Boolean -> view.dark = value }
      Prop("foreground") { view: MaterialSearchView, value: String -> view.foregroundColor = value }
      Prop("surface") { view: MaterialSearchView, value: String -> view.surface = value }
      Prop("accent") { view: MaterialSearchView, value: String -> view.accent = value }
      Prop("closeLabel") { view: MaterialSearchView, value: String -> view.closeLabel = value }
      Prop("clearLabel") { view: MaterialSearchView, value: String -> view.clearLabel = value }
      OnViewDidUpdateProps { view: MaterialSearchView -> view.synchronizeQuery() }
    }
  }
}
