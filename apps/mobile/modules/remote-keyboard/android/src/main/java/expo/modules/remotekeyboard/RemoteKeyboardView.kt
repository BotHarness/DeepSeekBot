package expo.modules.remotekeyboard

import android.content.Context
import android.text.InputType
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class RemoteKeyboardView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var session = ""
  var opened = false
  var accepting = false
  private var appliedSession = ""
  private var appliedOpen = false
  private var suspended = false
  private var imeVisible = false
  private var connection: RemoteInputConnection? = null
  private val onInput by EventDispatcher()
  private val onDismissed by EventDispatcher()
  private val manager get() = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager

  init {
    isFocusable = false
    isFocusableInTouchMode = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
      val visible = insets.isVisible(WindowInsetsCompat.Type.ime())
      if (imeVisible && !visible && appliedOpen) suspendInput()
      imeVisible = visible
      insets
    }
  }

  fun sync() {
    val changed = appliedSession != session || appliedOpen != opened
    if (!accepting) connection?.discard()
    if (!changed) return
    closeInput()
    appliedSession = session
    appliedOpen = opened
    suspended = false
    if (opened && session.isNotEmpty() && isAttachedToWindow) showInput()
  }

  private fun showInput() {
    val expected = appliedSession
    post {
      if (!isAttachedToWindow || !appliedOpen || suspended || appliedSession != expected) return@post
      isFocusable = true
      isFocusableInTouchMode = true
      if (requestFocus()) manager.showSoftInput(this, InputMethodManager.SHOW_IMPLICIT)
    }
  }

  private fun closeInput() {
    connection?.closeConnection()
    connection = null
    val focused = hasFocus()
    isFocusable = false
    isFocusableInTouchMode = false
    if (focused) {
      manager.hideSoftInputFromWindow(windowToken, 0)
      clearFocus()
    }
    imeVisible = false
  }

  fun suspendInput() {
    if (suspended) return
    suspended = true
    closeInput()
    if (appliedOpen) onDismissed(mapOf("session" to appliedSession))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (appliedOpen && !suspended) showInput()
  }

  override fun onDetachedFromWindow() {
    closeInput()
    super.onDetachedFromWindow()
  }

  override fun onCheckIsTextEditor(): Boolean = appliedOpen && !suspended

  override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
    if (!appliedOpen || suspended || appliedSession.isEmpty()) return null
    connection?.closeConnection()
    outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
    outAttrs.imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN or EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING
    outAttrs.initialSelStart = 0
    outAttrs.initialSelEnd = 0
    val expected = appliedSession
    return RemoteInputConnection(
      this,
      { appliedOpen && !suspended && accepting && hasFocus() && appliedSession == expected },
      { input -> onInput(mapOf("session" to expected, "input" to input)) },
    ).also { connection = it }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit
}
