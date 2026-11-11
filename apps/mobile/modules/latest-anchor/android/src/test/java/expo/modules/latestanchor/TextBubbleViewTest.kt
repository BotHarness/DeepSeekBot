package expo.modules.latestanchor

import android.app.Activity
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import java.time.Duration
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TextBubbleViewTest {
  private val style = mapOf<String, Any?>(
    "accent" to "#c0392b", "surface" to "#f0f0f4", "onAccent" to "#ffffff", "fg" to "#1b1b1f", "muted" to "#77777f",
    "bodySize" to 14.0, "bodyLine" to 20.0, "metaSize" to 12.0, "metaLine" to 16.0,
    "rowInset" to 12.0, "firstGap" to 12.0, "padX" to 16.0, "padY" to 10.0, "open" to 16.0,
    "touch" to mapOf(
      "pressHuman" to "#ffffff1f", "pressBot" to "#1b1b1f1f", "hintFill" to "#eeeeee", "hintInk" to "#77777f",
      "holdMs" to 500.0, "swipeStart" to 12.0, "swipeBackFail" to 8.0, "swipeVerticalFail" to 10.0,
      "swipeCommit" to 56.0, "swipeReach" to 72.0,
    ),
  )

  private class Recorder(override var swipeEnabled: Boolean = true) : BubbleActions {
    val calls = mutableListOf<String>()
    override fun press(view: TextBubbleView, row: TextRow) { calls += "press:${row.key}" }
    override fun hold(view: TextBubbleView, row: TextRow) { calls += "hold:${row.key}" }
    override fun arm(row: TextRow) { calls += "arm:${row.key}" }
    override fun reply(row: TextRow) { calls += "reply:${row.key}" }
  }

  private fun bubble(actions: Recorder): TextBubbleView {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    val view = TextBubbleView(activity)
    activity.setContentView(FrameLayout(activity).apply { addView(view) })
    val layout = TextBubbleLayout(TextRow("item:m", false, true, true, "hello", "09:30"), TextRowStyle.from(style)!!, 1200, view.resources.displayMetrics.density)
    view.layout = layout
    view.actions = actions
    view.measure(View.MeasureSpec.makeMeasureSpec(1200, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(layout.height, View.MeasureSpec.EXACTLY))
    view.layout(0, 0, 1200, layout.height)
    return view
  }

  private val start = SystemClock.uptimeMillis()
  private fun TextBubbleView.touch(action: Int, x: Float, y: Float, at: Long = 0) =
    onTouchEvent(MotionEvent.obtain(start, start + at, action, x, y, 0))

  @Test fun tapInsideTheBubblePresses() {
    val actions = Recorder()
    val view = bubble(actions)
    val inside = view.layout!!.bubble
    assertFalse(view.touch(MotionEvent.ACTION_DOWN, inside.right + 50f, inside.centerY()))
    assertTrue(view.touch(MotionEvent.ACTION_DOWN, inside.centerX(), inside.centerY()))
    view.touch(MotionEvent.ACTION_UP, inside.centerX(), inside.centerY(), 80)
    assertEquals(listOf("press:item:m"), actions.calls)
  }

  @Test fun holdingSelectsWithoutAlsoPressing() {
    val actions = Recorder()
    val view = bubble(actions)
    val inside = view.layout!!.bubble
    view.touch(MotionEvent.ACTION_DOWN, inside.centerX(), inside.centerY())
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(520))
    view.touch(MotionEvent.ACTION_UP, inside.centerX(), inside.centerY(), 600)
    assertEquals(listOf("hold:item:m"), actions.calls)
  }

  @Test fun swipingTowardTheReplySideArmsAndReplies() {
    val actions = Recorder()
    val view = bubble(actions)
    val density = view.resources.displayMetrics.density
    val inside = view.layout!!.bubble
    val x = inside.centerX()
    val y = inside.centerY()
    view.touch(MotionEvent.ACTION_DOWN, x, y)
    view.touch(MotionEvent.ACTION_MOVE, x - 20 * density, y, 16)
    view.touch(MotionEvent.ACTION_MOVE, x - 60 * density, y, 32)
    view.touch(MotionEvent.ACTION_UP, x - 60 * density, y, 48)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(600))
    assertEquals(listOf("arm:item:m", "reply:item:m"), actions.calls)
  }

  @Test fun shortOrDisabledSwipesDoNotReply() {
    val actions = Recorder()
    val view = bubble(actions)
    val density = view.resources.displayMetrics.density
    val inside = view.layout!!.bubble
    val x = inside.centerX()
    val y = inside.centerY()
    view.touch(MotionEvent.ACTION_DOWN, x, y)
    view.touch(MotionEvent.ACTION_MOVE, x - 30 * density, y, 16)
    view.touch(MotionEvent.ACTION_UP, x - 30 * density, y, 32)
    actions.swipeEnabled = false
    view.touch(MotionEvent.ACTION_DOWN, x, y, 100)
    view.touch(MotionEvent.ACTION_MOVE, x - 60 * density, y, 116)
    view.touch(MotionEvent.ACTION_UP, x - 60 * density, y, 132)
    assertEquals(emptyList<String>(), actions.calls)
  }
}
