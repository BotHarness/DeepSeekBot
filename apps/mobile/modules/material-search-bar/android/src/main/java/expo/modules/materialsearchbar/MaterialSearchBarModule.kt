package expo.modules.materialsearchbar

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView

class MaterialSearchBarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialSearchBar")
    ExpoUIView<SearchBarProps>("MaterialSearchBarView") {
      val onQueryChange by Event<SearchBarQueryEvent>()
      val onExpandedChange by Event<SearchBarExpandedEvent>()
      val onPick by Event<SearchBarPickEvent>()
      val onNavigation by Event<Unit>()

      Content { props ->
        SearchBarContent(
          props,
          onQueryChange = { onQueryChange(SearchBarQueryEvent(it)) },
          onExpandedChange = { onExpandedChange(SearchBarExpandedEvent(it)) },
          onPick = { onPick(SearchBarPickEvent(it)) },
          onNavigation = { onNavigation(Unit) },
        )
      }
    }
  }
}
