package expo.modules.streamreveal

import android.os.Looper
import java.time.Duration
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TextPlaybackTest {
  @Test fun warmupBoundedReleaseAndCorrection() {
    val player = TextPlayback("", 0.0)
    player.receive("x".repeat(10000), false, 0.0)
    assertEquals("", player.advance(224.0)["body"])
    var previous = 0
    for (frame in 8..100) {
      val state = player.advance(frame * 32.0)
      val cursor = state["cursor"] as Int
      assertTrue(cursor - previous in 0..32)
      previous = cursor
    }
    assertTrue(previous > 0)
    player.receive("corrected", true, 3300.0)
    assertEquals("corrected", player.snapshot()["body"])
    assertEquals("complete", player.snapshot()["phase"])
  }

  @Test fun completeReplyDrainsWithoutBreakingGraphemes() {
    val glyph = "👨‍👩‍👧‍👦e\u0301"
    val text = glyph.repeat(100)
    val player = TextPlayback("", 0.0)
    player.receive(text, true, 0.0)
    assertEquals(200, player.snapshot()["received"])
    for (frame in 1..1000) {
      val body = player.advance(frame * 32.0)["body"] as String
      assertTrue(text.startsWith(body))
      assertTrue(body.isEmpty() || body.endsWith("👨‍👩‍👧‍👦") || body.endsWith("e\u0301"))
    }
    assertEquals(text, player.snapshot()["body"])
    assertEquals("complete", player.snapshot()["phase"])
  }

  @Test fun clockCancelsAndOnlyAdvancesSelectedPlayersOnce() {
    val events = mutableListOf<Int>()
    val clock = PlaybackFrameClock { events.add(it) }
    val now = System.currentTimeMillis().toDouble()
    val selected = TextPlayback("", now)
    val waiting = TextPlayback("", now)
    selected.receive("hello".repeat(100), true, now)
    waiting.receive("waiting".repeat(100), true, now)
    clock.schedule(listOf(selected), 1)
    clock.cancel()
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(100))
    assertTrue(events.isEmpty())
    assertEquals("", selected.snapshot()["body"])
    clock.schedule(listOf(selected), 2)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(100))
    assertEquals(listOf(2), events)
    assertTrue((selected.snapshot()["body"] as String).isNotEmpty())
    assertEquals("", waiting.snapshot()["body"])
    val snapshot = selected.snapshot()
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(1))
    assertEquals(snapshot, selected.snapshot())
    assertEquals(listOf(2), events)
  }
}
