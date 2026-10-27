package expo.modules.materialsearchbar

fun showsEmpty(query: String, count: Int): Boolean = query.isNotBlank() && count == 0

fun clearsOnCollapse(expanded: Boolean, query: String): Boolean = !expanded && query.isNotEmpty()

/** The local file behind a result's `file://` avatar, or null for anything else. */
fun avatarPath(image: String): String? {
  if (image.isEmpty()) return null
  val uri = runCatching { java.net.URI(image) }.getOrNull() ?: return null
  if (uri.scheme != "file") return null
  return uri.path?.takeIf { it.isNotEmpty() }
}
