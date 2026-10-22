package expo.modules.localcomputervideo

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.os.Handler
import android.os.Looper
import java.util.Collections
import java.util.WeakHashMap

class LocalComputerVideoModule : Module() {
  private val views = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap<LocalComputerVideoView, Boolean>()))
  private val main = Handler(Looper.getMainLooper())
  private var foreground = true

  private fun stopViews(reason: String) {
    val owned = synchronized(views) { views.toList() }
    val stop = Runnable { owned.forEach { it.setAppForeground(false); it.suspendMedia(reason) } }
    if (Looper.myLooper() == Looper.getMainLooper()) stop.run() else main.post(stop)
  }

  override fun definition() = ModuleDefinition {
    Name("LocalComputerVideo")
    OnActivityEntersBackground {
      foreground = false
      // Native lifecycle is authoritative even while the JS thread is suspended.
      stopViews("background")
    }
    OnActivityEntersForeground {
      foreground = true
      synchronized(views) { views.toList() }.forEach { it.setAppForeground(true) }
    }
    OnDestroy { stopViews("disposed"); views.clear() }
    View(LocalComputerVideoView::class) {
      Events("onDescription", "onMediaState", "onPresentation")
      Prop("attemptId") { view: LocalComputerVideoView, value: String -> view.attemptId = value }
      Prop("offer") { view: LocalComputerVideoView, value: String -> view.offer = value }
      Prop("enabled") { view: LocalComputerVideoView, value: Boolean -> view.enabled = value }
      OnViewDidUpdateProps { view: LocalComputerVideoView ->
        views.add(view)
        view.setAppForeground(foreground)
        view.sync()
      }
    }
  }
}
