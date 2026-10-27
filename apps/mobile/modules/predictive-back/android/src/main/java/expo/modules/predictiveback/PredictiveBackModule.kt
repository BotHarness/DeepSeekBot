package expo.modules.predictiveback

import androidx.activity.OnBackPressedCallback
import com.facebook.react.ReactActivity
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PredictiveBackModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PredictiveBack")

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
