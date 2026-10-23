package expo.modules.materialsearch

/** Orders native edits and React acknowledgements without replacing newer IME input. */
internal class SearchQuery {
  var value = ""
    private set
  var eventCount = 0
    private set

  fun edit(next: String, maxLength: Int = 0) {
    value = if (maxLength > 0) next.take(maxLength) else next
    eventCount += 1
  }

  fun acknowledge(next: String, count: Int) {
    if (count == eventCount) value = next
  }
}
