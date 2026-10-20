package expo.modules.hardwaresend

import android.content.Context
import android.os.SystemClock
import android.text.Editable
import android.text.TextWatcher
import android.view.KeyEvent
import android.view.View
import android.view.ViewTreeObserver
import android.widget.EditText
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

internal fun insertedNewline(text: CharSequence, start: Int, before: Int, count: Int): Boolean =
  before == 0 && count == 1 && start < text.length && text[start] == '\n'

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

  private var watched: EditText? = null
  private var newline = -1

  private val watcher = object : TextWatcher {
    override fun beforeTextChanged(text: CharSequence, start: Int, count: Int, after: Int) = Unit

    override fun onTextChanged(text: CharSequence, start: Int, before: Int, count: Int) {
      if (!sending || !insertedNewline(text, start, before, count)) return
      val meta = echo.echoed(KeyEvent.KEYCODE_ENTER, SystemClock.uptimeMillis()) ?: return
      if (sendsOnKey(KeyEvent.KEYCODE_ENTER, meta, enter, false)) newline = start
    }

    override fun afterTextChanged(text: Editable) {
      val at = newline
      if (at < 0) return
      newline = -1
      echo.clear()
      if (at < text.length && text[at] == '\n') text.delete(at, at + 1)
      onSend(mapOf<String, Any>())
    }
  }

  private val focus = ViewTreeObserver.OnGlobalFocusChangeListener { _, next -> watch(next) }

  private fun watch(next: View?) {
    val field = (next as? EditText)?.takeIf { isAncestorOf(it) }
    if (field === watched) return
    watched?.removeTextChangedListener(watcher)
    watched = field
    field?.addTextChangedListener(watcher)
  }

  private fun isAncestorOf(view: View): Boolean {
    var parent = view.parent
    while (parent != null) {
      if (parent === this) return true
      parent = parent.parent
    }
    return false
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnGlobalFocusChangeListener(focus)
    watch(findFocus())
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnGlobalFocusChangeListener(focus)
    watch(null)
    super.onDetachedFromWindow()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  private companion object {
    const val ECHO_WINDOW = 500L
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit
}
