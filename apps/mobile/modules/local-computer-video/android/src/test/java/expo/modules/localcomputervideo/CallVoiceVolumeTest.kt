package expo.modules.localcomputervideo

import org.junit.Assert.assertEquals
import org.junit.Test

class CallVoiceVolumeTest {
  @Test
  fun keepsTheGainTheCallScreenOffers() {
    assertEquals(0.0, voiceGain(0.0), 0.0)
    assertEquals(1.0, voiceGain(1.0), 0.0)
    assertEquals(1.35, voiceGain(1.35), 0.0)
    assertEquals(2.0, voiceGain(2.0), 0.0)
  }

  @Test
  fun clampsOutOfRangeAndFallsBackToUnity() {
    assertEquals(0.0, voiceGain(-0.5), 0.0)
    assertEquals(2.0, voiceGain(10.0), 0.0)
    assertEquals(1.0, voiceGain(Double.NaN), 0.0)
    assertEquals(1.0, voiceGain(Double.POSITIVE_INFINITY), 0.0)
  }
}
