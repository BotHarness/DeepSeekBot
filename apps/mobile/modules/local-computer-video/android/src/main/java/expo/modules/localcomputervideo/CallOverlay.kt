package expo.modules.localcomputervideo

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.sqrt

/**
 * The call bubble over other apps (#3469): the same anatomy as the in-app bubble (V12):
 * Bot initial, state ring, call-time capsule and a muted badge, draggable and snapped to
 * the nearer side. It exists only while the app is in the background; in the app the
 * React Native bubble takes over, so the two never show together. Main thread only.
 */
class CallOverlay(private val context: Context, private val onTap: () -> Unit) {
  private val windows = context.getSystemService(WindowManager::class.java)
  private val view = CallOverlayView(context)
  private var attached = false
  private var snap: ValueAnimator? = null
  private val params = WindowManager.LayoutParams(
    WindowManager.LayoutParams.WRAP_CONTENT,
    WindowManager.LayoutParams.WRAP_CONTENT,
    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
    PixelFormat.TRANSLUCENT,
  ).apply {
    gravity = Gravity.TOP or Gravity.START
    title = "Bot call"
  }

  init {
    view.setOnTouchListener(Drag())
    view.setOnClickListener { onTap() }
  }

  fun show(notice: CallNotice): Boolean {
    view.bind(notice)
    if (attached) return true
    return try {
      view.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
      val area = safeArea()
      val margin = view.dp(16f).toInt()
      // First time on the right edge, like the in-app bubble; afterwards where it was left.
      params.x = CallBubblePlacement.snapX(position?.first ?: area.width, view.measuredWidth, area.width, area.left, area.right, margin)
      params.y = CallBubblePlacement.clampY(position?.second ?: (area.height / 3), view.measuredHeight,
        area.height, area.top, area.bottom, margin)
      windows.addView(view, params)
      attached = true
      view.appear()
      true
    } catch (_: Exception) {
      attached = false
      false
    }
  }

  fun hide() {
    snap?.cancel()
    snap = null
    view.stopTicking()
    if (!attached) return
    attached = false
    runCatching { windows.removeViewImmediate(view) }
  }

  private data class Area(val width: Int, val height: Int, val left: Int, val top: Int, val right: Int, val bottom: Int)

  private fun safeArea(): Area {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = windows.currentWindowMetrics
      val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
      val bounds: Rect = metrics.bounds
      return Area(bounds.width(), bounds.height(), insets.left, insets.top, insets.right, insets.bottom)
    }
    val display = context.resources.displayMetrics
    val bar = view.dp(24f).toInt()
    return Area(display.widthPixels, display.heightPixels, 0, bar, 0, bar * 2)
  }

  private fun settle() {
    val area = safeArea()
    val margin = view.dp(16f).toInt()
    val targetX = CallBubblePlacement.snapX(params.x, view.width, area.width, area.left, area.right, margin)
    val targetY = CallBubblePlacement.clampY(params.y, view.height, area.height, area.top, area.bottom, margin)
    val fromX = params.x
    val fromY = params.y
    position = targetX to targetY
    snap?.cancel()
    // Material 3 Expressive fast spatial spring (damping 0.9, stiffness 1400), sampled.
    snap = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 350
      interpolator = SpringInterpolator(0.9f, 1400f)
      addUpdateListener {
        if (!attached) return@addUpdateListener
        val t = it.animatedValue as Float
        params.x = (fromX + (targetX - fromX) * t).toInt()
        params.y = (fromY + (targetY - fromY) * t).toInt()
        runCatching { windows.updateViewLayout(view, params) }
      }
      start()
    }
  }

  private inner class Drag : View.OnTouchListener {
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private var downX = 0f
    private var downY = 0f
    private var startX = 0
    private var startY = 0
    private var dragging = false

    override fun onTouch(target: View, event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          snap?.cancel()
          downX = event.rawX; downY = event.rawY
          startX = params.x; startY = params.y
          dragging = false
          target.isPressed = true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downX
          val dy = event.rawY - downY
          if (!dragging && hypot(dx, dy) > slop) { dragging = true; target.isPressed = false }
          if (dragging && attached) {
            params.x = startX + dx.toInt()
            params.y = startY + dy.toInt()
            runCatching { windows.updateViewLayout(view, params) }
          }
        }
        MotionEvent.ACTION_UP -> {
          target.isPressed = false
          if (dragging) settle() else target.performClick()
        }
        MotionEvent.ACTION_CANCEL -> {
          target.isPressed = false
          if (dragging) settle()
        }
      }
      return true
    }
  }

  companion object {
    /** Where the Human left the bubble, for the next time the app goes to the background. */
    private var position: Pair<Int, Int>? = null
  }
}

/** A damped spring as a 0→1 interpolator, so the snap needs no extra dependency. */
class SpringInterpolator(private val damping: Float, private val stiffness: Float) : android.view.animation.Interpolator {
  override fun getInterpolation(input: Float): Float {
    val omega = sqrt(stiffness.toDouble())
    val time = input * 0.35
    val zeta = damping.toDouble()
    if (zeta >= 1) return (1 - (1 + omega * time) * exp(-omega * time)).toFloat()
    val damped = omega * sqrt(1 - zeta * zeta)
    val envelope = exp(-zeta * omega * time)
    val value = 1 - envelope * (kotlin.math.cos(damped * time) + (zeta * omega / damped) * kotlin.math.sin(damped * time))
    return if (input >= 1f) 1f else value.toFloat()
  }
}

class CallOverlayView(context: Context) : View(context) {
  private var notice: CallNotice? = null
  private val main = Handler(Looper.getMainLooper())
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val letter = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
  }
  private val time = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    fontFeatureSettings = "tnum"
  }
  private val muted = context.getDrawable(R.drawable.bot_call_notice_mic_off)?.mutate()
  private val avatar = dp(56f)
  private val stroke = dp(3f)
  private val gap = dp(2f)
  private val box = avatar + (stroke + gap) * 2
  private val capsuleHeight = sp(18f) + dp(4f)
  private var shownLength = -1
  private val tick = object : Runnable {
    override fun run() {
      if (notice?.startedAt == null || !isAttachedToWindow) return
      refreshLabel()
      val length = duration()?.length ?: 0
      if (length != shownLength) { shownLength = length; requestLayout() }
      invalidate()
      main.postDelayed(this, 1000 - (System.currentTimeMillis() % 1000))
    }
  }

  init {
    isClickable = true
    isFocusable = false
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    // The bubble is an overlay window with its own elevation-free surface; a slim base
    // outline keeps it readable on any app behind it.
    elevation = dp(6f)
  }

  fun dp(value: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics)
  private fun sp(value: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, value, resources.displayMetrics)

  fun bind(value: CallNotice) {
    val restart = notice?.startedAt != value.startedAt
    notice = value
    refreshLabel()
    if (restart) { shownLength = -1; requestLayout() }
    invalidate()
    if (restart || value.startedAt != null) { main.removeCallbacks(tick); main.post(tick) }
  }

  fun appear() {
    scaleX = 0.6f; scaleY = 0.6f; alpha = 0f
    animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(300)
      .setInterpolator(SpringInterpolator(0.8f, 1400f)).start()
  }

  fun stopTicking() = main.removeCallbacks(tick)

  private fun duration(): String? = notice?.startedAt?.let { callDuration(System.currentTimeMillis() - it) }

  private fun refreshLabel() {
    val shown = notice ?: return
    contentDescription = duration()?.let { "${shown.bubbleLabel}. $it" } ?: shown.bubbleLabel
  }

  override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
    super.onInitializeAccessibilityNodeInfo(info)
    info.className = android.widget.Button::class.java.name
  }

  override fun onDetachedFromWindow() {
    stopTicking()
    super.onDetachedFromWindow()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val label = duration()
    val capsuleWidth = if (label == null) 0f else time.apply { textSize = sp(12f) }.measureText(label) + dp(16f)
    val width = maxOf(box, capsuleWidth)
    val height = box + if (label == null) 0f else capsuleHeight - dp(6f)
    setMeasuredDimension(width.toInt() + 1, height.toInt() + 1)
  }

  override fun onDraw(canvas: Canvas) {
    val shown = notice ?: return
    val cx = width / 2f
    val cy = box / 2f
    val radius = avatar / 2f
    // Ring: the state colour, a thin track while connecting.
    ring.strokeWidth = stroke
    ring.color = shown.ringColor
    ring.alpha = if (shown.tone == "connecting") 110 else 255
    canvas.drawCircle(cx, cy, radius + gap + stroke / 2, ring)
    fill.color = shown.surfaceColor
    canvas.drawCircle(cx, cy, radius, fill)
    letter.color = shown.fgColor
    letter.textSize = avatar * 0.42f
    val metrics = letter.fontMetrics
    canvas.drawText(shown.initial, cx, cy - (metrics.ascent + metrics.descent) / 2, letter)
    if (shown.muted && muted != null) {
      val badge = dp(20f)
      val bx = cx + radius * 0.72f
      val by = cy + radius * 0.72f
      fill.color = shown.fgColor
      canvas.drawCircle(bx, by, badge / 2, fill)
      val inset = dp(4f).toInt()
      muted.setTint(shown.baseColor)
      muted.setBounds((bx - badge / 2).toInt() + inset, (by - badge / 2).toInt() + inset,
        (bx + badge / 2).toInt() - inset, (by + badge / 2).toInt() - inset)
      muted.draw(canvas)
    }
    val label = duration()
    if (label != null) {
      time.textSize = sp(12f)
      val capsuleWidth = time.measureText(label) + dp(16f)
      val top = box - dp(6f)
      val rect = RectF(cx - capsuleWidth / 2, top, cx + capsuleWidth / 2, top + capsuleHeight)
      fill.color = shown.fgColor
      canvas.drawRoundRect(rect, capsuleHeight / 2, capsuleHeight / 2, fill)
      time.color = shown.baseColor
      val tm = time.fontMetrics
      canvas.drawText(label, cx, rect.centerY() - (tm.ascent + tm.descent) / 2, time)
    }
  }
}
