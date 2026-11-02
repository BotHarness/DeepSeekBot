package expo.modules.materialfabmenu

enum class FabGlyph { Add, Close }

fun fabGlyph(checkedProgress: Float): FabGlyph = if (checkedProgress > 0.5f) FabGlyph.Close else FabGlyph.Add

data class MenuPlacement(val x: Int, val y: Int)

fun menuPlacement(boxWidth: Int, boxHeight: Int, menuWidth: Int, menuHeight: Int, inset: Int): MenuPlacement =
  MenuPlacement(boxWidth - menuWidth + inset, boxHeight - menuHeight + inset)

fun nextExpanded(expanded: Boolean, enabled: Boolean): Boolean? = if (enabled || expanded) !expanded else null
