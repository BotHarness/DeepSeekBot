package expo.modules.speakeranchor

import android.graphics.RectF
import android.view.View

object SpeakerGeometry {
  fun offset(top: Float, height: Float, rest: Float, span: Float, floor: Float): Float {
    val bottom = top + rest + height
    val lift = minOf(maxOf(0f, bottom - floor), maxOf(0f, rest + span))
    return rest - lift
  }

  fun windowRect(view: View, ownTransform: Boolean, out: RectF): RectF {
    out.set(0f, 0f, view.width.toFloat(), view.height.toFloat())
    var node: View = view
    var first = true
    while (true) {
      if ((ownTransform || !first) && !node.matrix.isIdentity) node.matrix.mapRect(out)
      first = false
      out.offset(node.left.toFloat(), node.top.toFloat())
      val parent = node.parent as? View ?: break
      out.offset(-parent.scrollX.toFloat(), -parent.scrollY.toFloat())
      node = parent
    }
    return out
  }
}
