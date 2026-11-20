package expo.modules.latestanchor

import kotlin.math.max
import kotlin.math.min

/**
 * One group-chat row that belongs to a speaker run, as sent by JavaScript. [bottom] is the distance
 * in logical pixels from the row's bottom edge up to its bubble's bottom edge; [name] marks the first
 * row of a run, which shows the speaker's name above its bubble.
 */
data class SpeakerSlot(val key: String, val group: String, val first: Boolean, val name: Boolean, val bottom: Float) {
  companion object {
    fun from(value: Map<String, Any?>): SpeakerSlot? {
      val key = value["key"] as? String ?: return null
      val group = value["group"] as? String ?: return null
      return SpeakerSlot(key, group, value["first"] == true, value["name"] == true, (value["bottom"] as? Number)?.toFloat() ?: 0f)
    }
  }
}

object SpeakerPlacement {
  /**
   * Top of a speaker avatar of [size], in the same coordinates as the run: it rests beside the run's
   * last bubble ([runBottom]), stays above the composer ([floor]) while that bubble is below it, and
   * never rises above the run's first bubble ([runTop]). Null while the run is off screen.
   */
  fun avatarTop(runTop: Float, runBottom: Float, floor: Float, size: Float, viewport: Float): Float? {
    if (runBottom <= 0f || runTop >= viewport) return null
    return max(min(runBottom, floor), runTop + size) - size
  }
}
