package expo.modules.materialsearch

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView

class MaterialSearchModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialSearch")
    ExpoUIView<SearchProps>("MaterialSearchView") {
      val onQueryChange by Event<QueryChangeEvent>()
      val onFocusChange by Event<FocusChangeEvent>()
      val onClose by Event<Unit>()
      val onSubmit by Event<SubmitEvent>()

      Content { props ->
        SearchContent(
          props,
          onQueryChange = { onQueryChange(it) },
          onFocusChange = { onFocusChange(FocusChangeEvent(it)) },
          onClose = { onClose(Unit) },
          onSubmit = { onSubmit(SubmitEvent(it)) },
        )
      }
    }
  }
}
