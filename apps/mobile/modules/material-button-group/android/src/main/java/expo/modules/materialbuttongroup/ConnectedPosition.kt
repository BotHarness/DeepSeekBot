package expo.modules.materialbuttongroup

/** Where a button sits in a connected group, which picks its connected corner shapes. */
enum class ConnectedPosition { Only, Leading, Middle, Trailing }

fun connectedPosition(index: Int, count: Int): ConnectedPosition = when {
  count <= 1 -> ConnectedPosition.Only
  index == 0 -> ConnectedPosition.Leading
  index == count - 1 -> ConnectedPosition.Trailing
  else -> ConnectedPosition.Middle
}

fun nextSelection(current: String, pressed: String, checked: Boolean): String? =
  if (checked || pressed == current) pressed else null
