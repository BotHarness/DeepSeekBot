package expo.modules.speakeranchor

import android.graphics.RectF
import android.view.View
import android.widget.FrameLayout
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class SpeakerGeometryTest {
  @Test
  fun restsAtTheBubbleRidesTheFloorAndStopsAtTheFirstBubble() {
    assertEquals(40f, SpeakerGeometry.offset(400f, 32f, 40f, 100f, 700f))
    assertEquals(-20f, SpeakerGeometry.offset(688f, 32f, 40f, 100f, 700f))
    assertEquals(-100f, SpeakerGeometry.offset(900f, 32f, 40f, 100f, 700f))
  }

  @Test
  fun windowRectFollowsTheLiveScrollOffset() {
    val context = RuntimeEnvironment.getApplication()
    val root = FrameLayout(context)
    val scroll = FrameLayout(context)
    val content = FrameLayout(context)
    val cell = FrameLayout(context)
    val avatar = View(context)
    cell.addView(avatar)
    content.addView(cell)
    scroll.addView(content)
    root.addView(scroll)
    scroll.layout(0, 0, 300, 600)
    content.layout(0, 0, 300, 2000)
    cell.layout(0, 1000, 300, 1100)
    avatar.layout(0, 10, 32, 42)
    scroll.scrollTo(0, 700)
    val rect = SpeakerGeometry.windowRect(avatar, false, RectF())
    assertEquals(310f, rect.top)
    scroll.scrollTo(0, 400)
    SpeakerGeometry.windowRect(avatar, false, rect)
    assertEquals(610f, rect.top)
    assertEquals(32f, rect.height())
  }
}
