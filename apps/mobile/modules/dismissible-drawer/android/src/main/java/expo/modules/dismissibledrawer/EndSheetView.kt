package expo.modules.dismissibledrawer

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Build
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.activity.BackEventCompat
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.sidesheet.SideSheetBehavior
import com.google.android.material.sidesheet.SideSheetCallback
import com.reactnativepagerview.ComposePagerView
import com.facebook.react.uimanager.events.NativeGestureUtil
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.max

internal fun startsEndDrag(dx: Float, dy: Float, slop: Int): Boolean =
  dx < -slop && abs(dx) > abs(dy) * 2

/** One native side sheet; its RN slots keep their identity throughout drag and settle. */
class EndSheetView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val materialContext = ContextThemeWrapper(context, com.google.android.material.R.style.Theme_Material3_DayNight_NoActionBar)
  private val coordinator = CoordinatorLayout(materialContext)
  private val content = FrameLayout(context)
  private val panel = object : FrameLayout(materialContext) {
    override fun setTranslationX(value: Float) {
      super.setTranslationX(value)
      if (!fullWidth && width > 0) {
        updateScrim((coordinator.width - left - value) / width)
      }
    }
  }
  private val scrim = View(context)
  private val slots = mutableListOf<View>()
  private val onOpenChange by EventDispatcher()
  private val onOpening by EventDispatcher()
  private var requestedOpen = false
  private var active = true
  private var openingReported = false
  private var imeVisible = false
  private var backCallback: OnBackInvokedCallback? = null
  var gesturesEnabled = true
  var fullWidth = false
  var panelWidth = 0f
  var sheetColor = Color.TRANSPARENT
  var scrimColor = Color.TRANSPARENT
    set(value) { field = value; scrim.setBackgroundColor(value) }

  private val behavior = object : SideSheetBehavior<FrameLayout>(materialContext, null) {
    private var down: MotionEvent? = null
    private var eligible = false
    private var nativeDragging = false
    override fun onInterceptTouchEvent(parent: CoordinatorLayout, child: FrameLayout, event: MotionEvent): Boolean {
      val intercepted = interceptSheet(parent, child, event)
      if (intercepted && !nativeDragging) {
        NativeGestureUtil.notifyNativeGestureStarted(this@EndSheetView, event)
        nativeDragging = true
      }
      return intercepted
    }
    override fun onTouchEvent(parent: CoordinatorLayout, child: FrameLayout, event: MotionEvent): Boolean {
      val handled = super.onTouchEvent(parent, child, event)
      if (nativeDragging && (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL)) {
        NativeGestureUtil.notifyNativeGestureEnded(this@EndSheetView, event)
        nativeDragging = false
      }
      return handled
    }
    private fun interceptSheet(parent: CoordinatorLayout, child: FrameLayout, event: MotionEvent): Boolean {
      if (event.actionMasked == MotionEvent.ACTION_DOWN) {
        down?.recycle()
        down = MotionEvent.obtain(event)
        val edges = ViewCompat.getRootWindowInsets(this@EndSheetView)?.getInsets(WindowInsetsCompat.Type.systemGestures())
        val reserve = 24 * resources.displayMetrics.density
        eligible = active && gesturesEnabled && state == STATE_HIDDEN &&
          event.x > max(reserve, (edges?.left ?: 0).toFloat()) &&
          event.x < parent.width - max(reserve, (edges?.right ?: 0).toFloat()) &&
          !horizontalTarget(content, event.rawX, event.rawY)
      }
      val start = down
      if (event.pointerCount != 1 || (start != null && event.eventTime - start.eventTime > ViewConfiguration.getLongPressTimeout())) eligible = false
      if (eligible && start != null && event.actionMasked == MotionEvent.ACTION_MOVE) {
        val dx = event.x - start.x
        val dy = event.y - start.y
        val slop = ViewConfiguration.get(context).scaledTouchSlop
        if (abs(dy) > slop && abs(dy) >= abs(dx)) eligible = false
        if (startsEndDrag(dx, dy, slop)) {
          eligible = false
          // Predictive Back hides by translation and requests layout afterward. RN may
          // defer that layout; restore Material's hidden offset before exposing the panel.
          super.onLayoutChild(parent, child, ViewCompat.getLayoutDirection(parent))
          child.visibility = VISIBLE
          reportOpening()
          val cancel = MotionEvent.obtain(start).apply { action = MotionEvent.ACTION_CANCEL }
          super.onInterceptTouchEvent(parent, child, cancel)
          cancel.recycle()
          super.onInterceptTouchEvent(parent, child, start)
          super.onTouchEvent(parent, child, start)
          super.onTouchEvent(parent, child, event)
          return true
        }
      }
      // A hidden sheet must not set Material's ignoreEvents flag before our direction gate.
      return if (state == STATE_HIDDEN) false else super.onInterceptTouchEvent(parent, child, event)
    }
  }

  init {
    ViewCompat.setOnApplyWindowInsetsListener(coordinator) { _, insets ->
      imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
      syncBack()
      insets
    }
    addView(coordinator, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    coordinator.addView(content, CoordinatorLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    scrim.visibility = INVISIBLE
    scrim.isEnabled = false
    scrim.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    scrim.setOnClickListener { setOpen(false) }
    coordinator.addView(scrim, CoordinatorLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    coordinator.addView(panel, CoordinatorLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
      gravity = Gravity.RIGHT
      behavior = this@EndSheetView.behavior
    })
    behavior.addCallback(object : SideSheetCallback() {
      override fun onSlide(sheet: View, slideOffset: Float) {
        if (slideOffset > 0) reportOpening()
        updateScrim(slideOffset)
        content.translationX = if (fullWidth) -panel.width * slideOffset else 0f
      }
      override fun onStateChanged(sheet: View, state: Int) {
        if (state != SideSheetBehavior.STATE_EXPANDED && state != SideSheetBehavior.STATE_HIDDEN) return
        val open = state == SideSheetBehavior.STATE_EXPANDED
        content.translationX = if (fullWidth && open) -panel.width.toFloat() else 0f
        updateScrim(if (open) 1f else 0f)
        requestedOpen = open
        if (!open) openingReported = false
        content.importantForAccessibility = if (open) IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS else IMPORTANT_FOR_ACCESSIBILITY_AUTO
        panel.importantForAccessibility = if (open) IMPORTANT_FOR_ACCESSIBILITY_AUTO else IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        // Once a profile is open its pager owns horizontal dragging.
        behavior.isDraggable = !fullWidth || !open
        syncBack()
        onOpenChange(mapOf("open" to open))
      }
    })
  }

  private fun updateScrim(offset: Float) {
    val visible = !fullWidth && offset > 0
    scrim.visibility = if (visible) VISIBLE else INVISIBLE
    // RN hit testing ignores Android visibility; disabled leaf views are skipped.
    scrim.isEnabled = visible
    scrim.alpha = offset.coerceIn(0f, 1f)
  }

  private fun reportOpening() {
    if (!openingReported) {
      openingReported = true
      onOpening(emptyMap<String, Any>())
    }
  }
  fun setOpen(value: Boolean) {
    // A settled native gesture is echoed through the JS prop. Reapplying HIDDEN
    // after predictive Back would start a second slide from the old layout position.
    if (drawerCommand(value, requestedOpen) == DrawerCommand.None) return
    requestedOpen = value
    if (value) reportOpening()
    post { behavior.state = if (requestedOpen) SideSheetBehavior.STATE_EXPANDED else SideSheetBehavior.STATE_HIDDEN }
  }
  fun setActive(value: Boolean) { active = value; syncBack() }

  val slotCount: Int get() = slots.size
  fun slotAt(index: Int): View = slots[index]
  fun addSlot(child: View, index: Int) {
    slots.add(index, child)
    (if (index == 0) content else panel).addView(child, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    requestLayout()
  }
  fun removeSlot(child: View) { (child.parent as? ViewGroup)?.removeView(child); slots.remove(child) }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val w = right - left
    val h = bottom - top
    val params = panel.layoutParams as CoordinatorLayout.LayoutParams
    val panelSize = if (fullWidth) w else (panelWidth * resources.displayMetrics.density).toInt().coerceIn(1, max(1, w))
    if (params.width != panelSize) {
      params.width = panelSize
      panel.layoutParams = params
    }
    coordinator.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
    coordinator.layout(0, 0, w, h)
    panel.backgroundTintList = ColorStateList.valueOf(sheetColor)
    scrim.setBackgroundColor(scrimColor)
    if (behavior.state == SideSheetBehavior.STATE_EXPANDED) {
      updateScrim(1f)
      content.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
  }

  override fun onAttachedToWindow() { super.onAttachedToWindow(); post { syncBack() } }
  override fun onDetachedFromWindow() { stopBack(); super.onDetachedFromWindow() }
  private fun stopBack() {
    if (Build.VERSION.SDK_INT >= 33) backCallback?.let { findOnBackInvokedDispatcher()?.unregisterOnBackInvokedCallback(it) }
    backCallback = null
  }
  private fun syncBack() {
    if (Build.VERSION.SDK_INT < 33) return
    if (!active || !requestedOpen || imeVisible || !isAttachedToWindow) { stopBack(); return }
    if (backCallback != null) return
    val callback = if (Build.VERSION.SDK_INT >= 34) object : OnBackAnimationCallback {
      override fun onBackStarted(event: BackEvent) {
        if (fullWidth) content.translationX = 0f
        behavior.startBackProgress(BackEventCompat(event))
      }
      override fun onBackProgressed(event: BackEvent) = behavior.updateBackProgress(BackEventCompat(event))
      override fun onBackCancelled() {
        behavior.cancelBackProgress()
        if (fullWidth) content.translationX = -panel.width.toFloat()
      }
      override fun onBackInvoked() = behavior.handleBackInvoked()
    } else OnBackInvokedCallback { setOpen(false) }
    findOnBackInvokedDispatcher()?.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_OVERLAY, callback)
    backCallback = callback
  }
}

private fun horizontalTarget(view: View, x: Float, y: Float): Boolean {
  if (!view.isShown) return false
  val at = IntArray(2)
  view.getLocationOnScreen(at)
  if (x < at[0] || x >= at[0] + view.width || y < at[1] || y >= at[1] + view.height) return false
  if (view is EditText || view.canScrollHorizontally(-1) || view.canScrollHorizontally(1)) return true
  // The pager owns enabled/disabled scroll state. Its Compose implementation reports
  // semantics at the previous DOWN position; inspect public page views instead.
  if (view is ComposePagerView) {
    for (i in view.getPageCount() - 1 downTo 0) if (horizontalTarget(view.getPageAt(i), x, y)) return true
    return false
  }
  if (view is ViewGroup) for (i in view.childCount - 1 downTo 0) if (horizontalTarget(view.getChildAt(i), x, y)) return true
  return false
}
