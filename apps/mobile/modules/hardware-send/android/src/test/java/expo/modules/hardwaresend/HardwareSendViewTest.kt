package expo.modules.hardwaresend

import android.app.Activity
import android.os.Looper
import android.os.SystemClock
import android.text.InputType
import android.view.InputDevice
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import com.facebook.react.bridge.BridgeReactContext
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.viewevent.ViewEvent
import java.lang.ref.WeakReference
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.annotation.RealObject
import org.robolectric.util.ReflectionHelpers

@Implements(ViewEvent::class, isInAndroidSdk = false)
class SendEventBridge {
  @RealObject private lateinit var event: ViewEvent<*>

  @Implementation
  fun invoke(payload: Any?) {
    if (ReflectionHelpers.getField<String>(event, "name") == "onSend") {
      sent.add(ReflectionHelpers.getField<View>(event, "view"))
    }
  }

  companion object {
    val sent = mutableListOf<View>()
  }
}

@RunWith(RobolectricTestRunner::class)
@Config(
  sdk = [35],
  shadows = [SendEventBridge::class],
  instrumentedPackages = ["expo.modules.kotlin.viewevent"],
)
class HardwareSendViewTest {
  private val controllers = mutableListOf<ActivityController<Activity>>()

  @Before fun resetEvents() {
    SendEventBridge.sent.clear()
  }

  @After fun closeActivities() {
    controllers.forEach { it.pause().stop().destroy() }
  }

  private fun editor(): Pair<HardwareSendView, EditText> {
    val controller = Robolectric.buildActivity(Activity::class.java).setup().visible()
    controllers.add(controller)
    val activity = controller.get()
    val react = BridgeReactContext(activity)
    val provider = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(provider, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val view = HardwareSendView(react, app).apply {
      sending = true
      enter = true
    }
    val field = EditText(activity).apply {
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
    }
    view.addView(field)
    activity.setContentView(view)
    view.layout(0, 0, 600, 300)
    field.layout(0, 0, 600, 100)
    assertTrue(field.requestFocus())
    shadowOf(Looper.getMainLooper()).idle()
    assertTrue(field.hasFocus())
    return view to field
  }

  private fun enter(soft: Boolean = false): KeyEvent {
    val at = SystemClock.uptimeMillis()
    return KeyEvent(
      at, at, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER, 0, 0, 42, 0,
      if (soft) KeyEvent.FLAG_SOFT_KEYBOARD else 0,
      InputDevice.SOURCE_KEYBOARD,
    )
  }

  private fun release(view: HardwareSendView, down: KeyEvent) {
    val up = KeyEvent.changeAction(down, KeyEvent.ACTION_UP)
    view.dispatchKeyEventPreIme(up)
    view.dispatchKeyEvent(up)
  }

  @Test fun ordinaryHardwareEnterEmitsOneSendThroughTheView() {
    val (view, field) = editor()
    field.setText("Ready")
    val down = enter()
    view.dispatchKeyEventPreIme(down)
    view.dispatchKeyEvent(down)
    release(view, down)
    assertEquals(1, SendEventBridge.sent.count { it === view })
    assertEquals("Ready", field.text.toString())
  }

  @Test fun compositionConfirmationNewlineDoesNotSendAfterTheInputMethodClearsItsSpan() {
    val (view, field) = editor()
    val input = field.onCreateInputConnection(EditorInfo())!!
    assertTrue(input.setComposingText("ni", 1))
    assertTrue(BaseInputConnection.getComposingSpanStart(field.text) >= 0)
    val down = enter()
    view.dispatchKeyEventPreIme(down)
    assertTrue(input.commitText("你", 1))
    assertEquals(-1, BaseInputConnection.getComposingSpanStart(field.text))
    assertTrue(input.commitText("\n", 1))
    assertEquals(0, SendEventBridge.sent.count { it === view })
    assertEquals("你\n", field.text.toString())
    release(view, down)
    val next = enter()
    view.dispatchKeyEventPreIme(next)
    view.dispatchKeyEvent(next)
    release(view, next)
    assertEquals(1, SendEventBridge.sent.count { it === view })
  }

  @Test fun compositionConfirmationSoftEchoDoesNotSendAfterTheInputMethodClearsItsSpan() {
    val (view, field) = editor()
    val input = field.onCreateInputConnection(EditorInfo())!!
    assertTrue(input.setComposingText("kana", 1))
    val down = enter()
    view.dispatchKeyEventPreIme(down)
    assertTrue(input.commitText("かな", 1))
    assertEquals(-1, BaseInputConnection.getComposingSpanStart(field.text))
    view.dispatchKeyEvent(enter(soft = true))
    assertEquals(0, SendEventBridge.sent.count { it === view })
  }

  @Test fun aHardwareKeyFromThePreviousFieldCannotSendTheNewFieldsNewline() {
    val (view, first) = editor()
    val down = enter()
    view.dispatchKeyEventPreIme(down)
    val second = EditText(first.context).apply {
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
    }
    view.addView(second)
    second.layout(0, 100, 600, 200)
    assertTrue(second.requestFocus())
    shadowOf(Looper.getMainLooper()).idle()
    val input = second.onCreateInputConnection(EditorInfo())!!
    assertTrue(input.commitText("\n", 1))
    assertEquals(0, SendEventBridge.sent.count { it === view })
    assertEquals("\n", second.text.toString())
  }
}
