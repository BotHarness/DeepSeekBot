package expo.modules.latestanchor

import android.app.Activity
import android.graphics.Rect
import android.os.Looper
import android.view.View
import android.widget.FrameLayout
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.uimanager.TouchTargetHelper
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import java.lang.ref.WeakReference
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], shadows = [TargetEventBridge::class], instrumentedPackages = ["expo.modules.kotlin.viewevent"])
class RecyclerTouchTargetTest {
  @Test fun reactMessageReceivesTouchesThroughAnEmptyAvatarLayer() {
    val controller = Robolectric.buildActivity(Activity::class.java).setup().visible()
    val activity = controller.get()
    val react = BridgeReactContext(activity)
    val modules = object : ModulesProvider { override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap() }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val list = ChatRecyclerView(react, app).apply { id = 10 }
    val cell = ChatRecyclerCell(react, app).apply { id = 20; rowKey = "rich-message" }
    val target = FrameLayout(react).apply { id = 30 }
    cell.addView(target)
    list.register(cell, 0)
    list.setRows(listOf("rich-message"))
    list.measureCell("rich-message", 100.0)
    activity.setContentView(list)
    list.measure(View.MeasureSpec.makeMeasureSpec(300, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(500, View.MeasureSpec.EXACTLY))
    list.layout(0, 0, 300, 500)
    shadowOf(Looper.getMainLooper()).idle()
    target.layout(0, 0, cell.width, cell.height)
    val rect = Rect()
    assertTrue("React row must be visible before hit testing", target.getGlobalVisibleRect(rect))
    val origin = IntArray(2)
    list.getLocationOnScreen(origin)
    val hit = TouchTargetHelper.findTargetTagAndCoordinatesForTouch(
      rect.exactCenterX() - origin[0], rect.exactCenterY() - origin[1], list, FloatArray(2), null,
    )
    assertEquals("Native overlays must not replace the React message touch target", target.id, hit)
    val avatar = FrameLayout(react).apply { id = 40 }
    (list.getChildAt(1) as FrameLayout).addView(avatar)
    avatar.layout(0, 0, 32, 32)
    assertEquals("Speaker avatars must remain touchable", avatar.id,
      TouchTargetHelper.findTargetTagAndCoordinatesForTouch(16f, 16f, list, FloatArray(2), null))
    controller.pause().stop().destroy()
  }
}
