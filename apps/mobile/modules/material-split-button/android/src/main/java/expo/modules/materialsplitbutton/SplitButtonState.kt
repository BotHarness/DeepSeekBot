package expo.modules.materialsplitbutton

fun nextMenuOpen(open: Boolean, enabled: Boolean, itemCount: Int): Boolean =
  if (open) false else enabled && itemCount > 0
