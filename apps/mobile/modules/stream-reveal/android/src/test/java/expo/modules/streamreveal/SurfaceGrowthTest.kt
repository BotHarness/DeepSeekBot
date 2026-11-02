package expo.modules.streamreveal

import org.junit.Assert.*
import org.junit.Test

class SurfaceGrowthTest {
  @Test fun initialLayoutAndShrinkAreImmediate() {
    val growth = SurfaceGrowth()
    growth.resize(100, 0, true)
    assertEquals(100f, growth.value(0), 0f)
    growth.resize(60, 10, true)
    assertEquals(60f, growth.value(10), 0f)
    assertFalse(growth.pending(10))
  }
  @Test fun growthIsContinuousAndEndsAtExactContentHeight() {
    val growth = SurfaceGrowth()
    growth.resize(100, 0, true)
    growth.resize(160, 10, true)
    assertEquals(100f, growth.value(10), 0f)
    assertEquals(130f, growth.value(70), 0f)
    assertEquals(160f, growth.value(130), 0f)
    assertFalse(growth.pending(130))
  }
  @Test fun anotherWrapContinuesFromCurrentlyPaintedEdge() {
    val growth = SurfaceGrowth()
    growth.resize(100, 0, true)
    growth.resize(160, 10, true)
    growth.resize(220, 70, true)
    assertEquals(130f, growth.value(70), 0f)
    assertEquals(175f, growth.value(130), 0f)
    assertEquals(220f, growth.value(190), 0f)
  }
  @Test fun widthChangeReducedMotionAndDetachFinishWithoutTrailingWork() {
    val growth = SurfaceGrowth()
    growth.resize(100, 0, true)
    growth.resize(300, 10, false)
    assertEquals(300f, growth.value(10), 0f)
    growth.resize(500, 20, true)
    growth.finish()
    assertEquals(500f, growth.value(20), 0f)
    assertFalse(growth.pending(20))
  }
}
