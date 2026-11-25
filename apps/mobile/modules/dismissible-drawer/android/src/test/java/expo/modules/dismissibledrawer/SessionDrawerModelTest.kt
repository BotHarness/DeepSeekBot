package expo.modules.dismissibledrawer

import org.junit.Assert.assertEquals
import org.junit.Test

class SessionDrawerModelTest {
  @Test
  fun leavesAThinClosingStripAtAnyWidth() {
    assertEquals(336f, sessionDrawerWidthDp(392f), 0f)
    assertEquals(0f, sessionDrawerWidthDp(40f), 0f)
  }

  @Test
  fun streamsProgressInVisibleStepsAndAlwaysReachesTheEnds() {
    assertEquals(true, progressChanged(-1f, 0f))
    assertEquals(false, progressChanged(0.5f, 0.505f))
    assertEquals(true, progressChanged(0.5f, 0.51f))
    assertEquals(true, progressChanged(0.995f, 1f))
    assertEquals(false, progressChanged(1f, 1f))
  }

  @Test
  fun reportsAnInterruptedOpenThatSettlesClosed() {
    assertEquals(null, sessionSettledReport(animating = true, settledOpen = false, lastReported = true))
    assertEquals(false, sessionSettledReport(animating = false, settledOpen = false, lastReported = true))
    assertEquals(null, sessionSettledReport(animating = false, settledOpen = true, lastReported = true))
    assertEquals(true, sessionSettledReport(animating = false, settledOpen = true, lastReported = false))
  }
}
