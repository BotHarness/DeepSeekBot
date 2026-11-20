package expo.modules.latestanchor

import expo.modules.kotlin.viewevent.ViewEvent
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements

/** Records the payloads native views dispatch, so tests can read events without a React bridge. */
@Implements(ViewEvent::class, isInAndroidSdk = false)
class TargetEventBridge {
  @Implementation fun invoke(payload: Any?) { events.add(payload) }
  companion object { val events = mutableListOf<Any?>() }
}
