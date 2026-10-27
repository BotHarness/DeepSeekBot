package expo.modules.materialfabmenu

import android.view.View
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.ReactApplicationContext
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import java.lang.ref.WeakReference
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class MaterialFabMenuViewTest {
  @Test fun detachedMeasureKeepsYogaBoundsWithoutCreatingAWindowComposition() {
    val context = RuntimeEnvironment.getApplication()
    val react: ReactApplicationContext = BridgeReactContext(context)
    val modules = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val menu = MaterialFabMenuView(context, app)
    menu.measure(
      View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(144, View.MeasureSpec.EXACTLY),
    )
    menu.layout(0, 0, 200, 144)
    assertEquals(200, menu.measuredWidth)
    assertEquals(144, menu.measuredHeight)
  }
}
