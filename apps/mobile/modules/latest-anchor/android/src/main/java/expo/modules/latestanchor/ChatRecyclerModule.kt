package expo.modules.latestanchor

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.bridge.ReactContext
import android.graphics.RectF
import android.graphics.Matrix
import android.view.Choreographer
import android.view.View
import android.view.ViewTreeObserver
import expo.modules.kotlin.Promise

class ChatRecyclerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChatRecycler")
    Constants("supported" to (android.os.Build.VERSION.SDK_INT >= 29))
    // React reports a new cell's layout before the RecyclerView binds it into a row, so the first
    // measurement arrives while the view is detached. Wait for that bind instead of
    // answering null at once; JavaScript shows the message in place when the answer is null.
    AsyncFunction("measureInWindow") { tag: Int, promise: Promise ->
      val context = appContext.reactContext as? ReactContext
      val view = context?.let { UIManagerHelper.getUIManagerForReactTag(it, tag)?.resolveView(tag) }
      if (view == null) promise.resolve(null) else whenDrawable(view) { promise.resolve(it?.let(::windowBounds)) }
    }.runOnQueue(Queues.MAIN)
    View(ChatRecyclerView::class) {
      Events("onWindow", "onScroll", "onScrollBeginDrag", "onScrollEndDrag", "onMomentumScrollBegin", "onMomentumScrollEnd", "onContentSize", "onVisible", "onKeyboardInset")
      Prop("rows") { view: ChatRecyclerView, rows: List<String> -> view.setRows(rows) }
      Prop("following") { view: ChatRecyclerView, following: Boolean -> view.following = following }
      Prop("estimate") { view: ChatRecyclerView, value: Double -> view.setEstimate(value) }
      Prop("contentTop") { view: ChatRecyclerView, value: Double -> view.setTop(value) }
      Prop("contentBottom") { view: ChatRecyclerView, value: Double -> view.setBottom(value) }
      AsyncFunction("measureCell") { view: ChatRecyclerView, key: String, height: Double -> view.measureCell(key, height) }
      AsyncFunction("scrollToOffset") { view: ChatRecyclerView, offset: Double, animated: Boolean -> view.scrollToOffset(offset, animated) }
      AsyncFunction("scrollToIndex") { view: ChatRecyclerView, index: Int, position: Double -> view.scrollToIndex(index, position) }
      GroupView<ChatRecyclerView> {
        AddChildView { parent: ChatRecyclerView, child: ChatRecyclerCell, index: Int -> parent.register(child, index) }
        GetChildCount { parent -> parent.cells.size }
        GetChildViewAt { parent, index -> parent.cells[index] }
        RemoveChildView { parent: ChatRecyclerView, child: ChatRecyclerCell -> parent.unregister(child) }
        RemoveChildViewAt { parent, index -> parent.unregister(parent.cells[index]) }
      }
    }
  }
}

class ChatRecyclerCellModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChatRecyclerCell")
    View(ChatRecyclerCell::class) {
      Prop("rowKey") { view: ChatRecyclerCell, key: String -> view.rowKey = key }
      GroupView<ChatRecyclerCell> {
        AddChildView { parent: ChatRecyclerCell, child: android.view.View, index: Int -> parent.addView(child, index) }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt { parent, index -> parent.getChildAt(index) }
        RemoveChildView { parent: ChatRecyclerCell, child: android.view.View -> parent.removeView(child) }
        RemoveChildViewAt { parent, index -> parent.removeViewAt(index) }
      }
    }
  }
}

private fun windowBounds(view: View): Map<String, Float> {
  val matrix = Matrix()
  view.transformMatrixToGlobal(matrix)
  val bounds = RectF(0f, 0f, view.width.toFloat(), view.height.toFloat())
  matrix.mapRect(bounds)
  val density = view.resources.displayMetrics.density
  return mapOf("x" to bounds.left / density, "y" to bounds.top / density, "width" to bounds.width() / density, "height" to bounds.height() / density)
}

/** Calls [done] once: with [view] when it is attached and laid out, or null when it is not. */
private fun whenDrawable(view: View, done: (View?) -> Unit) {
  if (view.isAttachedToWindow && !view.isLayoutRequested) return done(view)
  var finished = false
  var observer: ViewTreeObserver? = null
  lateinit var predraw: ViewTreeObserver.OnPreDrawListener
  lateinit var attach: View.OnAttachStateChangeListener
  fun finish(result: View?) {
    if (finished) return
    finished = true
    view.removeOnAttachStateChangeListener(attach)
    observer?.takeIf { it.isAlive }?.removeOnPreDrawListener(predraw)
    done(result)
  }
  predraw = ViewTreeObserver.OnPreDrawListener {
    if (view.isAttachedToWindow && !view.isLayoutRequested) finish(view)
    true
  }
  attach = object : View.OnAttachStateChangeListener {
    override fun onViewAttachedToWindow(v: View) {
      observer = v.viewTreeObserver.also { it.addOnPreDrawListener(predraw) }
    }
    override fun onViewDetachedFromWindow(v: View) = Unit
  }
  view.addOnAttachStateChangeListener(attach)
  if (view.isAttachedToWindow) observer = view.viewTreeObserver.also { it.addOnPreDrawListener(predraw) }
  // A cell is bound into its row on the RecyclerView's next pass. Give up after two frames while it
  // is still detached; once attached, its pre-draw follows, with six frames as the last resort.
  val choreographer = Choreographer.getInstance()
  var frames = 0
  val tick = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      if (finished) return
      frames += 1
      if ((frames >= 2 && !view.isAttachedToWindow) || frames >= 6) finish(null)
      else choreographer.postFrameCallback(this)
    }
  }
  choreographer.postFrameCallback(tick)
}
