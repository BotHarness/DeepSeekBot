package expo.modules.localcomputervideo

internal data class CallAnswerSnapshot<State>(val gathering: State, val description: String?) {
  fun ready(complete: State, force: Boolean): Boolean =
    description?.contains("a=candidate:") == true && (gathering == complete || force)
}

internal fun <State> readCallAnswerSnapshot(
  gathering: () -> State,
  description: () -> String?,
): CallAnswerSnapshot<State> {
  // COMPLETE must be observed before taking the SDP snapshot it authorizes.
  val currentGathering = gathering()
  val currentDescription = description()
  return CallAnswerSnapshot(currentGathering, currentDescription)
}
