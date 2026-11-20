package expo.modules.latestanchor

import android.content.Context
import android.text.TextPaint
import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.common.ReactConstants
import com.facebook.react.views.text.ReactTypefaceUtils
import com.facebook.react.bridge.JavaOnlyMap
import com.swmansion.enriched.markdown.parser.Md4cFlags
import com.swmansion.enriched.markdown.parser.Parser
import com.swmansion.enriched.markdown.renderer.Renderer
import com.swmansion.enriched.markdown.styles.StyleConfig

/**
 * Renders a Markdown body to styled text with the same md4c parser, renderer and normalized style
 * as the app's Markdown view, so a native row looks like the React row it replaces.
 */
class MarkdownSpans(private val context: Context) {
  private var source: Map<String, Any?>? = null
  private var scale = 0f
  private var config: StyleConfig? = null
  private val renderer = Renderer()
  private val flags = Md4cFlags(latexMath = false)

  fun render(body: String, style: Map<String, Any?>): CharSequence? =
    try {
      val metrics = context.resources.displayMetrics
      val nextScale = metrics.scaledDensity / metrics.density
      if (style != source || nextScale != scale) {
        config = StyleConfig(readableMap(listIndent(style)), context, true, 0f)
        source = style
        scale = nextScale
      }
      Parser.shared.parseMarkdown(body, flags, true)?.let { ast ->
        renderer.configure(config!!, context)
        renderer.renderDocument(ast)
      }
    } catch (error: Throwable) {
      android.util.Log.w("ChatRecycler", "Native Markdown row fell back to plain text", error)
      null
    }

  /**
   * The React list indents by `marginLeft`, then draws its marker. enriched ignores `marginLeft`
   * at the top level and right-aligns the marker in a column, so widen that column to end where
   * a React single-digit marker ends.
   */
  private fun listIndent(style: Map<String, Any?>): Map<String, Any?> {
    val list = style["list"] as? Map<*, *> ?: return style
    val margin = (list["marginLeft"] as? Number)?.toFloat() ?: return style
    val resolved = StyleConfig(readableMap(style), context, true, 0f).listStyle
    val paint =
      TextPaint().apply {
        textSize = resolved.fontSize
        typeface =
          ReactTypefaceUtils.applyStyles(
            null,
            ReactConstants.UNSET,
            ReactTypefaceUtils.parseFontWeight(resolved.markerFontWeight),
            resolved.fontFamily.takeIf { it.isNotEmpty() },
            context.assets,
          )
      }
    val marker = paint.measureText("9.") / context.resources.displayMetrics.density
    return style + ("list" to list + ("markerMinWidth" to margin + marker))
  }
}

/** Deep copy of a JavaScript object into React Native's Java-only readable types. */
fun readableMap(value: Map<*, *>): JavaOnlyMap {
  val map = JavaOnlyMap()
  for ((key, item) in value) {
    val name = key as? String ?: continue
    when (item) {
      null -> map.putNull(name)
      is Boolean -> map.putBoolean(name, item)
      is Number -> map.putDouble(name, item.toDouble())
      is String -> map.putString(name, item)
      is Map<*, *> -> map.putMap(name, readableMap(item))
      is List<*> -> map.putArray(name, readableArray(item))
    }
  }
  return map
}

fun readableArray(value: List<*>): JavaOnlyArray {
  val array = JavaOnlyArray()
  for (item in value) {
    when (item) {
      null -> array.pushNull()
      is Boolean -> array.pushBoolean(item)
      is Number -> array.pushDouble(item.toDouble())
      is String -> array.pushString(item)
      is Map<*, *> -> array.pushMap(readableMap(item))
      is List<*> -> array.pushArray(readableArray(item))
    }
  }
  return array
}
