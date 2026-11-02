package expo.modules.streamreveal

import android.animation.ValueAnimator
import android.icu.text.BreakIterator
import android.os.SystemClock
import android.text.Editable
import android.text.Spannable
import android.text.SpannableString
import android.text.TextPaint
import android.text.TextWatcher
import android.text.style.CharacterStyle
import android.text.style.UpdateAppearance
import android.view.Choreographer
import android.widget.TextView
import java.util.Locale

internal class RevealSpan(var alpha: Float = 0f) : CharacterStyle(), UpdateAppearance {
  override fun updateDrawState(paint: TextPaint) {
    val alphaByte = ((paint.color ushr 24) * alpha.coerceIn(0f, 1f)).toInt()
    paint.color = (alphaByte shl 24) or (paint.color and 0x00ffffff)
  }
}

// No React update or text setter runs on animation frames. Appearance-only span
// notifications invalidate cached text drawing, without updating RN's layout props.
internal class TextReveal(
  private val view: TextView,
  private val duration: Long,
  private val stagger: Long,
  private val maxGlyphs: Int,
  private val animationsEnabled: () -> Boolean = { ValueAnimator.areAnimatorsEnabled() },
) : TextWatcher {
  private data class Glyph(val start: Int, val end: Int, val at: Long, val delay: Long, val span: RevealSpan)
  private val glyphs = mutableListOf<Glyph>()
  private var previous = ""
  private var attached = false
  private var scheduled = false
  private var settingText = false
  private val frame = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      scheduled = false
      draw()
    }
  }

  fun attach() {
    if (attached) return
    attached = true
    view.addTextChangedListener(this)
    changed()
  }

  fun detach() {
    if (attached) view.removeTextChangedListener(this)
    attached = false
    finish()
    previous = ""
  }

  private fun finish() {
    if (scheduled) Choreographer.getInstance().removeFrameCallback(frame)
    scheduled = false
    val text = view.text as? Spannable
    glyphs.forEach { it.span.alpha = 1f; text?.removeSpan(it.span) }
    glyphs.clear()
    view.invalidate()
  }

  private fun changed() {
    if (settingText || !attached) return
    val next = view.text.toString()
    val offset = previous.length
    if (!next.startsWith(previous) || !animationsEnabled()) {
      finish()
      previous = next
      return
    }
    val initial = previous.isEmpty()
    previous = next
    if (view.text !is Spannable) {
      settingText = true
      view.setText(SpannableString(next), TextView.BufferType.SPANNABLE)
      settingText = false
    }
    val text = view.text as? Spannable ?: return
    val now = SystemClock.uptimeMillis()
    if (next.length > offset) {
      val breaks = BreakIterator.getCharacterInstance(Locale.ROOT).apply { setText(next) }
      var start = if (offset == 0) 0 else breaks.preceding((offset + 1).coerceAtMost(next.length)).coerceAtLeast(0)
      val fresh = ArrayDeque<Pair<Int, Int>>()
      var end = breaks.following(start)
      val limit = if (initial) minOf(48, maxGlyphs) else maxGlyphs
      while (end != BreakIterator.DONE) {
        fresh.addLast(start to end)
        if (fresh.size > limit) fresh.removeFirst()
        start = end
        end = breaks.next()
      }
      val from = fresh.firstOrNull()?.first ?: next.length
      val continued = glyphs.filter { it.end > from }.associateBy { it.start }
      continued.values.forEach { text.removeSpan(it.span) }
      glyphs.removeAll { it.end > from }
      fresh.forEachIndexed { index, (a, b) ->
        val old = continued[a]
        // A newly appended combining mark must not hide an already-visible base.
        val at = old?.at ?: if (a < offset) now - duration else now
        val delay = old?.delay ?: if (a < offset) 0L else index * stagger / maxOf(1, fresh.size - 1)
        glyphs.add(Glyph(a, b, at, delay, old?.span ?: RevealSpan()))
      }
      while (glyphs.size > maxGlyphs) {
        val old = glyphs.removeAt(0)
        old.span.alpha = 1f
        text.removeSpan(old.span)
      }
    }
    // RN can replace the Spannable while preserving text. Restore pending spans once here.
    glyphs.forEach { if (it.end <= text.length) text.setSpan(it.span, it.start, it.end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE) }
    draw()
  }

  private fun draw() {
    val text = view.text as? Spannable ?: return
    val now = SystemClock.uptimeMillis()
    val reduced = !animationsEnabled()
    val iterator = glyphs.iterator()
    while (iterator.hasNext()) {
      val glyph = iterator.next()
      glyph.span.alpha = if (reduced) 1f else ((now - glyph.at - glyph.delay).toFloat() / duration).coerceIn(0f, 1f)
      if (glyph.span.alpha >= 1f) {
        text.removeSpan(glyph.span)
        iterator.remove()
      } else if (glyph.end <= text.length) {
        text.setSpan(glyph.span, glyph.start, glyph.end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      }
    }
    view.invalidate()
    if (glyphs.isNotEmpty() && !scheduled && attached) {
      scheduled = true
      Choreographer.getInstance().postFrameCallback(frame)
    }
  }

  override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) = Unit
  override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) = Unit
  override fun afterTextChanged(text: Editable?) = changed()
}
