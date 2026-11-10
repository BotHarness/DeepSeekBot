package expo.modules.latestanchor

import kotlin.math.exp

object LatestSpring {
  const val STIFFNESS = 22f

  data class Step(val position: Float, val velocity: Float)

  fun step(position: Float, velocity: Float, target: Float, omega: Float, dt: Float): Step {
    val offset = position - target
    val decay = exp(-omega * dt)
    val drift = velocity + omega * offset
    return Step(target + (offset + drift * dt) * decay, (velocity - omega * drift * dt) * decay)
  }

  fun settled(position: Float, velocity: Float, target: Float): Boolean =
    kotlin.math.abs(position - target) < 0.5f && kotlin.math.abs(velocity) < 4f
}
