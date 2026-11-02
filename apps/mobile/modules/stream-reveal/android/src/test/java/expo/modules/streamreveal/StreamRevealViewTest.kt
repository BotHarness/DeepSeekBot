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
class StreamRevealViewTest {
  private fun container(): StreamRevealView {
    val context = RuntimeEnvironment.getApplication()
    val react: ReactApplicationContext = BridgeReactContext(context)
    val modules = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    return StreamRevealView(context, app)
  }

  @Test fun parentRelayoutPreservesReactManagedChildBounds() {
    val context = RuntimeEnvironment.getApplication()
    val parent = container()
    val text = TextView(context).apply { this.text = "正文".repeat(10000) }
    parent.addView(text)
    val bounds = Rect(13, 17, 848, 69437)
    text.layout(bounds.left, bounds.top, bounds.right, bounds.bottom)
    parent.layout(0, 0, 900, 70000)
    assertEquals(bounds, Rect(text.left, text.top, text.right, text.bottom))
    parent.forceLayout()
    parent.layout(0, 0, 1000, 80000)
    assertEquals(bounds, Rect(text.left, text.top, text.right, text.bottom))
  }

  @Test fun parentMeasurePreservesReactManagedTextMeasurement() {
    val context = RuntimeEnvironment.getApplication()
    var measurements = 0
    val text = object : TextView(context) {
      override fun onMeasure(width: Int, height: Int) {
        measurements++
        super.onMeasure(width, height)
      }
    }.apply { this.text = "Measured paragraph ".repeat(20) }
    val parent = container()
    parent.addView(text)
    val width = View.MeasureSpec.makeMeasureSpec(835, View.MeasureSpec.EXACTLY)
    val height = View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY)
    text.measure(width, height)
    val count = measurements
    val layoutWidth = text.layout.width
    parent.measure(width, height)
    assertEquals(count, measurements)
    assertEquals(835, text.measuredWidth)
    assertEquals(200, text.measuredHeight)
    assertEquals(layoutWidth, text.layout.width)
    assertEquals(835, parent.measuredWidth)
    assertEquals(200, parent.measuredHeight)
  }

  @Test fun delayedFinalParagraphKeepsItsReactManagedSize() {
    val parent = container()
    parent.layout(0, 0, 835, 0)
    val text = TextView(RuntimeEnvironment.getApplication()).apply {
      this.text = "最后一段：REPLAY_COMPLETE。"
    }
    parent.addView(text)
    val width = View.MeasureSpec.makeMeasureSpec(835, View.MeasureSpec.EXACTLY)
    val height = View.MeasureSpec.makeMeasureSpec(65, View.MeasureSpec.EXACTLY)
    text.measure(width, height)
    text.layout(0, 0, 835, 65)
    // A delayed committed suffix mounts after the rest of the Markdown bubble.
    parent.measure(width, height)
    parent.layout(0, 0, 835, 65)
    assertEquals(Rect(0, 0, 835, 65), Rect(text.left, text.top, text.right, text.bottom))
    assertEquals(835, text.measuredWidth)
    assertEquals(65, text.measuredHeight)
  }
  @GraphicsMode(GraphicsMode.Mode.NATIVE)
  @Test fun hugeActiveParagraphDrawsWithinViewportWithoutChangingTextOrLayout() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    val root = FrameLayout(activity)
    activity.setContentView(root)
    val screenHeight = activity.resources.displayMetrics.heightPixels
    val width = 200
    val parent = container().apply { active = true }
    val canvasHeights = mutableListOf<Int>()
    val clips = mutableListOf<Rect>()
    val text = object : TextView(activity) {
      override fun onDraw(canvas: Canvas) {
        canvasHeights.add(canvas.height)
        clips.add(Rect().also { canvas.getClipBounds(it) })
        super.onDraw(canvas)
      }
    }.apply { this.text = "Unicode e\u0301 👨‍👩‍👧‍👦 نهاية ".repeat(300) }
    parent.addView(text)
    root.addView(parent, FrameLayout.LayoutParams(width, screenHeight * 4))
    root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(screenHeight, View.MeasureSpec.EXACTLY))
    root.layout(0, 0, width, screenHeight)
    text.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(screenHeight * 4, View.MeasureSpec.EXACTLY))
    text.layout(0, 0, width, screenHeight * 4)
    val content = text.text
    val original = content.toString()
    val output = Canvas(Bitmap.createBitmap(width, screenHeight * 3, Bitmap.Config.ARGB_8888))
    parent.viewTreeObserver.dispatchOnPreDraw()
    parent.draw(output)
    assertTrue("the native draw canvas must not grow with the paragraph", canvasHeights.last() <= screenHeight)
    assertEquals(screenHeight * 4, text.height)
    assertSame(content, text.text)
    assertEquals(original, text.text.toString())
    val firstClip = clips.last()
    root.scrollTo(0, screenHeight)
    parent.viewTreeObserver.dispatchOnPreDraw()
    parent.draw(output)
    assertTrue("scroll must move the native text drawing window", clips.last().top > firstClip.top)
    assertEquals(screenHeight * 4, text.height)
    root.scrollTo(0, screenHeight * 5)
    parent.viewTreeObserver.dispatchOnPreDraw()
    val drawsBeforeLeavingViewport = canvasHeights.size
    parent.draw(output)
    assertEquals("offscreen paragraphs do not rasterize", drawsBeforeLeavingViewport, canvasHeights.size)
    root.scrollTo(0, 0)
    text.alpha = 0.5f
    parent.viewTreeObserver.dispatchOnPreDraw()
    parent.draw(output)
    assertEquals("child opacity uses normal view composition", screenHeight * 3, canvasHeights.last())
    text.alpha = 1f
    parent.viewTreeObserver.dispatchOnPreDraw()
    parent.draw(output)
    assertEquals(screenHeight, canvasHeights.last())
    parent.scrollTo(0, 10)
    parent.viewTreeObserver.dispatchOnPreDraw()
    parent.draw(output)
    assertEquals("wrapper scrolling uses normal view composition", screenHeight * 3, canvasHeights.last())
    parent.scrollTo(0, 0)
    parent.viewTreeObserver.dispatchOnPreDraw()
    parent.draw(output)
    assertEquals(screenHeight, canvasHeights.last())
    parent.active = false
    parent.sync()
    parent.viewTreeObserver.dispatchOnPreDraw()
    parent.draw(output)
    assertEquals("finished text returns to normal view drawing", screenHeight * 3, canvasHeights.last())
    activity.finish()
  }
}
