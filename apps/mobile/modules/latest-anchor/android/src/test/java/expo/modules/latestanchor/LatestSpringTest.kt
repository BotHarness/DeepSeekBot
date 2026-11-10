package expo.modules.latestanchor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LatestSpringTest {
  @Test
  fun glidesToTheNewestRowWithoutOvershoot() {
    var position = 240f
    var velocity = 0f
    var previous = position
    repeat(60) {
      val step = LatestSpring.step(position, velocity, 0f, LatestSpring.STIFFNESS, 1f / 60f)
      position = step.position
      velocity = step.velocity
      assertTrue(position <= previous)
      assertTrue(position >= -0.0001f)
      previous = position
    }
    assertEquals(0f, position, 0.5f)
  }

  @Test
  fun aSecondArrivalMidGlideKeepsTheMotionContinuous() {
    val first = LatestSpring.step(200f, 0f, 0f, LatestSpring.STIFFNESS, 1f / 60f)
    val second = LatestSpring.step(first.position + 120f, first.velocity, 0f, LatestSpring.STIFFNESS, 1f / 60f)
    assertTrue(second.velocity < first.velocity)
  }

  @Test
  fun settlesOnlyCloseToTheTargetAndAtRest() {
    assertTrue(LatestSpring.settled(0.2f, 1f, 0f))
    assertTrue(!LatestSpring.settled(3f, 0f, 0f))
    assertTrue(!LatestSpring.settled(0.2f, 40f, 0f))
  }
}
