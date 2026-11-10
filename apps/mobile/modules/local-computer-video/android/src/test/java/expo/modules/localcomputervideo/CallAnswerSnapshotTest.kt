package expo.modules.localcomputervideo

import org.junit.Assert.*
import org.junit.Test

class CallAnswerSnapshotTest {
  private enum class Gathering { NEW, GATHERING, COMPLETE }
  private val candidate = "v=0\r\na=candidate:REDACTED\r\n"

  @Test fun completionBeforeDescriptionReadUsesTheCompletedSnapshot() {
    var description = "v=0\r\n"
    val reads = mutableListOf<String>()
    val snapshot = readCallAnswerSnapshot(
      { reads.add("state"); description = candidate; Gathering.COMPLETE },
      { reads.add("description"); description },
    )
    assertEquals(listOf("state", "description"), reads)
    assertEquals(candidate, snapshot.description)
    assertTrue(snapshot.ready(Gathering.COMPLETE, false))
  }

  @Test fun emptyCompleteAndEmptyForcedNeverBecomeReady() {
    for (description in listOf(null, "", "v=0\r\n")) {
      for (state in Gathering.entries) {
        val snapshot = readCallAnswerSnapshot({ state }, { description })
        assertFalse(snapshot.ready(Gathering.COMPLETE, false))
        assertFalse(snapshot.ready(Gathering.COMPLETE, true))
      }
    }
  }

  @Test fun candidateRequiresCompletionOrTheExistingForcedSettle() {
    val gathering = readCallAnswerSnapshot({ Gathering.GATHERING }, { candidate })
    assertFalse(gathering.ready(Gathering.COMPLETE, false))
    assertTrue(gathering.ready(Gathering.COMPLETE, true))
    val complete = readCallAnswerSnapshot({ Gathering.COMPLETE }, { candidate })
    assertTrue(complete.ready(Gathering.COMPLETE, false))
  }

  @Test fun completionAfterStateReadWaitsForTheExistingCallback() {
    var state = Gathering.GATHERING
    val first = readCallAnswerSnapshot({ state }, { state = Gathering.COMPLETE; candidate })
    assertFalse(first.ready(Gathering.COMPLETE, false))
    val next = readCallAnswerSnapshot({ state }, { candidate })
    assertTrue(next.ready(Gathering.COMPLETE, false))
    assertEquals(candidate, next.description)
  }
}
