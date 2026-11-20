package expo.modules.streamreveal

import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.sharedobjects.SharedObject

class NativeTextPlayback(app: AppContext, initial: String, now: Double) : SharedObject(app) {
  internal val player = TextPlayback(initial, now)
}

internal class PlaybackFrameClock(private val completed: (Int) -> Unit) {
  private val handler = Handler(Looper.getMainLooper())
  private var generation = 0L
  private var frame: Choreographer.FrameCallback? = null

  @Synchronized fun cancel() {
    generation++
    handler.removeCallbacksAndMessages(null)
    val previous = frame
    frame = null
    if (previous != null) handler.post { Choreographer.getInstance().removeFrameCallback(previous) }
  }

  @Synchronized fun schedule(players: List<TextPlayback>, token: Int) {
    cancel()
    val request = generation
    handler.post {
      synchronized(this) {
        if (request != generation) return@post
        val callback = Choreographer.FrameCallback {
          synchronized(this) {
            if (request != generation) return@FrameCallback
            frame = null
            val now = System.currentTimeMillis().toDouble()
            players.forEach { it.advance(now) }
            completed(token)
          }
        }
        frame = callback
        Choreographer.getInstance().postFrameCallbackDelayed(callback, 32)
      }
    }
  }

}

class PlaybackClock(app: AppContext) : SharedObject(app) {
  private val clock = PlaybackFrameClock { emit("frame", it) }
  fun schedule(players: List<NativeTextPlayback>, token: Int) = clock.schedule(players.map { it.player }, token)
  fun cancel() = clock.cancel()
  override fun sharedObjectDidRelease() { cancel(); super.sharedObjectDidRelease() }
}

class TextPlaybackModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TextPlayback")
    Class(NativeTextPlayback::class) {
      Constructor { initial: String, now: Double -> NativeTextPlayback(appContext, initial, now) }
      Function("getSnapshot") { player: NativeTextPlayback -> player.player.snapshot() }
      Function("receive") { player: NativeTextPlayback, text: String, finished: Boolean, at: Double -> player.player.receive(text, finished, at) }
      Function("advance") { player: NativeTextPlayback, at: Double -> player.player.advance(at) }
      Function("flush") { player: NativeTextPlayback -> player.player.flush() }
      Function("resetClock") { player: NativeTextPlayback, at: Double -> player.player.resetClock(at) }
    }
    Class(PlaybackClock::class) {
      Constructor { -> PlaybackClock(appContext) }
      Function("schedule") { clock: PlaybackClock, players: List<NativeTextPlayback>, token: Int -> clock.schedule(players, token) }
      Function("cancel") { clock: PlaybackClock -> clock.cancel() }
    }
  }
}
