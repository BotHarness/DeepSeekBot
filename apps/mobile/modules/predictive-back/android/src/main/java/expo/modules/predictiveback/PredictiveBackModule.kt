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

/**
 * React Native 0.88 registers an always-enabled back callback on ReactActivity, so Android
 * never plays the back-to-home preview. Until BackHandler.setInterceptEnabled lands upstream
 * (react-native#59292), JavaScript turns it off whenever nothing in the app can go back.
 */
fun rootCallback(activity: ReactActivity): OnBackPressedCallback? =
  runCatching {
      ReactActivity::class.java.getDeclaredField("mBackPressedCallback").let {
        it.isAccessible = true
        it.get(activity) as OnBackPressedCallback
      }
    }
    .getOrNull()
