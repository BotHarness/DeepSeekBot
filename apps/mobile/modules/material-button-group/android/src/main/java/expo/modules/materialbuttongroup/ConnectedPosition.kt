package expo.modules.materialbuttongroup

/** Where a button sits in a connected group, which picks its connected corner shapes. */
enum class ConnectedPosition { Only, Leading, Middle, Trailing }

fun connectedPosition(index: Int, count: Int): ConnectedPosition = when {
  count <= 1 -> ConnectedPosition.Only
  index == 0 -> ConnectedPosition.Leading
  index == count - 1 -> ConnectedPosition.Trailing
  else -> ConnectedPosition.Middle
}

/** The next selection, or null when the press keeps the current one (a checked button stays checked). */
fun nextSelection(current: String, pressed: String, checked: Boolean): String? =
  if (checked && pressed != current) pressed else null

/** ARGB from the theme's CSS hex colours (#rgb, #rrggbb or #rrggbbaa), or null when unreadable. */
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
