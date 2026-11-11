package expo.modules.latestanchor

import android.animation.ValueAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.graphics.drawable.RippleDrawable
import android.graphics.drawable.ShapeDrawable
import android.graphics.drawable.shapes.RoundRectShape
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.animation.DecelerateInterpolator
import com.facebook.react.uimanager.RootView
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.roundToInt

/** ReplySwipe's nativeID; the end drawer leaves a swipe left that starts inside such a view. */
internal const val HORIZONTAL_SWIPE_OWNER = "horizontal-swipe-owner"

/** What a native message bubble asks of its list: the same gestures a React bubble handles. */
interface BubbleActions {
  /** Whether a horizontal drag may reply; false while replying is unavailable. */
  val swipeEnabled: Boolean
  /** A tap: JavaScript opens the message menu anchored to the bubble. */
  fun press(view: TextBubbleView, row: TextRow)
  /** A long press: JavaScript starts selecting this message. */
  fun hold(view: TextBubbleView, row: TextRow)
  /** The swipe crossed the reply threshold, for haptics. */
  fun arm(row: TextRow)
  /** The swipe was released past the threshold. */
  fun reply(row: TextRow)
}

/**
 * A native message bubble: draws a [TextBubbleLayout] and handles tap, long press and
 * swipe-to-reply, with the ripple a React bubble shows when pressed. The list sizes the view to
 * [TextBubbleLayout.bubble] so hit tests, accessibility focus and the end drawer's
 * horizontal-swipe check see the bubble rather than the whole row; the layout stays in row
 * coordinates and drawing and touches are offset by the bubble's origin.
 */
class TextBubbleView(context: Context) : View(context) {
  var actions: BubbleActions? = null
  var layout: TextBubbleLayout? = null
    set(value) {
      field = value
      contentDescription = value?.let { "${it.row.body}, ${it.row.time.replace(' ', ' ')}" }
      reset()
      ripple = value?.let(::rippleFor)
      invalidate()
    }
  /**
   * Marks the view as owning its swipe left, as ReplySwipe's nativeID does for React rows, so the
   * end drawer does not open from a reply swipe.
   */
  var swipeOwner = false
    set(value) {
      field = value
      setTag(com.facebook.react.R.id.view_tag_native_id, if (value) HORIZONTAL_SWIPE_OWNER else null)
    }
  private val density get() = resources.displayMetrics.density
  private val slop = ViewConfiguration.get(context).scaledTouchSlop.toFloat()
  /** +1 when a reply drags right (RTL), -1 when it drags left. */
  private val side get() = if (layoutDirection == LAYOUT_DIRECTION_RTL) 1f else -1f
  private var ripple: RippleDrawable? = null
  private var downX = 0f
  private var downY = 0f
  private var tracking = false
  private var swiping = false
  private var swipeDead = false
  private var held = false
  private var armed = false
  /** How far the bubble has moved toward the reply side, in physical pixels. */
  private var shift = 0f
  private var settle: ValueAnimator? = null
  private val hold = Runnable {
    val row = layout?.row ?: return@Runnable
    if (!tracking || swiping) return@Runnable
    held = true
    actions?.hold(this, row)
  }
  private val hintPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val glyphPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  /** ReplyIcon's path, "M9 17 4 12l5-5M4 12h11a5 5 0 0 1 5 5v2", in its 24-unit box. */
  private val glyph = Path().apply {
    moveTo(9f, 17f); lineTo(4f, 12f); lineTo(9f, 7f)
    moveTo(4f, 12f); lineTo(15f, 12f)
    arcTo(RectF(10f, 12f, 20f, 22f), -90f, 90f)
    lineTo(20f, 19f)
  }

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    isClickable = true
    isLongClickable = true
    isHapticFeedbackEnabled = false
  }

  private fun rippleFor(layout: TextBubbleLayout): RippleDrawable? {
    val touch = layout.tokens.touch ?: return null
    val mask = ShapeDrawable(RoundRectShape(layout.radii, null, null))
    val bounds = layout.bubble
    return RippleDrawable(ColorStateList.valueOf(if (layout.row.human) touch.pressHuman else touch.pressBot), null, mask).apply {
      setBounds(bounds.left.roundToInt(), bounds.top.roundToInt(), bounds.right.roundToInt(), bounds.bottom.roundToInt())
      callback = this@TextBubbleView
      state = drawableState
    }
  }

  override fun verifyDrawable(who: Drawable) = who === ripple || super.verifyDrawable(who)
  override fun drawableStateChanged() {
    super.drawableStateChanged()
    ripple?.state = drawableState
  }
  override fun jumpDrawablesToCurrentState() {
    super.jumpDrawablesToCurrentState()
    ripple?.jumpToCurrentState()
  }

  override fun performClick(): Boolean {
    super.performClick()
    layout?.row?.let { actions?.press(this, it) }
    return true
  }
  override fun performLongClick(): Boolean {
    layout?.row?.let { actions?.hold(this, it) }
    return true
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    val layout = layout ?: return false
    val touch = layout.tokens.touch ?: return false
    val swipe = touch.swipe
    val x = event.x + layout.frame.left
    val y = event.y + layout.frame.top
    val dx = (x - downX) * side / density
    val dy = (y - downY) / density
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        if (!layout.bubble.contains(x, y)) return false
        settle?.cancel()
        shift = 0f
        downX = x
        downY = y
        tracking = true
        swiping = false
        held = false
        armed = false
        swipeDead = actions?.swipeEnabled != true
        ripple?.setHotspot(x, y)
        isPressed = true
        postDelayed(hold, touch.holdMs)
      }
      MotionEvent.ACTION_MOVE -> {
        if (!tracking) return false
        if (!swiping) {
          if (hypot(x - downX, y - downY) > slop) {
            removeCallbacks(hold)
            isPressed = false
          }
          if (!swipeDead && !held) when (swipe.classify(dx, dy)) {
            ReplySwipe.Intent.SWIPE -> {
              swiping = true
              removeCallbacks(hold)
              isPressed = false
              parent?.requestDisallowInterceptTouchEvent(true)
              reactRoot()?.onChildStartedNativeGesture(this, event)
            }
            ReplySwipe.Intent.CANCEL -> swipeDead = true
            ReplySwipe.Intent.WAIT -> Unit
          }
        }
        if (swiping) {
          shift = swipe.travel(dx) * density
          val next = swipe.replies(dx)
          if (next != armed) {
            armed = next
            if (armed) actions?.arm(layout.row)
          }
          invalidate()
        }
      }
      MotionEvent.ACTION_UP -> {
        if (!tracking) return false
        removeCallbacks(hold)
        val pressed = isPressed
        if (swiping) {
          reactRoot()?.onChildEndedNativeGesture(this, event)
          if (swipe.replies(dx)) actions?.reply(layout.row)
          settleBack()
        } else if (pressed && !held) performClick()
        tracking = false
        swiping = false
        isPressed = false
      }
      MotionEvent.ACTION_CANCEL -> {
        if (!tracking) return false
        removeCallbacks(hold)
        if (swiping) reactRoot()?.onChildEndedNativeGesture(this, event)
        settleBack()
        tracking = false
        swiping = false
        isPressed = false
      }
    }
    return true
  }

  /** The React root that cancels JavaScript touches while this bubble owns a swipe. */
  private fun reactRoot(): RootView? {
    var current = parent
    while (current != null && current !is RootView) current = current.parent
    return current as? RootView
  }

  private fun settleBack() {
    if (shift == 0f) return
    settle?.cancel()
    settle = ValueAnimator.ofFloat(shift, 0f).apply {
      duration = 220
      interpolator = DecelerateInterpolator()
      addUpdateListener { shift = it.animatedValue as Float; invalidate() }
      start()
    }
  }

  private fun reset() {
    removeCallbacks(hold)
    settle?.cancel()
    settle = null
    shift = 0f
    tracking = false
    swiping = false
    held = false
    armed = false
    isPressed = false
  }

  override fun onDetachedFromWindow() {
    reset()
    super.onDetachedFromWindow()
  }

  override fun onDraw(canvas: Canvas) {
    val layout = layout ?: return
    canvas.translate(-layout.frame.left, -layout.frame.top)
    layout.tokens.touch?.let { if (shift > 0f) drawHint(canvas, layout, it) }
    canvas.save()
    canvas.translate(shift * side, 0f)
    layout.draw(canvas)
    ripple?.draw(canvas)
    canvas.restore()
  }

  /** The reply hint at the bubble's end edge, fading and growing in as the swipe nears its threshold. */
  private fun drawHint(canvas: Canvas, layout: TextBubbleLayout, touch: TouchStyle) {
    val shown = min(1f, shift / density / touch.swipe.commit)
    val scale = 0.6f + shown * 0.4f
    val radius = touch.hintIcon * density / 2f
    val inset = touch.hintEnd * density + radius
    val cx = if (side < 0) layout.bubble.right - inset else layout.bubble.left + inset
    val cy = layout.bubble.centerY()
    val alpha = (shown * 255).roundToInt()
    hintPaint.color = touch.hintFill
    hintPaint.alpha = hintPaint.alpha * alpha / 255
    canvas.drawCircle(cx, cy, radius * scale, hintPaint)
    val size = touch.glyph * density * scale
    glyphPaint.color = touch.hintInk
    glyphPaint.alpha = glyphPaint.alpha * alpha / 255
    glyphPaint.strokeWidth = 1.8f
    canvas.save()
    canvas.translate(cx - size / 2f, cy - size / 2f)
    canvas.scale(size / 24f, size / 24f)
    canvas.drawPath(glyph, glyphPaint)
    canvas.restore()
  }
}
