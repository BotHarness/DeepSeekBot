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
  fun fadesTheContentHalfwayWhenOpen() {
    assertEquals(1f, sessionContentAlpha(0f), 0f)
    assertEquals(0.75f, sessionContentAlpha(0.5f), 0.0001f)
    assertEquals(0.5f, sessionContentAlpha(1f), 0f)
    assertEquals(0.5f, sessionContentAlpha(2f), 0f)
  }
}
