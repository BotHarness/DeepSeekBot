package expo.modules.localcomputervideo

import org.junit.Assert.*
import org.junit.Test

class CallAnswerDiagnosticsTest {
  @Test fun distinguishesEmptyCompleteFromLaterCandidatesWithoutEmittingContent() {
    val rows = mutableListOf<Map<String, Any?>>()
    val diagnostics = CallAnswerDiagnostics { rows.add(it) }
    diagnostics.note("gathering", "COMPLETE", "v=0\r\n", true, callback = "COMPLETE")
    diagnostics.note("answer", "COMPLETE", "v=0\r\n", true)
    diagnostics.note("candidate", "COMPLETE", "v=0\r\na=candidate:PRIVATE\r\na=candidate:SECRET\r\n", false)
    assertEquals(listOf(0, 0, 2), rows.map { it["localCandidates"] })
    assertEquals(listOf(1, 2, 3), rows.map { it["seq"] })
    assertEquals(false, rows.last()["pending"])
    assertFalse(rows.toString().contains("PRIVATE"))
    assertFalse(rows.toString().contains("SECRET"))
  }

  @Test fun boundsEventsAndReservesTheAnswer() {
    val rows = mutableListOf<Map<String, Any?>>()
    val diagnostics = CallAnswerDiagnostics { rows.add(it) }
    repeat(100) { diagnostics.note("candidate", "GATHERING", null, true) }
    diagnostics.note("answer", "COMPLETE", "", true)
    diagnostics.note("answer", "COMPLETE", "", true)
    diagnostics.note("candidate", "COMPLETE", "a=candidate:LATE\r\na=candidate:LATE2\r\n", false)
    diagnostics.note("check", "COMPLETE", "a=candidate:LATE\r\na=candidate:LATE2\r\n", false)
    repeat(100) { diagnostics.note("candidate", "COMPLETE", "", false) }
    assertEquals(32, rows.size)
    assertEquals("answer", rows[29]["stage"])
    assertEquals(0, rows[29]["localCandidates"])
    assertEquals(2, rows[30]["localCandidates"])
    assertEquals(2, rows[31]["localCandidates"])
  }

  @Test fun isolatesObserverFailureAndRejectsArbitraryStateText() {
    CallAnswerDiagnostics { throw IllegalStateException("observer") }.note("check", "NEW", null, true)
    val rows = mutableListOf<Map<String, Any?>>()
    val diagnostics = CallAnswerDiagnostics { rows.add(it) }
    diagnostics.note("PRIVATE", "PRIVATE", null, true)
    assertTrue(rows.isEmpty())
    diagnostics.note("check", "PRIVATE", null, true, callback = "SECRET")
    assertNull(rows.single()["gathering"])
    assertNull(rows.single()["callback"])
  }
}
