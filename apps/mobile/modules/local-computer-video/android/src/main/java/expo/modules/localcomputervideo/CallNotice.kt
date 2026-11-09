package expo.modules.localcomputervideo

/**
 * What the ongoing call notification and the over-other-apps bubble show (#3423, #3469).
 * JavaScript owns the call state and the localized words; native only draws them, so the
 * notification, the native bubble and the in-app bubble never disagree.
 */
data class CallNotice(
  val name: String,
  val status: String,
  val tone: String,
  /** Wall-clock start of the live call; null before it connects. */
  val startedAt: Long?,
  val muted: Boolean,
  val muteLabel: String,
  val unmuteLabel: String,
  val hangUpLabel: String,
  val channelName: String,
  val bubbleLabel: String,
  /** The app's resolved theme (it can differ from the system's), ARGB. */
  val ringColor: Int,
  val surfaceColor: Int,
  val fgColor: Int,
  val baseColor: Int,
) {
  val initial: String
    get() {
      val trimmed = name.trim()
      if (trimmed.isEmpty()) return "?"
      val end = trimmed.offsetByCodePoints(0, 1)
      return trimmed.substring(0, end).uppercase()
    }

  companion object {
    val tones = setOf("connecting", "listening", "hearing", "thinking", "speaking", "muted", "paused")
    private const val LIMIT = 300

    private fun text(map: Map<String, Any?>, key: String): String? =
      (map[key] as? String)?.trim()?.takeIf { it.isNotEmpty() && it.length <= LIMIT }

    /** Refuses anything malformed instead of drawing a half-filled notification. */
    fun from(map: Map<String, Any?>): CallNotice? {
      val tone = text(map, "tone")?.takeIf { it in tones } ?: return null
      val started = (map["startedAt"] as? Number)?.toLong()?.takeIf { it > 0 }
      return CallNotice(
        name = text(map, "name") ?: return null,
        status = text(map, "status") ?: return null,
        tone = tone,
        startedAt = started,
        muted = map["muted"] == true,
        muteLabel = text(map, "muteLabel") ?: return null,
        unmuteLabel = text(map, "unmuteLabel") ?: return null,
        hangUpLabel = text(map, "hangUpLabel") ?: return null,
        channelName = text(map, "channelName") ?: return null,
        bubbleLabel = text(map, "bubbleLabel") ?: return null,
        ringColor = hexColor(map["ringColor"]) ?: return null,
        surfaceColor = hexColor(map["surfaceColor"]) ?: return null,
        fgColor = hexColor(map["fgColor"]) ?: return null,
        baseColor = hexColor(map["baseColor"]) ?: return null,
      )
    }
  }
}

/** Opaque ARGB from `#rgb` or `#rrggbb`; anything else is refused. */
fun hexColor(value: Any?): Int? {
  val text = (value as? String)?.trim()?.removePrefix("#") ?: return null
  val full = when {
    text.length == 3 && text.all { it.isLetterOrDigit() } -> text.map { "$it$it" }.joinToString("")
    text.length == 6 -> text
    else -> return null
  }
  val rgb = full.toIntOrNull(16) ?: return null
  return (0xFF shl 24) or rgb
}

/** "4:05" or "1:02:03", matching the in-app call time. */
fun callDuration(elapsedMs: Long): String {
  val seconds = maxOf(0L, elapsedMs / 1000)
  val h = seconds / 3600
  val m = (seconds % 3600) / 60
  val s = seconds % 60
  return if (h > 0) String.format(java.util.Locale.ROOT, "%d:%02d:%02d", h, m, s)
  else String.format(java.util.Locale.ROOT, "%d:%02d", m, s)
}

/** Where the over-other-apps bubble may sit: inside the safe area, snapped to a side. */
object CallBubblePlacement {
  /** Left edge x for the side nearest to the bubble's centre. */
  fun snapX(x: Int, width: Int, screenWidth: Int, left: Int, right: Int, margin: Int): Int {
    val minX = left + margin
    val maxX = maxOf(minX, screenWidth - right - margin - width)
    return if (x + width / 2 < screenWidth / 2) minX else maxX
  }

  fun clampY(y: Int, height: Int, screenHeight: Int, top: Int, bottom: Int, margin: Int): Int {
    val minY = top + margin
    val maxY = maxOf(minY, screenHeight - bottom - margin - height)
    return y.coerceIn(minY, maxY)
  }
}

/**
 * A call is interrupted while another app holds audio focus or a phone call owns the
 * audio mode. Both must clear before the uplink resumes.
 */
class CallInterruption(private val onChange: (Boolean) -> Unit) {
  var focusLost = false
    private set
  var otherCall = false
    private set
  val interrupted: Boolean get() = focusLost || otherCall

  fun focus(lost: Boolean) = update { focusLost = lost }
  fun phoneCall(active: Boolean) = update { otherCall = active }
  fun reset() = update { focusLost = false; otherCall = false }

  private fun update(change: () -> Unit) {
    val before = interrupted
    change()
    if (before != interrupted) onChange(interrupted)
  }
}
