package expo.modules.streamreveal

import android.app.Activity
import android.view.View
import android.widget.FrameLayout
import android.widget.ScrollView
import com.facebook.react.bridge.BridgeReactContext
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import java.lang.ref.WeakReference
import expo.modules.kotlin.viewevent.ViewEvent
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements

@Implements(ViewEvent::class, isInAndroidSdk = false)
class WindowEventBridge {
  @Implementation fun invoke(payload: Any?) { events.add(payload) }

  companion object {
    val events = mutableListOf<Any?>()
  }
}

@RunWith(RobolectricTestRunner::class)
@Config(
  sdk = [35],
  shadows = [WindowEventBridge::class],
  instrumentedPackages = ["expo.modules.kotlin.viewevent"],
)
class MarkdownBlockWindowViewTest {
  @Test fun offscreenBlocksRestoreWithoutMovingFabricChildren() = exercise(false)
  @Test fun invertedCoordinatesRestoreTheSameBlocks() = exercise(true)
  @Test fun recyclingScrollContainersUseActualBlockBounds() = exercise(true, true)

  private fun exercise(inverted: Boolean, generic: Boolean = false) {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
    WindowEventBridge.events.clear()
    val react = BridgeReactContext(activity)
    val modules = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val block = MarkdownBlockWindowView(react, app).apply { eligible = true }
    var measures = 0
    val child = object : View(activity) {
      override fun onMeasure(w: Int, h: Int) { measures++; super.onMeasure(w, h) }
    }
    block.addView(child)
    val content = FrameLayout(activity).apply { addView(block) }
    val scroll = if (generic) FrameLayout(activity).apply { isScrollContainer = true; addView(content) }
      else ScrollView(activity).apply { addView(content) }
    activity.setContentView(scroll)
    if (inverted) { scroll.scaleY = -1f; block.scaleY = -1f }
    scroll.layout(0, 0, 300, 100)
    content.layout(0, 0, 300, 2000)
    block.layout(0, 1000, 200, 1040)
    child.layout(0, 0, 200, 40)
    block.updateWindow()
    assertTrue(block.hidden)
    val density = block.resources.displayMetrics.density
    assertEquals(mapOf("hidden" to true, "width" to 200 / density, "height" to 40 / density), WindowEventBridge.events.last())
    block.placeholder = true
    block.removeView(child)
    scroll.scrollTo(0, 950)
    block.updateWindow()
    assertFalse(block.hidden)
    assertEquals(mapOf("hidden" to false, "width" to 200 / density, "height" to 40 / density), WindowEventBridge.events.last())
    assertEquals(40, block.height)
    assertEquals(0, measures)
    assertEquals(200, child.width)
    assertEquals(40, child.height)
    scroll.scrollTo(0, 0)
    block.updateWindow()
    assertTrue(block.hidden)
    block.eligible = false
    block.updateWindow()
    assertFalse(block.hidden)
    content.removeView(block)
    block.eligible = true
    block.updateWindow()
    assertFalse(block.hidden)
    activity.finish()
  }
}
