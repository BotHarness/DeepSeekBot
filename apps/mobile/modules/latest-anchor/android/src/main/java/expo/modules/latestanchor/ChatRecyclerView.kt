package expo.modules.latestanchor

import android.content.Context
import android.graphics.RectF
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
import kotlin.math.ceil
import kotlin.math.roundToInt

class ChatRecyclerCell(context: Context, app: AppContext) : ExpoView(context, app) {
  var rowKey = ""
  // A row keeps its measured height while decorations such as the reading chip overflow it, as in FlatList.
  // ExpoView also clips its canvas to the padding box unless clipToPadding is off.
  init {
    clipChildren = false
    clipToPadding = false
  }
  override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(MeasureSpec.getSize(w), MeasureSpec.getSize(h))
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit
}

class ChatRecyclerView(context: Context, app: AppContext) : ExpoView(context, app) {
  private companion object { const val CELL = 0; const val TEXT = 1; const val AVATAR = "avatar:" }
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
  private var contentTop = 0
  private var contentBottom = 0
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
  private val onRowAction by EventDispatcher()
  /** Whether native rows may swipe to reply, as React rows do while a reply can be composed. */
  var rowSwipe = false
    set(value) {
      if (field == value) return
      field = value
      for (i in 0 until recycler.childCount) (recycler.getChildViewHolder(recycler.getChildAt(i)) as? Holder)?.bubble?.swipeOwner = value
    }
  private val bubbleActions = object : BubbleActions {
    override val swipeEnabled get() = rowSwipe
    override fun press(view: TextBubbleView, row: TextRow) = rowAction("press", row, view)
    override fun hold(view: TextBubbleView, row: TextRow) = rowAction("hold", row, view)
    override fun arm(row: TextRow) = rowAction("arm", row)
    override fun reply(row: TextRow) = rowAction("reply", row)
  }
  private var textRows = emptyMap<String, TextRow>()
  private var textStyle: TextRowStyle? = null
  private val textLayouts = mutableMapOf<String, TextBubbleLayout>()
  private val markdownSpans by lazy { MarkdownSpans(context) }
  /** Speaker avatars of group chats, one React cell per run, placed over the list by [placeAvatars]. */
  private val avatarLayer = FrameLayout(context).apply { clipChildren = false; clipToPadding = false }
  private val avatars = mutableMapOf<String, ChatRecyclerCell>()
  private var speakerSlots = emptyMap<String, SpeakerSlot>()

  private inner class Holder(val box: FrameLayout, val bubble: TextBubbleView? = null) : RecyclerView.ViewHolder(box)
  private val adapter = object : RecyclerView.Adapter<Holder>() {
    override fun getItemId(position: Int) = identities.getValue(keys[position])
    override fun getItemCount() = keys.size
    override fun getItemViewType(position: Int) = if (textLayouts.containsKey(keys[position])) TEXT else CELL
    override fun onCreateViewHolder(parent: ViewGroup, type: Int): Holder {
      val box = FrameLayout(context).apply { clipChildren = false }
      if (type != TEXT) return Holder(box)
      val bubble = TextBubbleView(context).also { it.actions = bubbleActions }
      box.addView(bubble)
      return Holder(box, bubble)
    }
    override fun onBindViewHolder(holder: Holder, position: Int) {
      holder.box.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, heightAt(position))
      holder.box.scaleY = -1f
      if (holder.bubble != null) {
        val layout = textLayouts[keys[position]]
        holder.bubble.layout = layout
        holder.bubble.swipeOwner = rowSwipe
        layout?.frame?.let { frame ->
          val left = frame.left.toInt()
          val top = frame.top.toInt()
          holder.bubble.layoutParams = FrameLayout.LayoutParams(ceil(frame.right).toInt() - left, ceil(frame.bottom).toInt() - top).apply {
            leftMargin = left
            topMargin = top
          }
        }
        return
      }
      holder.box.removeAllViews()
      cells.firstOrNull { it.rowKey == keys[position] }?.let { cell ->
        (cell.parent as? ViewGroup)?.removeView(cell)
        holder.box.addView(cell, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      }
    }
    override fun onViewRecycled(holder: Holder) { if (holder.bubble == null) holder.box.removeAllViews() }
  }

  init {
    recycler.layoutManager = manager
    adapter.setHasStableIds(true)
    recycler.adapter = adapter
    recycler.itemAnimator = null
    recycler.scaleY = -1f
    recycler.isScrollContainer = true
    recycler.clipToPadding = false
    recycler.clipChildren = false
    addView(recycler)
    addView(avatarLayer)
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

  private fun rowAction(action: String, row: TextRow, view: TextBubbleView? = null) {
    val event = mutableMapOf<String, Any>("action" to action, "key" to row.key)
    val layout = view?.layout
    if (view != null && layout != null)
      event["anchor"] = windowBounds(view, RectF(layout.bubble).apply { offset(-layout.frame.left, -layout.frame.top) })
    onRowAction(event)
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
    val change = rowChange(keys, next)
    keys = next
    positions = next.withIndex().associate { it.value to it.index }
    heights.keys.retainAll(next.toSet())
    identities.keys.retainAll(next.toSet())
    next.forEach { identities.getOrPut(it) { ++nextIdentity } }
    geometry = RecyclerHeights(next.map { heights[it] ?: maxOf(1, (estimate * density).roundToInt()) })
    if (change == null) adapter.notifyDataSetChanged()
    else {
      if (change.removed > 0) adapter.notifyItemRangeRemoved(change.start, change.removed)
      if (change.inserted > 0) adapter.notifyItemRangeInserted(change.start, change.inserted)
    }
    lastWindow = ""
    restore(anchor)
  }
  fun setEstimate(value: Double) { estimate = maxOf(1, value.roundToInt()) }
  fun setTextRows(rows: List<Map<String, Any?>>) {
    val next = rows.mapNotNull(TextRow::from).associateBy { it.key }
    if (next == textRows) return
    val previous = textRows
    textRows = next
    layoutText(previous.keys + next.keys)
  }
  fun setTextStyle(value: Map<String, Any?>) {
    val next = TextRowStyle.from(value)
    if (next == textStyle) return
    textStyle = next
    layoutText(textRows.keys + textLayouts.keys)
  }
  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (w != oldw) layoutText(textRows.keys + textLayouts.keys)
  }
  private fun layoutText(changed: Set<String>) {
    val style = textStyle
    if (width <= 0) return
    val anchor = anchor()
    for (key in changed) {
      val row = textRows[key]
      if (row == null || style == null) {
        textLayouts.remove(key)
        positions[key]?.let(::refreshAt)
        continue
      }
      val current = textLayouts[key]
      if (current != null && current.row == row && current.width == width && current.tokens == style) continue
      val layout = TextBubbleLayout(row, style, width, density) { body -> style.markdown?.let { markdownSpans.render(body, it) } }
      textLayouts[key] = layout
      heights[key] = layout.height
      positions[key]?.let { geometry.update(it, layout.height); refreshAt(it) }
    }
    restore(anchor)
  }
  private fun refreshAt(position: Int) {
    if (recycler.isComputingLayout) recycler.post { adapter.notifyItemChanged(position) }
    else adapter.notifyItemChanged(position)
  }
  fun setTop(value: Double) { contentTop = (value * density).roundToInt(); applyPadding() }
  fun setBottom(value: Double) { contentBottom = (value * density).roundToInt(); applyPadding() }
  private fun applyPadding() {
    val anchor = anchor()
    recycler.setPadding(0, contentTop + ime, 0, contentBottom)
    restore(anchor)
  }
  fun register(cell: ChatRecyclerCell, index: Int) {
    cells.add(index.coerceAtMost(cells.size), cell)
    val group = cell.rowKey.removePrefix(AVATAR)
    if (group != cell.rowKey) {
      avatars[group] = cell
      (cell.parent as? ViewGroup)?.removeView(cell)
      val size = ((textStyle?.avatar ?: 32f) * density).roundToInt()
      avatarLayer.addView(cell, FrameLayout.LayoutParams(size, size))
      placeAvatars()
      return
    }
    refresh(cell.rowKey)
  }
  fun unregister(cell: ChatRecyclerCell) {
    cells.remove(cell)
    avatars.values.remove(cell)
    (cell.parent as? ViewGroup)?.removeView(cell)
  }
  fun setSpeakerRows(rows: List<Map<String, Any?>>) {
    val next = rows.mapNotNull(SpeakerSlot::from).associateBy { it.key }
    if (next == speakerSlots) return
    speakerSlots = next
    placeAvatars()
  }

  /**
   * Places each run's avatar beside the run's last bubble, keeps it above the composer while that
   * bubble is below it and below the run's first bubble, from row offsets alone, so rows outside
   * the RecyclerView's window still count. The list is flipped: position 0 is at the bottom.
   */
  private fun placeAvatars() {
    if (avatars.isEmpty()) return
    val style = textStyle ?: return
    if (height == 0) return
    val size = style.avatar * density
    val floor = (height - recycler.paddingTop).toFloat()
    val scrolled = offset()
    fun visualTop(position: Int) = (height - (geometry.prefix(position) + recycler.paddingTop - scrolled + heightAt(position))).toFloat()
    val runs = mutableMapOf<String, IntRange>()
    for (slot in speakerSlots.values) {
      val position = positions[slot.key] ?: continue
      val known = runs[slot.group]
      runs[slot.group] = if (known == null) position..position else minOf(known.first, position)..maxOf(known.last, position)
    }
    for ((group, cell) in avatars) {
      val run = runs[group]
      val last = run?.let { speakerSlots[keys[it.first]] }
      val first = run?.let { speakerSlots[keys[it.last]] }
      val top = if (run == null || last == null || first == null) null else {
        val runBottom = visualTop(run.first) + heightAt(run.first) - last.bottom * density
        val nameHeight = if (first.name) style.metaLine * style.fontScale * density + style.nameGap * density else 0f
        val runTop = visualTop(run.last) + (if (first.first) style.firstGap else style.joinGap) * density + nameHeight
        SpeakerPlacement.avatarTop(runTop, runBottom, floor, size, height.toFloat())
      }
      if (top == null) cell.visibility = INVISIBLE
      else {
        cell.visibility = VISIBLE
        cell.translationX = style.rowInset * density
        cell.translationY = top
      }
    }
  }
  private fun refresh(key: String) {
    val position = positions[key] ?: return
    if (recycler.isComputingLayout) { recycler.post { refresh(key) }; return }
    adapter.notifyItemChanged(position)
  }
  fun measureCell(key: String, dp: Double) {
    if (!dp.isFinite() || dp < 0) return
    val height = maxOf(1, (dp * density).roundToInt())
    // React can report a new row's height before the rows prop that adds it; keep it for setRows.
    if (key !in keys) { heights[key] = height; return }
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
    placeAvatars()
    onScroll(metrics())
    onVisible(mapOf("indices" to (first..minOf(last, keys.lastIndex)).filter { heights.containsKey(keys[it]) && jump?.first != keys[it] }))
  }
  override fun onMeasure(w: Int, h: Int) {
    setMeasuredDimension(MeasureSpec.getSize(w), MeasureSpec.getSize(h))
    recycler.measure(MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY))
    avatarLayer.measure(MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY))
  }
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    recycler.layout(0, 0, r - l, b - t)
    avatarLayer.layout(0, 0, r - l, b - t)
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
