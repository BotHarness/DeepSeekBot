package expo.modules.materialtabrow

import android.graphics.Color
import androidx.compose.runtime.Composable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import expo.modules.kotlin.views.ComposeProps
import expo.modules.kotlin.views.FunctionalComposableScope
import expo.modules.kotlin.views.OptimizedComposeProps
import expo.modules.ui.ExpoUIView
import expo.modules.ui.ModifierList
import expo.modules.ui.ModifierRegistry
import expo.modules.ui.composeOrNull

@OptimizedRecord
data class TabRecord(
  @Field val value: String = "",
  @Field val label: String = "",
  @Field val dotColor: Color? = null,
  @Field val accessibilityLabel: String? = null,
) : Record

@OptimizedRecord
data class TabSelectEvent(@Field val value: String = "") : Record

@OptimizedComposeProps
data class PrimaryTabRowProps(
  val tabs: List<TabRecord> = emptyList(),
  val selected: String = "",
  val containerColor: Color? = null,
  val modifiers: ModifierList = emptyList(),
) : ComposeProps

@Composable
fun FunctionalComposableScope.PrimaryTabRowContent(props: PrimaryTabRowProps, onTabSelect: (String) -> Unit) {
  PrimaryTabs(
    tabs = props.tabs.map { TabItem(it.value, it.label, it.dotColor.composeOrNull, it.accessibilityLabel ?: it.label) },
    selected = props.selected,
    onTabSelect = onTabSelect,
    modifier = ModifierRegistry.applyModifiers(props.modifiers, appContext, composableScope, globalEventDispatcher),
    containerColor = props.containerColor.composeOrNull,
  )
}

class MaterialTabRowModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialTabRow")
    ExpoUIView<PrimaryTabRowProps>("PrimaryTabRowView") {
      val onTabSelect by Event<TabSelectEvent>()
      Content { props -> PrimaryTabRowContent(props) { onTabSelect(TabSelectEvent(it)) } }
    }
  }
}
