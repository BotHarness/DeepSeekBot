package expo.modules.remotekeyboard

import android.app.Activity
import android.view.View
import android.view.inputmethod.EditorInfo
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
import android.os.Looper

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RemoteKeyboardViewTest {
  @Test fun playbackPropRefreshKeepsFocusAndOldConnectionsCannotCrossSessions() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
    val react = BridgeReactContext(activity)
    val provider = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(provider, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val view = RemoteKeyboardView(activity, app)
    activity.setContentView(view)
    var gained = 0
    var lost = 0
    view.onFocusChangeListener = View.OnFocusChangeListener { _, focused ->
      if (focused) gained++ else lost++
    }
    view.session = "first"
    view.opened = true
    view.accepting = true
    view.sync()
    shadowOf(Looper.getMainLooper()).idle()
    assertTrue(view.hasFocus())
    val connection = view.onCreateInputConnection(EditorInfo())!!
    repeat(40) {
      view.accepting = it % 2 == 0
      view.sync()
      view.layout(0, 0, 1, 1)
    }
    assertEquals(1, gained)
    assertEquals(0, lost)
    view.opened = false
    view.sync()
    assertFalse(connection.commitText("late", 1))
    assertEquals(1, lost)
    shadowOf(Looper.getMainLooper()).idle()
    assertFalse(view.hasFocus())
    assertFalse(view.isFocusable)
    assertEquals(1, gained)
    view.session = "second"
    view.opened = true
    view.accepting = true
    view.sync()
    shadowOf(Looper.getMainLooper()).idle()
    assertTrue(view.hasFocus())
    assertFalse(connection.commitText("previous", 1))
    assertEquals(2, gained)
  }
}
