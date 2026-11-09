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
  /**
   * Absolute path of the Bot's notification-avatar PNG (from the `avatar` file URL, see
   * src/host/native-notification-avatars.ts); [CallAvatarFiles] still checks it. Null draws the initial.
   */
  val avatarPath: String? = null,
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
        avatarPath = avatarPath(map["avatar"]),
      )
    }

    /**
     * A `file://` URL or absolute path to a `.png`, decoded to a normalized path; anything
     * else (another scheme, a relative path, a `..` segment) is dropped and the initial shows.
     */
    fun avatarPath(value: Any?): String? {
      val text = (value as? String)?.trim()?.takeIf { it.isNotEmpty() && it.length <= 1024 } ?: return null
      val path = if (text.startsWith("/")) text else {
        val uri = runCatching { java.net.URI(text) }.getOrNull() ?: return null
        if (uri.scheme != "file" || !uri.authority.isNullOrEmpty()) return null
        uri.path ?: return null
      }
      if (!path.startsWith("/") || !path.endsWith(".png")) return null
      if (path.split('/').any { it == "." || it == ".." }) return null
      return path
    }
  }
}

/** Where the app caches notification avatars (src/host/native-notification-avatars.ts). */
object CallAvatarFiles {
  const val ROOT = "notification-avatars"

  /** The file, only when it is a PNG inside [root] (after resolving links) and exists. */
  fun resolve(root: java.io.File, path: String?): java.io.File? {
    val checked = CallNotice.avatarPath(path) ?: return null
    val base = runCatching { root.canonicalFile }.getOrNull() ?: return null
    val file = runCatching { java.io.File(checked).canonicalFile }.getOrNull() ?: return null
    if (!file.path.startsWith(base.path + java.io.File.separator) || !file.name.endsWith(".png")) return null
    return file.takeIf { it.isFile }
  }
}

/**
 * The over-other-apps bubble breathes its ring while the Bot speaks or hears you, like the
 * in-app bubble's pulse (#3805). It stays still when the system turns animations off.
 */
object CallRingBreath {
  /** One full breath, the in-app bubble's pulse period (`callBubble.pulsePeriod`). */
  const val PERIOD_MS = 1400L
  /** The faintest the ring gets, as a share of its full opacity. */
  const val MIN_ALPHA = 0.35f

  fun breathes(tone: String, animationsOn: Boolean): Boolean =
    animationsOn && (tone == "speaking" || tone == "hearing")

  /** Ring alpha for an eased 0 (full) → 1 (faintest) breath fraction. */
  fun alpha(fraction: Float): Int {
    val level = 1f - (1f - MIN_ALPHA) * fraction.coerceIn(0f, 1f)
    return (255 * level).toInt()
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
