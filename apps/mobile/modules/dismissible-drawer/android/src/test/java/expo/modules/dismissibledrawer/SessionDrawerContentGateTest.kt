package expo.modules.dismissibledrawer

import android.app.Activity
import android.content.pm.ApplicationInfo
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.widget.EditText
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

  @Test fun composerRetainsHorizontalDragOverLeadingEdgeScroller() {
    val fixture = Fixture()
    val editorEvents = fixture.addComposerOverlay()

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE), editorEvents)
    assertEquals(emptyList<Int>(), fixture.childEvents)
  }

  @Test fun editingInsideAScrollerDoesNotHandTheDragToTheDrawer() {
    val fixture = Fixture()
    fixture.addComposerOverlay(insideScroller = true)

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE), fixture.childEvents)
  }

  @Test fun elevatedTouchableOverlayShieldsTheScroller() {
    val fixture = Fixture()
    val overlayEvents = fixture.addElevatedOverlay()

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE), overlayEvents)
    assertEquals(emptyList<Int>(), fixture.childEvents)
  }

  @Test fun secondPointerCancelsTheDrawerCandidate() {
    val fixture = Fixture()
    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_POINTER_DOWN or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), pointers = 2)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f, pointers = 2)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_MOVE), fixture.childEvents)
  }

  @Test fun forwardDragFromNonOverflowingCodeStillLetsComposeClaimIt() {
    val fixture = Fixture(contentWidth = 320)

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_CANCEL), fixture.childEvents)
    assertEquals(0, fixture.disallowInterceptRequests)
  }

  @Test fun aNewForwardDragCanClaimAfterUpOrCancel() {
    for (terminalAction in listOf(MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL)) {
      val fixture = Fixture()
      fixture.touch(MotionEvent.ACTION_DOWN)
      fixture.touch(MotionEvent.ACTION_MOVE, dx = 1f)
      fixture.touch(terminalAction, dx = 1f)

      fixture.touch(MotionEvent.ACTION_DOWN)
      fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f)

      assertEquals(
        listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE, terminalAction, MotionEvent.ACTION_DOWN, MotionEvent.ACTION_CANCEL),
        fixture.childEvents,
      )
    }
  }

  @Test fun aScrollerThatMovesAwayFromItsEdgeBeforeSlopKeepsTheDrag() {
    val fixture = Fixture()
    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 1f)
    fixture.scrollTo(30)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = 70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE, MotionEvent.ACTION_MOVE), fixture.childEvents)
  }

  @Test fun nativeLayoutDirectionCanMirrorTheDrawerWithoutTheJsFlag() {
    val fixture = Fixture(nativeRtl = true, scrollX = 320)

    fixture.touch(MotionEvent.ACTION_DOWN)
    fixture.touch(MotionEvent.ACTION_MOVE, dx = -70f)

    assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_CANCEL), fixture.childEvents)
  }

  private class Fixture(
    rtl: Boolean = false,
    scrollX: Int = 0,
    enabled: Boolean = true,
    contentWidth: Int = 640,
    nativeRtl: Boolean = false,
  ) {
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
    private var downTime = time
    private val content = FrameLayout(activity)
    private val scrollerContent = FrameLayout(activity).apply {
      minimumWidth = contentWidth
      isClickable = true
    }

    init {
      if (nativeRtl) {
        val info = activity.applicationInfo
        info.flags = info.flags or ApplicationInfo.FLAG_SUPPORTS_RTL
        gate.layoutDirection = View.LAYOUT_DIRECTION_RTL
        scroller.layoutDirection = View.LAYOUT_DIRECTION_LTR
      }
      scroller.addView(scrollerContent, FrameLayout.LayoutParams(contentWidth, 240))
      content.addView(scroller, FrameLayout.LayoutParams(320, 240))
      gate.addView(content, FrameLayout.LayoutParams(320, 240))
      root.addView(gate, FrameLayout.LayoutParams(320, 240))
      activity.setContentView(root)
      root.measure(View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(240, View.MeasureSpec.EXACTLY))
      root.layout(0, 0, 320, 240)
      scrollTo(scrollX)
      check(scroller.canScrollHorizontally(-1) == (scrollX > 0))
      check(scroller.canScrollHorizontally(1) == (scrollX < contentWidth - 320))
    }

    fun addComposerOverlay(insideScroller: Boolean = false): List<Int> {
      val events = mutableListOf<Int>()
      val editor = object : EditText(activity) {
        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
          events.add(event.actionMasked)
          return true
        }
      }
      val parent = if (insideScroller) scrollerContent else content
      parent.addView(editor, FrameLayout.LayoutParams(320, 120))
      editor.layout(0, 0, 320, 120)
      return events
    }

    fun addElevatedOverlay(): List<Int> {
      val events = mutableListOf<Int>()
      val overlay = object : View(activity) {
        override fun onTouchEvent(event: MotionEvent): Boolean {
          events.add(event.actionMasked)
          return true
        }
      }
      overlay.elevation = 8f
      content.addView(overlay, 0, FrameLayout.LayoutParams(320, 120))
      overlay.layout(0, 0, 320, 120)
      return events
    }

    fun scrollTo(x: Int) = scroller.scrollTo(x, 0)

    fun touch(action: Int, dx: Float = 0f, dy: Float = 0f, pointers: Int = 1) {
      if (action == MotionEvent.ACTION_DOWN) downTime = time
      val origin = IntArray(2).also(root::getLocationOnScreen)
      val properties = Array(pointers) { index ->
        MotionEvent.PointerProperties().apply {
          id = index
          toolType = MotionEvent.TOOL_TYPE_FINGER
        }
      }
      val positions = Array(pointers) { index ->
        MotionEvent.PointerCoords().apply {
          x = origin[0] + 140f + dx + index * 40f
          y = origin[1] + 80f + dy
          pressure = 1f
          size = 1f
        }
      }
      val event = MotionEvent.obtain(
        downTime, time, action, pointers, properties, positions, 0, 0, 1f, 1f, 0, 0,
        InputDevice.SOURCE_TOUCHSCREEN, 0,
      )
      event.offsetLocation(-origin[0].toFloat(), -origin[1].toFloat())
      root.dispatchTouchEvent(event)
      event.recycle()
      time += 16L
    }
  }
}
