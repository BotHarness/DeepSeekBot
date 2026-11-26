package expo.modules.dismissibledrawer

import android.app.Activity
import android.view.View
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ScrollsBackTest {
  /** A wide code block keeps a swipe only while it can still scroll back toward its leading edge. */
  @Test fun yieldsToAScrolledCodeBlockOnly() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    val root = FrameLayout(activity)
    val block = HorizontalScrollView(activity)
    val code = View(activity)
    block.addView(code, FrameLayout.LayoutParams(2000, 200))
    root.addView(block, FrameLayout.LayoutParams(1000, 200))
    activity.setContentView(root)
    root.layout(0, 0, 1000, 2000)
    block.layout(0, 500, 1000, 700)
    code.layout(0, 0, 2000, 200)

    val origin = IntArray(2).also(root::getLocationOnScreen)
    val x = origin[0] + 300f
    val y = origin[1] + 600f
    assertFalse(scrollsBack(root, x, y, rtl = false))

    block.scrollTo(400, 0)
    assertTrue(scrollsBack(root, x, y, rtl = false))
    assertFalse(scrollsBack(root, x, origin[1] + 100f, rtl = false))

    block.scrollTo(0, 0)
    assertFalse(scrollsBack(root, x, y, rtl = false))
  }
}
