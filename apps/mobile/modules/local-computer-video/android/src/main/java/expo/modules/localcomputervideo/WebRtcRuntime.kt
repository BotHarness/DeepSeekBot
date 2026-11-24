package expo.modules.localcomputervideo

import android.content.Context
import org.webrtc.PeerConnectionFactory

internal class RunOnce<T>(private val action: (T) -> Unit) {
  @Volatile private var done = false

  fun run(value: T) {
    if (done) return
    synchronized(this) {
      if (done) return
      action(value)
      done = true
    }
  }
}

internal object WebRtcRuntime {
  private val init = RunOnce<Context> { context ->
    PeerConnectionFactory.initialize(
      PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions())
  }

  fun initialize(context: Context) = init.run(context)
}
