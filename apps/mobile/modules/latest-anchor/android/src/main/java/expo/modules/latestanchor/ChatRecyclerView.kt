package expo.modules.latestanchor

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.view.MotionEvent
import android.view.VelocityTracker
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.uimanager.events.NativeGestureUtil
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.viewevent.EventDispatcher
import kotlin.math.roundToInt

class ChatRecyclerCell(context: Context, app: AppContext) : ExpoView(context, app) {
  var rowKey = ""
  override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(MeasureSpec.getSize(w), MeasureSpec.getSize(h))
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit
}

class ChatRecyclerView(context: Context, app: AppContext) : ExpoView(context, app) {
  private val density get() = resources.displayMetrics.density
  private val manager = LinearLayoutManager(context)
  private val recycler = object : RecyclerView(context) {
    private var nativeGesture = false
    private var origin = 0f
    private var velocity: VelocityTracker? = null
    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
      if (event.actionMasked == MotionEvent.ACTION_DOWN) {
        origin = event.y
        velocity?.recycle()
        velocity = VelocityTracker.obtain()
        velocity?.addMovement(event)
      }
      val intercepted = super.onInterceptTouchEvent(event)
      if (intercepted && !nativeGesture) { nativeGesture = true; NativeGestureUtil.notifyNativeGestureStarted(this, event) }
      return intercepted
    }
    override fun onTouchEvent(event: MotionEvent): Boolean {
      if (event.actionMasked == MotionEvent.ACTION_DOWN) {
        origin = event.y
        velocity?.recycle()
        velocity = VelocityTracker.obtain()
      }
      velocity?.addMovement(event)
      velocity?.computeCurrentVelocity(1000)
      velocityY = -(velocity?.yVelocity ?: 0f) / density / 1000f
      if (event.actionMasked == MotionEvent.ACTION_MOVE) {
        pull = if (!canScrollVertically(-1)) minOf(0f, origin - event.y) else 0f
        onScroll(metrics())
      }
      val handled = super.onTouchEvent(event)
      if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
        if (nativeGesture) NativeGestureUtil.notifyNativeGestureEnded(this, event)
        nativeGesture = false
        velocity?.recycle(); velocity = null
        pull = 0f
      }
      return handled
    }
  }
  internal val cells = mutableListOf<ChatRecyclerCell>()
  private var keys = emptyList<String>()
  private val heights = mutableMapOf<String, Int>()
  private var positions = emptyMap<String, Int>()
  private var geometry = RecyclerHeights(emptyList())
  private val identities = mutableMapOf<String, Long>()
  private var nextIdentity = 0L
  private var estimate = 96
  private var pull = 0f
  private var velocityY = 0f
  var following = true
  private var top = 0
  private var bottom = 0
  private var ime = 0
  private var animatingIme = false
  private var lastWindow = ""
  private var lastContent = -1
  private var jump: Pair<String, Double>? = null
  private val onWindow by EventDispatcher()
  private val onScroll by EventDispatcher()
  private val onScrollBeginDrag by EventDispatcher()
  private val onScrollEndDrag by EventDispatcher()
  private val onMomentumScrollBegin by EventDispatcher()
  private val onMomentumScrollEnd by EventDispatcher()
  private val onContentSize by EventDispatcher()
  private val onVisible by EventDispatcher()
  private val onKeyboardInset by EventDispatcher()

  private inner class Holder(val box: FrameLayout) : RecyclerView.ViewHolder(box)
  private val adapter = object : RecyclerView.Adapter<Holder>() {
    override fun getItemId(position: Int) = identities.getValue(keys[position])
    override fun getItemCount() = keys.size
    override fun onCreateViewHolder(parent: ViewGroup, type: Int) = Holder(FrameLayout(context))
    override fun onBindViewHolder(holder: Holder, position: Int) {
      holder.box.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, heightAt(position))
      holder.box.scaleY = -1f
      holder.box.removeAllViews()
      cells.firstOrNull { it.rowKey == keys[position] }?.let { cell ->
        (cell.parent as? ViewGroup)?.removeView(cell)
        holder.box.addView(cell, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      }
    }
    override fun onViewRecycled(holder: Holder) { holder.box.removeAllViews() }
  }

  init {
    recycler.layoutManager = manager
    adapter.setHasStableIds(true)
    recycler.adapter = adapter
    recycler.itemAnimator = null
    recycler.scaleY = -1f
    recycler.isScrollContainer = true
    recycler.clipToPadding = false
    addView(recycler)
    recycler.addOnScrollListener(object : RecyclerView.OnScrollListener() {
      private var dragging = false
      override fun onScrolled(view: RecyclerView, dx: Int, dy: Int) { publish() }
      override fun onScrollStateChanged(view: RecyclerView, state: Int) {
        if (state == RecyclerView.SCROLL_STATE_DRAGGING) {
          jump = null
          following = false
          dragging = true
          onScrollBeginDrag(metrics())
        } else {
          if (dragging) { dragging = false; onScrollEndDrag(metrics()) }
          if (state == RecyclerView.SCROLL_STATE_SETTLING) onMomentumScrollBegin(metrics())
          if (state == RecyclerView.SCROLL_STATE_IDLE) { onMomentumScrollEnd(metrics()); publish() }
        }
      }
    })
    ViewCompat.setOnApplyWindowInsetsListener(recycler) { _, insets ->
      val next = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      if (!animatingIme && next != ime) {
        ime = next
        applyPadding()
        onKeyboardInset(mapOf("height" to ime / density))
      }
      insets
    }
    ViewCompat.setWindowInsetsAnimationCallback(recycler, object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
      override fun onPrepare(animation: WindowInsetsAnimationCompat) { animatingIme = true }
      override fun onProgress(insets: WindowInsetsCompat, running: MutableList<WindowInsetsAnimationCompat>): WindowInsetsCompat {
        val next = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
        if (next != ime) { ime = next; applyPadding(); onKeyboardInset(mapOf("height" to ime / density)) }
        return insets
      }
      override fun onEnd(animation: WindowInsetsAnimationCompat) { animatingIme = false }
    })
  }

  private fun heightAt(index: Int) = geometry.height(index)
  private fun total() = geometry.prefix(keys.size) + recycler.paddingTop + recycler.paddingBottom
  private fun offset(): Int {
    val first = manager.findFirstVisibleItemPosition()
    if (first < 0) return 0
    val view = manager.findViewByPosition(first) ?: return 0
    return geometry.prefix(first) + recycler.paddingTop - manager.getDecoratedTop(view)
  }
  private fun anchor(): Pair<String, Int>? {
    val first = manager.findFirstVisibleItemPosition()
    val view = manager.findViewByPosition(first) ?: return null
    return keys.getOrNull(first)?.let { it to manager.getDecoratedTop(view) }
  }
  private fun restore(anchor: Pair<String, Int>?) {
    if (following && jump == null) manager.scrollToPositionWithOffset(0, 0)
    else anchor?.let { (key, offset) -> positions[key]?.let { manager.scrollToPositionWithOffset(it, offset - recycler.paddingTop) } }
    requestLayout()
  }

  fun setRows(next: List<String>) {
    if (next == keys) return
    val anchor = anchor()
    keys = next
    positions = next.withIndex().associate { it.value to it.index }
    heights.keys.retainAll(next.toSet())
    identities.keys.retainAll(next.toSet())
    next.forEach { identities.getOrPut(it) { ++nextIdentity } }
    geometry = RecyclerHeights(next.map { heights[it] ?: maxOf(1, (estimate * density).roundToInt()) })
    adapter.notifyDataSetChanged()
    lastWindow = ""
    restore(anchor)
  }
  fun setEstimate(value: Double) { estimate = maxOf(1, value.roundToInt()) }
  fun setTop(value: Double) { top = (value * density).roundToInt(); applyPadding() }
  fun setBottom(value: Double) { bottom = (value * density).roundToInt(); applyPadding() }
  private fun applyPadding() {
    val anchor = anchor()
    recycler.setPadding(0, top + ime, 0, bottom)
    restore(anchor)
  }
  fun register(cell: ChatRecyclerCell, index: Int) {
    cells.add(index.coerceAtMost(cells.size), cell)
    refresh(cell.rowKey)
  }
  fun unregister(cell: ChatRecyclerCell) {
    cells.remove(cell)
    (cell.parent as? ViewGroup)?.removeView(cell)
  }
  private fun refresh(key: String) {
    val position = positions[key] ?: return
    if (recycler.isComputingLayout) { recycler.post { refresh(key) }; return }
    adapter.notifyItemChanged(position)
  }
  fun measureCell(key: String, dp: Double) {
    if (!dp.isFinite() || dp < 0 || key !in keys) return
    val height = maxOf(1, (dp * density).roundToInt())
    if (heights[key] == height) return
    val anchor = anchor()
    heights[key] = height
    geometry.update(positions.getValue(key), height)
    refresh(key)
    restore(anchor)
  }
  fun scrollToOffset(dp: Double, animated: Boolean) {
    jump = null
    val wanted = (dp * density).roundToInt().coerceIn(0, maxOf(0, total() - height))
    if (animated) recycler.smoothScrollBy(0, wanted - offset())
    else {
      var remaining = wanted
      var index = 0
      while (index < keys.lastIndex && remaining >= heightAt(index)) { remaining -= heightAt(index); index++ }
      manager.scrollToPositionWithOffset(index, -remaining)
      requestLayout()
    }
  }
  fun scrollToIndex(index: Int, position: Double) {
    val key = keys.getOrNull(index) ?: return
    recycler.stopScroll()
    following = false
    jump = key to position.coerceIn(0.0, 1.0)
    positionJump()
  }
  private fun positionJump() {
    val (key, fraction) = jump ?: return
    val index = positions[key] ?: run { jump = null; return }
    val available = maxOf(0, height - recycler.paddingTop - recycler.paddingBottom)
    val difference = available - heightAt(index)
    val spacing = if (difference < 0) difference else (difference * fraction).roundToInt()
    val wanted = (geometry.prefix(index) - spacing).coerceIn(0, maxOf(0, total() - height))
    if (kotlin.math.abs(offset() - wanted) <= 1) {
      if (heights.containsKey(key)) jump = null
      return
    }
    val view = manager.findViewByPosition(index)
    if (view == null || manager.getDecoratedTop(view) != recycler.paddingTop + spacing) {
      if (wanted == 0) manager.scrollToPositionWithOffset(0, 0)
      else manager.scrollToPositionWithOffset(index, spacing)
      requestLayout()
    } else if (heights.containsKey(key)) jump = null
  }
  private fun metrics(): Map<String, Any> = mapOf(
    "contentOffset" to mapOf("x" to 0, "y" to (offset() + pull) / density),
    "contentSize" to mapOf("width" to width / density, "height" to total() / density),
    "layoutMeasurement" to mapOf("width" to width / density, "height" to height / density),
    "contentInset" to mapOf("top" to 0, "bottom" to ime / density, "left" to 0, "right" to 0),
    "velocity" to mapOf("x" to 0, "y" to velocityY),
  )
  private fun publish() {
    if (!isAttachedToWindow || width == 0 || height == 0) return
    val first = maxOf(0, manager.findFirstVisibleItemPosition())
    val last = maxOf(first, manager.findLastVisibleItemPosition())
    val start = maxOf(0, first - 8)
    val end = minOf(keys.size, last + 9, start + 128)
    val window = "$start:$end:$width"
    if (window != lastWindow) {
      lastWindow = window
      onWindow(mapOf("start" to start, "end" to end, "width" to width / density))
    }
    val size = total()
    if (lastContent != size) {
      lastContent = size
      onContentSize(mapOf("width" to width / density, "height" to size / density))
    }
    onScroll(metrics())
    onVisible(mapOf("indices" to (first..minOf(last, keys.lastIndex)).filter { heights.containsKey(keys[it]) && jump?.first != keys[it] }))
  }
  override fun onMeasure(w: Int, h: Int) {
    setMeasuredDimension(MeasureSpec.getSize(w), MeasureSpec.getSize(h))
    recycler.measure(MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY))
  }
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    recycler.layout(0, 0, r - l, b - t)
    positionJump()
    publish()
  }
  private val layoutChildren = Runnable {
    if (isAttachedToWindow && width > 0 && height > 0) {
      measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
      onLayout(false, left, top, right, bottom)
    }
  }
  override fun requestLayout() {
    super.requestLayout()
    // RecyclerView requests native relayout; Fabric owns only this outer frame.
    if (isAttachedToWindow) { removeCallbacks(layoutChildren); post(layoutChildren) }
  }
  override fun onDetachedFromWindow() {
    recycler.stopScroll()
    removeCallbacks(layoutChildren)
    jump = null
    super.onDetachedFromWindow()
  }
}
