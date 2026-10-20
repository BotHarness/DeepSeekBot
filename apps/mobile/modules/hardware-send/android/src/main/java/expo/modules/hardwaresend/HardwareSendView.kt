package expo.modules.hardwaresend

import android.content.Context
import android.os.SystemClock
import android.view.KeyEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

internal fun sendsOnKey(keyCode: Int, meta: Int, enter: Boolean, soft: Boolean): Boolean {
  if (soft) return false
  if (keyCode != KeyEvent.KEYCODE_ENTER && keyCode != KeyEvent.KEYCODE_NUMPAD_ENTER) return false
  if (meta and KeyEvent.META_SHIFT_ON != 0) return false
  if (meta and (KeyEvent.META_CTRL_ON or KeyEvent.META_META_ON) != 0) return true
  return enter && meta and KeyEvent.META_ALT_ON == 0
}

internal fun fromSoftKeyboard(event: KeyEvent): Boolean =
  event.flags and KeyEvent.FLAG_SOFT_KEYBOARD != 0 || event.device?.isVirtual == true

internal class ImeEcho(private val window: Long) {
  private var meta = 0
  private var at = Long.MIN_VALUE

  fun pressed(keyCode: Int, meta: Int, at: Long) {
    if (keyCode != KeyEvent.KEYCODE_ENTER && keyCode != KeyEvent.KEYCODE_NUMPAD_ENTER) return
    this.meta = meta
    this.at = at
  }

  fun echoed(keyCode: Int, now: Long): Int? {
    if (keyCode != KeyEvent.KEYCODE_ENTER && keyCode != KeyEvent.KEYCODE_NUMPAD_ENTER) return null
    if (at == Long.MIN_VALUE || now - at > window) return null
    return meta
  }

  fun clear() {
    at = Long.MIN_VALUE
  }
}

class HardwareSendView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var sending = false
  var enter = false
  private val onSend by EventDispatcher()

  private val echo = ImeEcho(ECHO_WINDOW)

  override fun dispatchKeyEventPreIme(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN && !fromSoftKeyboard(event)) {
      echo.pressed(event.keyCode, event.metaState, event.eventTime)
    }
    return super.dispatchKeyEventPreIme(event)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val soft = fromSoftKeyboard(event)
    val meta = if (soft) echo.echoed(event.keyCode, SystemClock.uptimeMillis()) else event.metaState
    if (!sending || meta == null || !sendsOnKey(event.keyCode, meta, enter, false)) {
      return super.dispatchKeyEvent(event)
    }
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) onSend(mapOf<String, Any>())
    if (event.action == KeyEvent.ACTION_UP) echo.clear()
    return true
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  private companion object {
    const val ECHO_WINDOW = 500L
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit
}
