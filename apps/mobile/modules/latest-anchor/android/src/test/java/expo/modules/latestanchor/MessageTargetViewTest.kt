package expo.modules.latestanchor

import android.app.Activity
import android.graphics.Rect
import android.view.View
import android.widget.FrameLayout
import android.widget.ScrollView
import com.facebook.react.bridge.BridgeReactContext
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.viewevent.ViewEvent
import java.lang.ref.WeakReference
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implements
import org.robolectric.annotation.Implementation

@Implements(ViewEvent::class, isInAndroidSdk = false)
class TargetEventBridge {
  @Implementation fun invoke(payload: Any?) { events.add(payload) }
  companion object { val events = mutableListOf<Any?>() }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], shadows = [TargetEventBridge::class], instrumentedPackages = ["expo.modules.kotlin.viewevent"])
class MessageTargetViewTest {
  @Test fun normalTargetUsesActualBoundsAndAcknowledgesOnce() = exercise(false)
  @Test fun invertedTargetUsesActualBoundsAndAcknowledgesOnce() = exercise(true)
  private fun exercise(inverted: Boolean) {
    TargetEventBridge.events.clear()
    val controller = Robolectric.buildActivity(Activity::class.java).setup().visible()
    val activity = controller.get()
    val react = BridgeReactContext(activity)
    val modules = object : ModulesProvider { override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap() }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val target = MessageTargetView(react, app).apply { active = true; request = "one" }
    val content = FrameLayout(activity).apply { addView(target) }
    val scroll = object : ScrollView(activity) {
      override fun getWindowVisibleDisplayFrame(outRect: Rect) { outRect.set(-100000, -100000, 100000, 100000) }
    }.apply { addView(content) }
    activity.setContentView(scroll)
    scroll.layout(0, 0, 300, 500)
    content.layout(0, 0, 300, 3000)
    target.layout(0, 1500, 300, 1600)
    if (inverted) { scroll.scaleY = -1f; target.scaleY = -1f }
    target.position()
    assertEquals(1300, scroll.scrollY)
    target.position(); target.position(); target.position()
    assertEquals(listOf(mapOf("request" to "one")), TargetEventBridge.events)
    target.request = "two"
    target.active = false
    scroll.scrollTo(0, 0)
    target.position()
    assertEquals(0, scroll.scrollY)
    assertEquals(1, TargetEventBridge.events.size)
    content.removeView(target)
    target.active = true
    target.position()
    assertEquals(0, scroll.scrollY)
    controller.pause().stop().destroy()
  }
}
