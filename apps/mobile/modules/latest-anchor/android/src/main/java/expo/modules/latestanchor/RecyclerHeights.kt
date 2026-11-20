package expo.modules.latestanchor

internal class RecyclerHeights(initial: List<Int>) {
  private val values = IntArray(initial.size)
  private val tree = IntArray(initial.size + 1)
  init { initial.forEachIndexed { index, value -> update(index, value) } }
  fun height(index: Int) = values[index]
  fun update(index: Int, value: Int) {
    val delta = value - values[index]
    values[index] = value
    var node = index + 1
    while (node < tree.size) { tree[node] += delta; node += node and -node }
  }
  fun prefix(end: Int): Int {
    var node = end
    var sum = 0
    while (node > 0) { sum += tree[node]; node -= node and -node }
    return sum
  }
}
