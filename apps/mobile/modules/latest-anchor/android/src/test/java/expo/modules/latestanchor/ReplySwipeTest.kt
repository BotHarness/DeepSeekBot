package expo.modules.latestanchor

import org.junit.Assert.*
import org.junit.Test

class ReplySwipeTest {
  private val swipe = ReplySwipe(start = 12f, backFail = 8f, verticalFail = 10f, commit = 56f, reach = 72f)

  @Test fun followsTheFingerThenResistsPastReach() {
    assertEquals(0f, swipe.travel(-5f), 0f)
    assertEquals(40f, swipe.travel(40f), 0f)
    assertEquals(72f, swipe.travel(72f), 0f)
    assertEquals(77f, swipe.travel(92f), 0f)
  }

  @Test fun repliesOnlyPastCommit() {
    assertFalse(swipe.replies(55.9f))
    assertTrue(swipe.replies(56f))
  }

  @Test fun startsOnlyOnAHorizontalDragTowardTheReplySide() {
    assertEquals(ReplySwipe.Intent.WAIT, swipe.classify(6f, 2f))
    assertEquals(ReplySwipe.Intent.SWIPE, swipe.classify(12f, 4f))
    assertEquals(ReplySwipe.Intent.CANCEL, swipe.classify(4f, 11f))
    assertEquals(ReplySwipe.Intent.CANCEL, swipe.classify(-9f, 0f))
  }

  @Test fun parsesTouchTokens() {
    val touch = TouchStyle.from(mapOf(
      "pressHuman" to "#ffffff1f", "pressBot" to "#1b1b1f1f", "hintFill" to "#eeeeee", "hintInk" to "#77777f",
      "holdMs" to 500.0, "swipeStart" to 12.0, "swipeBackFail" to 8.0, "swipeVerticalFail" to 10.0,
      "swipeCommit" to 56.0, "swipeReach" to 72.0, "hintEnd" to 12.0, "hintIcon" to 28.0, "glyph" to 16.0,
    ))!!
    assertEquals(500L, touch.holdMs)
    assertEquals(swipe, touch.swipe)
    assertNull(TouchStyle.from(mapOf("pressHuman" to "#fff")))
  }
}
