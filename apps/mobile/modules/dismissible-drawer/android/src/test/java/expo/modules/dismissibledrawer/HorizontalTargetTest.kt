package expo.modules.dismissibledrawer

import android.app.Activity
import android.view.View
import android.widget.FrameLayout
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class HorizontalTargetTest {
  /** A reply-swipe owner inside a row of the inverted chat list, flipped once by the list and once by the row. */
  @Test fun findsTheSwipeOwnerInsideAFlippedRow() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    val root = FrameLayout(activity)
    val list = FrameLayout(activity).apply { scaleY = -1f }
    val row = FrameLayout(activity).apply { scaleY = -1f }
    val owner = View(activity).apply { setTag(com.facebook.react.R.id.view_tag_native_id, HORIZONTAL_SWIPE_OWNER) }
    row.addView(owner, FrameLayout.LayoutParams(400, 100))
    list.addView(row, FrameLayout.LayoutParams(1000, 300))
    root.addView(list, FrameLayout.LayoutParams(1000, 2000))
    activity.setContentView(root)
    root.layout(0, 0, 1000, 2000)
    list.layout(0, 0, 1000, 2000)
    row.layout(0, 100, 1000, 400)
    owner.layout(50, 20, 450, 120)

    val origin = IntArray(2).also(root::getLocationOnScreen)
    // The list flips the row to the bottom of the screen: rows 1600..1900, owner 1620..1720.
    assertTrue(horizontalTarget(root, origin[0] + 200f, origin[1] + 1650f))
    assertFalse(horizontalTarget(root, origin[0] + 200f, origin[1] + 150f))
    assertFalse(horizontalTarget(root, origin[0] + 700f, origin[1] + 1650f))
  }
}
