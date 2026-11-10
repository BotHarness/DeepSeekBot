package expo.modules.streamreveal

import android.app.Activity
import android.view.View
import android.widget.FrameLayout
import android.widget.ScrollView
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.ReactApplicationContext
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import java.lang.ref.WeakReference
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class MarkdownBlockWindowViewTest {
  @Test fun offscreenBlocksRestoreWithoutMovingFabricChildren() = exercise(false)
  @Test fun invertedCoordinatesRestoreTheSameBlocks() = exercise(true)

  private fun exercise(inverted: Boolean) {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
    val react: ReactApplicationContext = BridgeReactContext(activity)
    val modules = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val block = MarkdownBlockWindowView(activity, app).apply { eligible = true }
    var measures = 0
    val child = object : View(activity) {
      override fun onMeasure(w: Int, h: Int) { measures++; super.onMeasure(w, h) }
    }
    block.addView(child)
    val content = FrameLayout(activity).apply { addView(block) }
    val scroll = ScrollView(activity).apply { addView(content) }
    activity.setContentView(scroll)
    if (inverted) { scroll.scaleY = -1f; block.scaleY = -1f }
    scroll.layout(0, 0, 300, 100)
    content.layout(0, 0, 300, 2000)
    block.layout(0, 1000, 200, 1040)
    child.layout(0, 0, 200, 40)
    block.updateWindow()
    assertTrue(block.hidden)
    block.placeholder = true
    block.removeView(child)
    scroll.scrollTo(0, 950)
    block.updateWindow()
    assertFalse(block.hidden)
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
