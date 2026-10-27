package expo.modules.materialsplitbutton

fun nextMenuOpen(open: Boolean, enabled: Boolean, itemCount: Int): Boolean =
  if (open) false else enabled && itemCount > 0

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
