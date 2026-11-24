package expo.modules.latestanchor

import android.app.Activity
import android.os.Looper
import android.view.View
import android.widget.FrameLayout
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
import org.robolectric.Shadows.shadowOf
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
    list.setTop(72.0)
    list.setBottom(80.0)
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(list.height, recycler.height)
    assertTrue(recycler.height > recycler.paddingTop + recycler.paddingBottom)
    assertTrue(recycler.childCount in 1..30)
    val identity = recycler.adapter!!.getItemId(5)
    var full = 0
    val inserted = mutableListOf<Pair<Int, Int>>()
    recycler.adapter!!.registerAdapterDataObserver(object : RecyclerView.AdapterDataObserver() {
      override fun onChanged() { full++ }
      override fun onItemRangeInserted(start: Int, count: Int) { inserted += start to count }
    })
    list.setRows(listOf("new") + (0..9999).map { "row-$it" })
    assertEquals(identity, recycler.adapter!!.getItemId(6))
    list.setRows(listOf("new") + (0..10029).map { "row-$it" })
    assertEquals(0, full)
    assertEquals(listOf(0 to 1, 10001 to 30), inserted)
    list.scrollToIndex(5000, 0.5)
    list.layout(0, 0, 300, 500)
    assertTrue(recycler.childCount <= 30)
    controller.pause().stop().destroy()
  }

  @Test fun cellRegisteredAfterNativeRelayoutIsBound() {
    val controller = Robolectric.buildActivity(Activity::class.java).setup().visible()
    val activity = controller.get()
    val react = BridgeReactContext(activity)
    val modules = object : ModulesProvider { override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap() }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    // Like ReactRootView: the host never lays out its children; Fabric sets their frames.
    val root = object : FrameLayout(activity) { override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit }
    val list = ChatRecyclerView(react, app)
    root.addView(list)
    activity.setContentView(root)
    val looper = shadowOf(Looper.getMainLooper())
    list.setRows(listOf("header", "input", "footer"))
    list.measure(View.MeasureSpec.makeMeasureSpec(300, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(500, View.MeasureSpec.EXACTLY))
    list.layout(0, 0, 300, 500)
    fun cell(key: String) = ChatRecyclerCell(react, app).apply { rowKey = key }
    val header = cell("header")
    list.register(header, 0)
    list.register(cell("input"), 1)
    list.register(cell("footer"), 2)
    looper.idle()
    // The first send: React unmounts the window's tail, the rows grow, then React mounts it again.
    list.unregister(list.cells[2])
    list.unregister(list.cells[1])
    list.register(cell("turn-end"), 1)
    list.register(cell("reply"), 2)
    list.setRows(listOf("header", "turn-end", "reply", "input", "footer"))
    looper.idle()
    val input = cell("input")
    list.register(input, 3)
    list.register(cell("footer"), 4)
    looper.idle()
    val recycler = list.getChildAt(0) as RecyclerView
    assertSame(recycler, input.parent?.parent)
    controller.pause().stop().destroy()
  }
}
