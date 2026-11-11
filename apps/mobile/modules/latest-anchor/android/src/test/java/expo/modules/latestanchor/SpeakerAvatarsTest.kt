package expo.modules.latestanchor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SpeakerAvatarsTest {
  private val size = 32f
  private val viewport = 2000f
  private val floor = 1800f

  @Test fun restsBesideTheLastBubble() {
    assertEquals(968f, SpeakerPlacement.avatarTop(runTop = 600f, runBottom = 1000f, floor = floor, size = size, viewport = viewport)!!, 0f)
  }

  @Test fun staysAboveTheComposerWhileTheLastBubbleIsBelowIt() {
    assertEquals(floor - size, SpeakerPlacement.avatarTop(runTop = 600f, runBottom = 2400f, floor = floor, size = size, viewport = viewport)!!, 0f)
  }

  @Test fun neverRisesAboveTheFirstBubbleOfTheRun() {
    assertEquals(1900f, SpeakerPlacement.avatarTop(runTop = 1900f, runBottom = 2400f, floor = floor, size = size, viewport = viewport)!!, 0f)
  }

  @Test fun hidesWhileTheRunIsOffScreen() {
    assertNull(SpeakerPlacement.avatarTop(runTop = -900f, runBottom = -100f, floor = floor, size = size, viewport = viewport))
    assertNull(SpeakerPlacement.avatarTop(runTop = 2100f, runBottom = 2400f, floor = floor, size = size, viewport = viewport))
  }

  @Test fun parsesSlots() {
    assertEquals(
      SpeakerSlot("item:a", "run", true, true, 8f),
      SpeakerSlot.from(mapOf("key" to "item:a", "group" to "run", "first" to true, "name" to true, "bottom" to 8.0)),
    )
    assertNull(SpeakerSlot.from(mapOf("key" to "item:a")))
  }
}
