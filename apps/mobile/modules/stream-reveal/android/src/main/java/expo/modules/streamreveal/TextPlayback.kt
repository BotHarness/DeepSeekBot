package expo.modules.streamreveal

import android.icu.text.BreakIterator
import java.util.Locale
import kotlin.math.*

internal class TextPlayback(initial: String, now: Double) {
  private var target = initial
  private var ends = boundaries(initial)
  private var cursor = ends.size
  private var body = initial
  private var closed = false
  private var started = initial.isNotEmpty()
  private var first = now
  private var last = now
  private var arrived = now
  private var arrivalRate = 32.0
  private var arrivalGap = 100.0
  private var rate = 28.0
  private var credit = 0.0
  private var pauseUntil = 0.0
  private var drainRate: Double? = null
  private fun pending() = ends.size - cursor

  private fun boundaries(text: String): List<Int> {
    val iterator = BreakIterator.getCharacterInstance(Locale.ROOT)
    iterator.setText(text)
    return buildList {
      iterator.first()
      var end = iterator.next()
      while (end != BreakIterator.DONE) { add(end); end = iterator.next() }
    }
  }

  private fun close(finished: Boolean) {
    if (finished && !closed) drainRate = maxOf(42.0, rate, pending() / 3.0)
    if (!finished) drainRate = null
    closed = finished
  }

  @Synchronized fun snapshot(): Map<String, Any> = mapOf(
    "body" to body, "pending" to pending(), "received" to ends.size,
    "cursor" to cursor, "rate" to rate,
    "phase" to when {
      pending() == 0 -> if (closed) "complete" else "waiting"
      !started -> "buffering"
      closed -> "draining"
      else -> "playing"
    },
  )

  @Synchronized fun receive(next: String, finished: Boolean, at: Double) {
    if (next == target) { close(finished); return }
    if (!next.startsWith(body)) {
      target = next
      ends = boundaries(next)
      cursor = ends.size
      body = next
      credit = 0.0
      close(finished)
      return
    }
    val oldLength = ends.size
    val shown = body.length
    val from = if (next.startsWith(target)) ends.getOrNull(ends.size - 2) ?: 0 else 0
    ends = ends.filter { it <= from } + boundaries(next.substring(from)).map { it + from }
    cursor = ends.indexOfFirst { it > shown }.let { if (it < 0) ends.size else it }
    target = next
    val added = max(0, ends.size - oldLength)
    if (added > 0) {
      val gap = max(16.0, at - arrived)
      val smoothing = 1 - exp(-gap / 500)
      arrivalRate += (min(6000.0, added * 1000 / gap) - arrivalRate) * smoothing
      arrivalGap += (gap - arrivalGap) * smoothing
      arrived = at
    }
    close(finished)
  }

  @Synchronized fun advance(at: Double): Map<String, Any> {
    val elapsed = (at - last).coerceIn(0.0, 64.0)
    last = at
    if (pending() == 0 || at < pauseUntil) return snapshot()
    val reserve = (arrivalRate * 0.8).coerceIn(8.0, 640.0)
    if (!started) {
      val age = at - first
      val clause = target.any { it in "，。！？；,.!?;\n" }
      if (!closed && (age < 260 || (pending() < reserve && !clause && age < 800))) return snapshot()
      started = true
      credit = 1.0
    }
    val quiet = max(0.0, at - arrived - max(180.0, arrivalGap * 1.5))
    val incoming = arrivalRate * exp(-quiet / 650)
    val desired = if (closed) drainRate ?: max(42.0, rate)
      else (incoming * 0.8 + max(0.0, pending() - reserve) / 0.9) * (pending() / reserve).coerceIn(0.12, 1.0)
    rate += (desired.coerceIn(3.0, 900.0) - rate) * (1 - exp(-elapsed / 240))
    credit = min(64.0, credit + rate * elapsed / 1000)
    val count = minOf(pending(), floor(credit).toInt(), 32)
    var released = 0
    while (released < count) {
      val start = if (cursor == 0) 0 else ends[cursor - 1]
      val end = ends[cursor++]
      val glyph = target.substring(start, end)
      released++
      val sentence = glyph.any { it in "。！？.!?" }
      val clause = glyph.any { it in "，、；：,;:" }
      val line = '\n' in glyph
      if (sentence || clause || line) {
        if (line && '\n' in target.substring(end, ends.getOrNull(cursor) ?: end)) continue
        val fast = rate > 180
        val scale = min(1.0, sqrt(42 / rate)) * if (fast) (180 / rate).pow(2) else 1.0
        val pause = (if (line) 190 else if (sentence) 125 else 55) * scale
        if (fast && !line && pause < 32) continue
        pauseUntil = at + max(if (fast) 32.0 else 0.0, pause)
        if (!fast) credit = 0.0
        break
      }
    }
    credit = max(0.0, credit - released)
    body = target.substring(0, if (cursor == 0) 0 else ends[cursor - 1])
    return snapshot()
  }

  @Synchronized fun flush(): Map<String, Any> {
    cursor = ends.size
    body = target
    credit = 0.0
    return snapshot()
  }

  @Synchronized fun resetClock(at: Double) {
    last = at; first = at; arrived = at; credit = 0.0; pauseUntil = 0.0
  }
}
