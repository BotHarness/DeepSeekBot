package expo.modules.dismissibledrawer

import android.app.Activity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import com.facebook.react.bridge.BridgeReactContext
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import java.lang.ref.WeakReference
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SessionDrawerContentGateTest {
  @Test fun leadingEdgeForwardDragLetsComposeClaimTheMove() {
    val fixture = Fixture()

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_CANCEL), fixture.childEvents)
    assertEquals(0, fixture.disallowInterceptRequests)
  }

  @Test fun scrolledContentKeepsTheGestureEvenAfterReturningToTheEdge() {
    val fixture = Fixture(scrollX = 30)

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.scrollTo(0)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE), fixture.childEvents)
  }

  @Test fun backwardDragReachesTheScroller() {
    val fixture = Fixture()

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = -70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE), fixture.childEvents)
  }

  @Test fun mostlyVerticalDragReachesTheScroller() {
    val fixture = Fixture()

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 20f, dy = 70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE), fixture.childEvents)
  }

  @Test fun rtlMirrorsTheLeadingEdgeAndDragDirection() {
    val fixture = Fixture(rtl = true, scrollX = 320)

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = -70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_CANCEL), fixture.childEvents)
    assertEquals(0, fixture.disallowInterceptRequests)
  }

  @Test fun rtlForwardDragFromTheTrailingEdgeReachesTheScroller() {
    val fixture = Fixture(rtl = true)

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = -70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE), fixture.childEvents)
  }

  @Test fun disabledGateLeavesTheGestureWithTheScroller() {
    val fixture = Fixture(enabled = false)

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE), fixture.childEvents)
  }

  @Test fun tapAndMovementBelowSlopReachTheScroller() {
    val fixture = Fixture()

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 1f)
    fixture.touch(MotionEvent.ACTION_UP, dx = 1f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP), fixture.childEvents)
  }

  private class Fixture(rtl: Boolean = false, scrollX: Int = 0, enabled: Boolean = true) {
    val childEvents = mutableListOf<Int>()
    var disallowInterceptRequests = 0
      private set

    private val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    private val react = BridgeReactContext(activity)
    private val appContext = AppContext(
      object : ModulesProvider {
        override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
      },
      ModuleRegistry(emptyList(), emptyList()),
      WeakReference(react),
    )
    private val gate = SessionDrawerContentGate(activity, appContext).apply {
      this.rtl = rtl
      drawerSwipeEnabled = enabled
    }
    private val scroller = object : HorizontalScrollView(activity) {
      override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        childEvents.add(event.actionMasked)
        return super.dispatchTouchEvent(event)
      }
    }
    private val root = object : FrameLayout(activity) {
      override fun requestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
        if (disallowIntercept) disallowInterceptRequests++
        super.requestDisallowInterceptTouchEvent(disallowIntercept)
      }
    }
    private var time = 10L

    init {
      scroller.addView(View(activity).apply {
        minimumWidth = 640
        isClickable = true
      }, FrameLayout.LayoutParams(640, 240))
      gate.addView(scroller, FrameLayout.LayoutParams(320, 240))
      root.addView(gate, FrameLayout.LayoutParams(320, 240))
      activity.setContentView(root)
      root.measure(View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(240, View.MeasureSpec.EXACTLY))
      root.layout(0, 0, 320, 240)
      scrollTo(scrollX)
      check(scroller.canScrollHorizontally(-1) == (scrollX > 0))
      check(scroller.canScrollHorizontally(1) == (scrollX < 320))
    }

    fun scrollTo(x: Int) = scroller.scrollTo(x, 0)

    fun touch(action: Int, dx: Float = 0f, dy: Float = 0f) {
      val origin = IntArray(2).also(root::getLocationOnScreen)
      val event = MotionEvent.obtain(10L, time, action, origin[0] + 140f + dx, origin[1] + 80f + dy, 0)
      event.offsetLocation(-origin[0].toFloat(), -origin[1].toFloat())
      root.dispatchTouchEvent(event)
      event.recycle()
      time += 16L
    }
  }
}
