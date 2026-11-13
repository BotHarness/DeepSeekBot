package expo.modules.predictiveback

import android.view.View
import androidx.activity.OnBackPressedCallback
import com.facebook.react.ReactActivity
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PredictiveBackModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PredictiveBack")
    View(PredictivePageView::class) {
      Events("onBack")
      Prop("active") { view: PredictivePageView, value: Boolean -> view.setActive(value) }
      Prop("reducedMotion") { view: PredictivePageView, value: Boolean -> view.reducedMotion = value }
      GroupView<PredictivePageView> {
        AddChildView { parent: PredictivePageView, child: View, index: Int -> parent.addSlot(child, index) }
        GetChildCount { parent -> parent.slotCount }
        GetChildViewAt { parent, index -> parent.slotAt(index) }
        RemoveChildView { parent: PredictivePageView, child: View -> parent.removeSlot(child) }
        RemoveChildViewAt { parent, index -> parent.removeSlot(parent.slotAt(index)) }
      }
    }

    AsyncFunction("setIntercept") { enabled: Boolean ->
      val activity = appContext.currentActivity as? ReactActivity
      val callback = activity?.let(::rootCallback)
      callback?.isEnabled = enabled
      callback != null
    }.runOnQueue(Queues.MAIN)
  }
}

fun rootCallback(activity: ReactActivity): OnBackPressedCallback? =
  runCatching {
      ReactActivity::class.java.getDeclaredField("mBackPressedCallback").let {
        it.isAccessible = true
        it.get(activity) as OnBackPressedCallback
      }
    }
    .getOrNull()
