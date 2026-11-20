package expo.modules.latestanchor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RowChangeTest {
  private val rows = listOf("\$header", "m3", "m2", "m1")

  @Test fun newMessageInsertsAfterTheHeader() {
    assertEquals(RowChange(1, 0, 1), rowChange(rows, listOf("\$header", "m4", "m3", "m2", "m1")))
  }

  @Test fun historyPageAppendsAtTheOldEnd() {
    assertEquals(RowChange(4, 0, 2), rowChange(rows, rows + listOf("m0", "m-1")))
  }

  @Test fun removalAndReplacedKeyStayLocal() {
    assertEquals(RowChange(2, 1, 0), rowChange(rows, listOf("\$header", "m3", "m1")))
    assertEquals(RowChange(1, 1, 1), rowChange(rows, listOf("\$header", "m3-committed", "m2", "m1")))
  }

  @Test fun identicalAndEmptyListsNeedNothingOrEverything() {
    assertEquals(RowChange(0, 0, 0), rowChange(rows, rows))
    assertEquals(RowChange(0, 0, 4), rowChange(emptyList(), rows))
    assertEquals(RowChange(0, 4, 0), rowChange(rows, emptyList()))
  }

  @Test fun unrelatedListsFallBackToAFullRefresh() {
    assertNull(rowChange(rows, listOf("a", "b")))
  }
}
