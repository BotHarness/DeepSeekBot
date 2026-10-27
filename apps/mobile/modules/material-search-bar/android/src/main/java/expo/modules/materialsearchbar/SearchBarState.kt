package expo.modules.materialsearchbar

fun showsEmpty(query: String, count: Int): Boolean = query.isNotBlank() && count == 0

fun clearsOnCollapse(expanded: Boolean, query: String): Boolean = !expanded && query.isNotEmpty()
