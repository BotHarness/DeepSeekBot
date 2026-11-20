package expo.modules.latestanchor

import android.app.Activity
import android.graphics.Matrix
import android.graphics.RectF
import android.view.View
import android.widget.FrameLayout
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class WindowMatrixTest {
  /** windowMatrix must match the API 29 platform mapping through the inverted list's double flip. */
  @Test fun matchesThePlatformMappingThroughFlippedAndScrolledParents() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    val list = FrameLayout(activity).apply { scaleY = -1f }
    val row = FrameLayout(activity).apply { scaleY = -1f }
    val bubble = View(activity)
    row.addView(bubble, FrameLayout.LayoutParams(300, 80))
    list.addView(row, FrameLayout.LayoutParams(1000, 400))
    activity.setContentView(FrameLayout(activity).apply { addView(list, FrameLayout.LayoutParams(1000, 2000)) })
    list.layout(0, 100, 1000, 2100)
    row.layout(0, 600, 1000, 1000)
    bubble.layout(650, 30, 950, 110)
    list.scrollTo(0, 40)

    val platform = Matrix().also(bubble::transformMatrixToGlobal)
    val ours = windowMatrix(bubble)
    val expected = RectF(0f, 0f, 300f, 80f).also(platform::mapRect)
    val actual = RectF(0f, 0f, 300f, 80f).also(ours::mapRect)
    assertEquals(expected.left, actual.left, 0.01f)
    assertEquals(expected.top, actual.top, 0.01f)
    assertEquals(expected.right, actual.right, 0.01f)
    assertEquals(expected.bottom, actual.bottom, 0.01f)
  }
}
