package expo.modules.latestanchor

/** One contiguous replacement between two row-key lists: [removed] old rows at [start] became [inserted] new rows. */
data class RowChange(val start: Int, val removed: Int, val inserted: Int)

/**
 * Describes [next] as one replacement of [previous] when they share a common prefix and suffix,
 * which covers a new message, a history page, a removal and a replaced key. Returns null when
 * the lists share nothing at either end, so the caller refreshes everything.
 */
fun rowChange(previous: List<String>, next: List<String>): RowChange? {
  if (previous == next) return RowChange(0, 0, 0)
  val limit = minOf(previous.size, next.size)
  var prefix = 0
  while (prefix < limit && previous[prefix] == next[prefix]) prefix++
  var suffix = 0
  while (suffix < limit - prefix && previous[previous.size - 1 - suffix] == next[next.size - 1 - suffix]) suffix++
  if (prefix == 0 && suffix == 0 && previous.isNotEmpty() && next.isNotEmpty()) return null
  return RowChange(prefix, previous.size - prefix - suffix, next.size - prefix - suffix)
}
