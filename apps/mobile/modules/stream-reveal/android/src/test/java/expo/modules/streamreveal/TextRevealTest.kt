package expo.modules.streamreveal

import android.graphics.Typeface
import android.os.Looper
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StyleSpan
import android.widget.TextView
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowChoreographer
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@LooperMode(LooperMode.Mode.PAUSED)
class TextRevealTest {
  private lateinit var view: TextView
  private lateinit var reveal: TextReveal
  private var enabled = true

  @Before fun setup() {
    ShadowChoreographer.setPaused(true)
    ShadowChoreographer.setFrameDelay(Duration.ofMillis(8))
    view = TextView(RuntimeEnvironment.getApplication())
    reveal = TextReveal(view, 180L, 72L, 256) { enabled }
    reveal.attach()
  }

  @After fun cleanup() { reveal.detach() }

  private fun text(value: String) { view.text = SpannableString(value) }
  private fun spans(): List<RevealSpan> {
    val value = view.text as? Spanned ?: return emptyList()
    return value.getSpans(0, value.length, RevealSpan::class.java).sortedBy { value.getSpanStart(it) }
  }
  private fun advance(ms: Long) { shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms)) }

  @Test fun retainsJoinedEmojiCombiningMarksAndFlagsAsAtomicGlyphs() {
    val value = "A👩‍👩‍👧‍👦e\u0301🇨🇳"
    text(value)
    val rendered = view.text as Spanned
    assertEquals(listOf("A", "👩‍👩‍👧‍👦", "e\u0301", "🇨🇳"), spans().map {
      value.substring(rendered.getSpanStart(it), rendered.getSpanEnd(it))
    })
  }

  @Test fun startsLaterGlyphsAfterEarlierGlyphsAndSettles() {
    text("自然流畅")
    assertEquals(4, spans().size)
    advance(100)
    val active = spans()
    assertEquals(4, active.size)
    assertTrue(active.first().alpha > active.last().alpha)
    assertTrue(active.last().alpha > 0f)
    advance(400)
    assertTrue(spans().isEmpty())
    assertEquals("自然流畅", view.text.toString())
  }

  @Test fun replacementSpannableKeepsExistingRevealProgressAndBoldStyle() {
    text("ab")
    advance(80)
    val old = spans().first()
    val value = SpannableString("abc")
    value.setSpan(StyleSpan(Typeface.BOLD), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    view.text = value
    assertSame(old, spans().first())
    assertTrue(old.alpha > 0f)
    assertEquals(1, (view.text as Spanned).getSpans(0, 3, StyleSpan::class.java).size)
  }

  @Test fun correctionSettlesWithoutHidingPreviouslyShownText() {
    text("original")
    advance(80)
    text("corrected")
    assertEquals("corrected", view.text.toString())
    assertTrue(spans().isEmpty())
  }

  @Test fun combiningSuffixDoesNotFadeAnAlreadySettledBaseAgain() {
    text("e")
    advance(400)
    text("e\u0301")
    assertEquals("e\u0301", view.text.toString())
    assertTrue(spans().isEmpty())
  }

  @Test fun burstKeepsNativeSpanCountBoundedAndLeavesPrefixVisible() {
    text("seed")
    val value = "seed" + "字".repeat(600)
    text(value)
    assertEquals(256, spans().size)
    val first = (view.text as Spanned).getSpanStart(spans().first())
    assertTrue(first >= value.length - 256)
    advance(400)
    assertTrue(spans().isEmpty())
    assertEquals(value, view.text.toString())
  }

  @Test fun reducedMotionSettlesExistingSpansAndSkipsFutureOnes() {
    text("initial")
    enabled = false
    advance(40)
    assertTrue(spans().isEmpty())
    text("initial more")
    assertTrue(spans().isEmpty())
  }

  @Test fun productionBudgetKeepsOnlyTheNewest48GraphemesAnimated() {
    reveal.detach()
    reveal = TextReveal(view, 180L, 72L, 48) { enabled }
    reveal.attach()
    text("seed")
    val value = "seed" + "字".repeat(200)
    text(value)
    assertEquals(48, spans().size)
    assertEquals(value.length - 48, (view.text as Spanned).getSpanStart(spans().first()))
    advance(400)
    assertTrue(spans().isEmpty())
    assertEquals(value, view.text.toString())
  }

  @Test fun detachRemovesSpansAndStopsObservingFurtherText() {
    text("initial")
    assertFalse(spans().isEmpty())
    reveal.detach()
    assertTrue(spans().isEmpty())
    text("next")
    advance(400)
    assertTrue(spans().isEmpty())
  }
}
