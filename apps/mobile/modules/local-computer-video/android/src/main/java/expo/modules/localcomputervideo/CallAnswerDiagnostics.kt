package expo.modules.localcomputervideo

/** Test-audio report metadata only. Never retains or emits SDP or candidate content. */
internal class CallAnswerDiagnostics(private val emit: (Map<String, Any?>) -> Unit) {
  private var sequence = 0
  private var answerRecorded = false
  private var afterAnswer = 0

  fun note(stage: String, gathering: String?, description: String?, pending: Boolean,
           force: Boolean = false, timeout: Boolean = false, callback: String? = null) {
    if (stage !in setOf("gathering", "candidate", "check", "answer")) return
    if (stage == "answer") {
      if (answerRecorded) return
      answerRecorded = true
    } else if (answerRecorded) {
      if (afterAnswer >= 2) return
      afterAnswer++
    } else if (sequence >= 29) return
    if (sequence >= 32) return
    val count = description?.lineSequence()?.count { it.startsWith("a=candidate:") } ?: 0
    val states = setOf("NEW", "GATHERING", "COMPLETE")
    val detail = mapOf<String, Any?>(
      "seq" to ++sequence, "stage" to stage,
      "gathering" to gathering?.takeIf { it in states },
      "callback" to callback?.takeIf { it in states },
      "localCandidates" to count.coerceAtMost(65535),
      "descriptionPresent" to (description != null), "pending" to pending,
      "force" to force, "timeout" to timeout,
    )
    runCatching { emit(detail) }
  }
}
