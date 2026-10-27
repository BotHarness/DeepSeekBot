package expo.modules.materialfabmenu

enum class FabGlyph { Add, Close }

fun fabGlyph(checkedProgress: Float): FabGlyph = if (checkedProgress > 0.5f) FabGlyph.Close else FabGlyph.Add

data class MenuPlacement(val x: Int, val y: Int)

fun menuPlacement(boxWidth: Int, boxHeight: Int, menuWidth: Int, menuHeight: Int, inset: Int): MenuPlacement =
  MenuPlacement(boxWidth - menuWidth + inset, boxHeight - menuHeight + inset)

fun nextExpanded(expanded: Boolean, enabled: Boolean): Boolean? = if (enabled || expanded) !expanded else null

fun cssColor(value: String): Int? {
  val hex = value.removePrefix("#")
  if (hex.length == value.length || hex.any { Character.digit(it, 16) < 0 }) return null
  val full = when (hex.length) {
    3 -> hex.map { "$it$it" }.joinToString("") + "ff"
    6 -> hex + "ff"
    8 -> hex
    else -> return null
  }
  val rgba = full.toLong(16)
  return (((rgba and 0xff) shl 24) or (rgba shr 8)).toInt()
}
