package expo.modules.dismissibledrawer

import android.app.Activity
import android.content.Context
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import androidx.activity.BackEventCompat
import androidx.coordinatorlayout.widget.CoordinatorLayout
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ThemedReactContext
import com.google.android.material.sidesheet.SideSheetBehavior
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import java.lang.ref.WeakReference
import java.time.Duration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

private class DetachedReactContext(context: Context) : BridgeReactContext(context) {
  @Deprecated("Matches the overridden member")
  override fun isBridgeless(): Boolean = true

  override fun getNativeModules(): Collection<NativeModule> = emptyList()
}

private class ReactManagedParent(context: Context) : ViewGroup(context) {
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) =
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class EndSheetBackTest {
  private val width = 1000
  private val panelWidth = 300

  private fun sheet(): EndSheetView {
    val context = RuntimeEnvironment.getApplication()
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    val parent = ReactManagedParent(activity)
    activity.setContentView(parent)
    val react = DetachedReactContext(context)
    val modules = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    return EndSheetView(ThemedReactContext(react, activity, null, -1), app).apply {
      this.panelWidth = this@EndSheetBackTest.panelWidth / resources.displayMetrics.density
      addSlot(View(context), 0)
      addSlot(View(context), 1)
      parent.addView(this)
      layout(0, 0, this@EndSheetBackTest.width, 2000)
      settle()
    }
  }

  private fun settle() = shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2))

  private fun EndSheetView.panel(): View = slotAt(1).parent as View

  @Suppress("UNCHECKED_CAST")
  private fun EndSheetView.behavior(): SideSheetBehavior<View> =
    (panel().layoutParams as CoordinatorLayout.LayoutParams).behavior as SideSheetBehavior<View>

  @Test fun predictiveBackMovesTheHiddenPanelOutOfReactNativeHitTesting() {
    val sheet = sheet()
    sheet.setOpen(true)
    settle()
    assertEquals(width - panelWidth, screenBounds(sheet.panel()).left.toInt())

    val behavior = sheet.behavior()
    behavior.startBackProgress(BackEventCompat(500f, 1000f, 0f, BackEventCompat.EDGE_RIGHT))
    behavior.updateBackProgress(BackEventCompat(400f, 1000f, 0.5f, BackEventCompat.EDGE_RIGHT))
    behavior.handleBackInvoked()
    settle()

    assertEquals(SideSheetBehavior.STATE_HIDDEN, behavior.state)
    assertTrue(screenBounds(sheet.panel()).left >= width)

    sheet.setOpen(true)
    settle()
    assertEquals(width - panelWidth, screenBounds(sheet.panel()).left.toInt())
  }

  @Test fun closingWithoutPredictiveBackAlsoLeavesNoPanelOnScreen() {
    val sheet = sheet()
    sheet.setOpen(true)
    settle()
    sheet.setOpen(false)
    settle()
    assertTrue(screenBounds(sheet.panel()).left >= width)
  }
}
