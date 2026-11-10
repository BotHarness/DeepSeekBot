package expo.modules.latestanchor

import android.app.Activity
import android.view.View
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.bridge.BridgeReactContext
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
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], shadows = [TargetEventBridge::class], instrumentedPackages = ["expo.modules.kotlin.viewevent"])
class ChatRecyclerViewTest {
  @Test fun longHistoryUsesBoundedNativeHoldersAndStableRowIdentities() {
    val controller = Robolectric.buildActivity(Activity::class.java).setup().visible()
    val activity = controller.get()
    val react = BridgeReactContext(activity)
    val modules = object : ModulesProvider { override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap() }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val list = ChatRecyclerView(react, app)
    activity.setContentView(list)
    list.setRows((0..9999).map { "row-$it" })
    list.measure(View.MeasureSpec.makeMeasureSpec(300, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(500, View.MeasureSpec.EXACTLY))
    list.layout(0, 0, 300, 500)
    val recycler = list.getChildAt(0) as RecyclerView
    assertTrue(recycler.childCount in 1..30)
    val identity = recycler.adapter!!.getItemId(5)
    list.setRows(listOf("new") + (0..9999).map { "row-$it" })
    assertEquals(identity, recycler.adapter!!.getItemId(6))
    list.scrollToIndex(5000, 0.5)
    list.layout(0, 0, 300, 500)
    assertTrue(recycler.childCount <= 30)
    controller.pause().stop().destroy()
  }
}
