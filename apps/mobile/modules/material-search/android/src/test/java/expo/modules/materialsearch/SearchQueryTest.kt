package expo.modules.materialsearch

import org.junit.Assert.assertEquals
import org.junit.Test

class SearchQueryTest {
  @Test fun delayedReactEchoCannotRollBackFastTyping() {
    val query = SearchQuery()
    query.edit("中")
    query.edit("中文")
    query.acknowledge("中", 1)
    assertEquals("中文", query.value)
    query.acknowledge("中文", 2)
    assertEquals("中文", query.value)
  }

  @Test fun latestAcknowledgementCanApplyActivityLimitAndExternalClear() {
    val query = SearchQuery()
    query.edit("a".repeat(201))
    query.acknowledge("a".repeat(200), query.eventCount)
    assertEquals(200, query.value.length)
    query.acknowledge("", query.eventCount)
    assertEquals("", query.value)
  }

  @Test fun marketplaceLimitAppliesBeforeEmittingAnEdit() {
    val query = SearchQuery()
    query.edit("a".repeat(101), 100)
    assertEquals(100, query.value.length)
    assertEquals(1, query.eventCount)
  }

  @Test fun clearWinsOverAnOlderInFlightEdit() {
    val query = SearchQuery()
    query.edit("search")
    query.edit("")
    query.acknowledge("search", 1)
    assertEquals("", query.value)
    assertEquals(2, query.eventCount)
  }
}
