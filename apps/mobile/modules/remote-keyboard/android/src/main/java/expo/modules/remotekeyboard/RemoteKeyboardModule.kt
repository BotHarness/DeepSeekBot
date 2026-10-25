package expo.modules.remotekeyboard

import java.util.Collections
import java.util.WeakHashMap
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RemoteKeyboardModule : Module() {
  private val views = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap<RemoteKeyboardView, Boolean>()))
  private val main = Handler(Looper.getMainLooper())

  private fun suspendViews() {
    val owned = synchronized(views) { views.toList() }
    val suspend = Runnable { owned.forEach { it.suspendInput() } }
    if (Looper.myLooper() == Looper.getMainLooper()) suspend.run() else main.post(suspend)
  }

  override fun definition() = ModuleDefinition {
    Name("RemoteKeyboard")
    OnActivityEntersBackground { suspendViews() }
    OnDestroy { suspendViews(); views.clear() }
    View(RemoteKeyboardView::class) {
      Events("onInput", "onDismissed")
      Prop("session") { view: RemoteKeyboardView, value: String -> view.session = value }
      Prop("opened") { view: RemoteKeyboardView, value: Boolean -> view.opened = value }
      Prop("accepting") { view: RemoteKeyboardView, value: Boolean -> view.accepting = value }
      OnViewDidUpdateProps { view: RemoteKeyboardView -> views.add(view); view.sync() }
    }
  }
}
