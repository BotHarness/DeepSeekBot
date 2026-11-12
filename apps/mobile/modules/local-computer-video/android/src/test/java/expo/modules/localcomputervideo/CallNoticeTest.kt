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

  @Test fun breathesOnlyWhileTheBotSpeaksOrHearsYou() {
    for (tone in CallNotice.tones) {
      assertEquals(tone, tone == "speaking" || tone == "hearing", CallRingBreath.breathes(tone, animationsOn = true))
      assertFalse("system animations off keeps $tone still", CallRingBreath.breathes(tone, animationsOn = false))
    }
  }

  @Test fun breathesBetweenFullAndFaintRing() {
    assertEquals(255, CallRingBreath.alpha(0f))
    assertEquals((255 * CallRingBreath.MIN_ALPHA).toInt(), CallRingBreath.alpha(1f))
    assertEquals(255, CallRingBreath.alpha(-1f))
    assertTrue(CallRingBreath.alpha(0.5f) in CallRingBreath.alpha(1f)..CallRingBreath.alpha(0f))
    assertEquals(1400L, CallRingBreath.PERIOD_MS)
  }

  @Test fun readsTheAvatarFromAFileUrl() {
    assertNull(CallNotice.from(valid)!!.avatarPath)
    val url = "file:///data/user/0/app/files/notification-avatars/host_1/bot-mira%20x.png"
    assertEquals("/data/user/0/app/files/notification-avatars/host_1/bot-mira x.png",
      CallNotice.from(valid + ("avatar" to url))!!.avatarPath)
    for (bad in listOf(
      "https://host/bot-mira.png", "content://media/bot-mira.png", "file://evil/x/bot-mira.png",
      "file:///data/files/../secrets/bot-mira.png", "file:///data/files/bot-mira.jpg",
      "relative/bot-mira.png", "", 42,
    )) {
      val notice = CallNotice.from(valid + ("avatar" to bad))
      assertNotNull("a bad avatar must not drop the notice: $bad", notice)
      assertNull("refused $bad", notice!!.avatarPath)
    }
  }

  @Test fun resolvesAvatarsOnlyUnderTheCacheRoot() {
    val dir = java.nio.file.Files.createTempDirectory("call-avatar").toFile()
    try {
      val root = java.io.File(dir, CallAvatarFiles.ROOT)
      java.io.File(root, "host").mkdirs()
      val png = java.io.File(root, "host/bot-mira.png").apply { writeBytes(byteArrayOf(1)) }
      val outside = java.io.File(dir, "outside.png").apply { writeBytes(byteArrayOf(1)) }
      assertEquals(png.canonicalFile, CallAvatarFiles.resolve(root, png.toURI().toString()))
      assertEquals(png.canonicalFile, CallAvatarFiles.resolve(root, png.path))
      assertNull(CallAvatarFiles.resolve(root, java.io.File(root, "host/bot-missing.png").path))
      assertNull(CallAvatarFiles.resolve(root, outside.path))
      assertNull(CallAvatarFiles.resolve(root, null))
      val link = java.io.File(root, "link")
      runCatching { java.nio.file.Files.createSymbolicLink(link.toPath(), dir.toPath()) }
      if (link.exists()) assertNull(CallAvatarFiles.resolve(root, java.io.File(link, "outside.png").path))
    } finally {
      dir.deleteRecursively()
    }
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
