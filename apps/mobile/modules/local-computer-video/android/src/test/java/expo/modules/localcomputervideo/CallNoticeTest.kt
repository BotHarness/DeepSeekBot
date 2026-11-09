package expo.modules.localcomputervideo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CallNoticeTest {
  private val valid = mapOf<String, Any?>(
    "name" to "Mira",
    "status" to "Listening",
    "tone" to "listening",
    "startedAt" to 1_700_000_000_000.0,
    "muted" to false,
    "muteLabel" to "Mute",
    "unmuteLabel" to "Unmute",
    "hangUpLabel" to "Hang up",
    "channelName" to "Bot calls",
    "bubbleLabel" to "Back to call with Mira. Listening",
    "ringColor" to "#22c55e",
    "surfaceColor" to "#f5f6f7",
    "fgColor" to "#0f1115",
    "baseColor" to "#fff",
  )

  @Test fun parsesAValidNotice() {
    val notice = CallNotice.from(valid)
    assertNotNull(notice)
    assertEquals(1_700_000_000_000L, notice!!.startedAt)
    assertEquals("M", notice.initial)
  }

  @Test fun refusesUnknownTonesAndMissingWords() {
    assertNull(CallNotice.from(valid + ("tone" to "ringing")))
    assertNull(CallNotice.from(valid - "hangUpLabel"))
    assertNull(CallNotice.from(valid + ("name" to "  ")))
    assertNull(CallNotice.from(valid + ("status" to "x".repeat(301))))
  }

  @Test fun treatsAMissingStartAsNotLive() {
    assertNull(CallNotice.from(valid - "startedAt")!!.startedAt)
    assertNull(CallNotice.from(valid + ("startedAt" to 0))!!.startedAt)
  }

  @Test fun takesTheFirstCodePointAsTheInitial() {
    assertEquals("小", CallNotice.from(valid + ("name" to "小明"))!!.initial)
    assertEquals("😀", CallNotice.from(valid + ("name" to "😀 bot"))!!.initial)
  }

  @Test fun readsThemeColors() {
    val notice = CallNotice.from(valid)!!
    assertEquals(0xFF22C55E.toInt(), notice.ringColor)
    assertEquals(0xFFFFFFFF.toInt(), notice.baseColor)
    assertNull(CallNotice.from(valid + ("ringColor" to "green")))
    assertNull(hexColor("#12345"))
  }

  @Test fun formatsCallTime() {
    assertEquals("0:00", callDuration(-5))
    assertEquals("4:05", callDuration(245_000))
    assertEquals("1:02:03", callDuration(3_723_000))
  }

  @Test fun snapsToTheNearestSideInsideTheSafeArea() {
    // 1080 wide screen, 200 px bubble, 24 px cutout on the left, 16 px margin.
    assertEquals(40, CallBubblePlacement.snapX(300, 200, 1080, 24, 0, 16))
    assertEquals(864, CallBubblePlacement.snapX(700, 200, 1080, 24, 0, 16))
  }

  @Test fun keepsTheBubbleBetweenTheStatusAndNavigationBars() {
    assertEquals(100, CallBubblePlacement.clampY(0, 200, 2400, 84, 120, 16))
    assertEquals(2064, CallBubblePlacement.clampY(5000, 200, 2400, 84, 120, 16))
    assertEquals(900, CallBubblePlacement.clampY(900, 200, 2400, 84, 120, 16))
  }

  @Test fun staysInterruptedUntilFocusAndThePhoneCallBothReturn() {
    val changes = mutableListOf<Boolean>()
    val interruption = CallInterruption { changes += it }
    interruption.focus(true)
    interruption.phoneCall(true)
    assertTrue(interruption.interrupted)
    interruption.focus(false)
    assertTrue(interruption.interrupted)
    interruption.phoneCall(false)
    assertFalse(interruption.interrupted)
    assertEquals(listOf(true, false), changes)
  }
}
