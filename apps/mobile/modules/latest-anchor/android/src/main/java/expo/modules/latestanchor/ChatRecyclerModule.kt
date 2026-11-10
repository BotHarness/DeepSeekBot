package expo.modules.latestanchor

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.bridge.ReactContext
import android.graphics.RectF
import android.graphics.Matrix

class ChatRecyclerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChatRecycler")
    Constants("supported" to (android.os.Build.VERSION.SDK_INT >= 29))
    AsyncFunction("measureInWindow") { tag: Int ->
      val context = appContext.reactContext as? ReactContext ?: return@AsyncFunction null
      val view = UIManagerHelper.getUIManagerForReactTag(context, tag)?.resolveView(tag) ?: return@AsyncFunction null
      if (!view.isAttachedToWindow) return@AsyncFunction null
      val matrix = Matrix()
      view.transformMatrixToGlobal(matrix)
      val bounds = RectF(0f, 0f, view.width.toFloat(), view.height.toFloat())
      matrix.mapRect(bounds)
      val density = view.resources.displayMetrics.density
      mapOf("x" to bounds.left / density, "y" to bounds.top / density, "width" to bounds.width() / density, "height" to bounds.height() / density)
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
