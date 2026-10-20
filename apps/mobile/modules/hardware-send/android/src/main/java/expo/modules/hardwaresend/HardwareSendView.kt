package expo.modules.hardwaresend

import android.content.Context
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

class HardwareSendView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var sending = false
  var enter = false
  private val onSend by EventDispatcher()

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (!sending || !sendsOnKey(event.keyCode, event.metaState, enter, fromSoftKeyboard(event))) {
      return super.dispatchKeyEvent(event)
    }
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) onSend(mapOf<String, Any>())
    return true
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit
}
