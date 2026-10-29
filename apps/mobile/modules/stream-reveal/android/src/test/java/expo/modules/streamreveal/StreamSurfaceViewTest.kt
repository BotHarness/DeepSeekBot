package expo.modules.streamreveal

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.widget.FrameLayout
import android.view.View
import android.widget.TextView
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.BridgeReactContext
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import java.lang.ref.WeakReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class StreamSurfaceViewTest {
  private fun container(): StreamSurfaceView {
    val context = RuntimeEnvironment.getApplication()
    val react: ReactApplicationContext = BridgeReactContext(context)
    val modules = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    return StreamSurfaceView(context, app)
  }

  @GraphicsMode(GraphicsMode.Mode.NATIVE)
  @Test fun paintGrowthDoesNotMeasureOrRelayoutChildrenAndClipsNewText() {
    val parent = container().apply { active = true; surfaceColor = android.graphics.Color.RED }
    var measures = 0
    var layouts = 0
    val child = object : View(RuntimeEnvironment.getApplication()) {
      override fun onMeasure(w: Int, h: Int) { measures++; super.onMeasure(w, h) }
      override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) { layouts++ }
      override fun onDraw(canvas: Canvas) { canvas.drawColor(android.graphics.Color.BLUE) }
    }.apply { setWillNotDraw(false) }
    parent.addView(child)
    child.layout(0, 0, 100, 160)
    parent.layout(0, 0, 100, 100)
    parent.layout(0, 0, 100, 160)
    val before = layouts
    val image = Bitmap.createBitmap(100, 160, Bitmap.Config.ARGB_8888)
    parent.draw(Canvas(image))
    assertEquals(android.graphics.Color.BLUE, image.getPixel(50, 50))
    assertEquals(android.graphics.Color.TRANSPARENT, image.getPixel(50, 140))
    org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMillis(120))
    parent.draw(Canvas(image))
    assertEquals(android.graphics.Color.BLUE, image.getPixel(50, 140))
    assertEquals(0, measures)
    assertEquals(before, layouts)
    assertEquals(160, child.height)
  }
}
