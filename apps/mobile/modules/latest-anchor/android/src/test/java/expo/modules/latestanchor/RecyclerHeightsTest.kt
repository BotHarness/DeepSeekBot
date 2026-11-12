package expo.modules.latestanchor

import org.junit.Assert.assertEquals
import org.junit.Test

class RecyclerHeightsTest {
  @Test fun dynamicRowsKeepExactOffsetsWithoutAverageEstimates() {
    val heights = RecyclerHeights(listOf(10, 1000, 40, 60))
    assertEquals(1050, heights.prefix(3))
    heights.update(1, 2000)
    assertEquals(2050, heights.prefix(3))
    assertEquals(2110, heights.prefix(4))
    heights.update(0, 0)
    assertEquals(0, heights.prefix(1))
    assertEquals(2100, heights.prefix(4))
  }
}
