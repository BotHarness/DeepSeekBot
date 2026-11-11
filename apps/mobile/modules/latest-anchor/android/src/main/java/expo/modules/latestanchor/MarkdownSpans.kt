package expo.modules.latestanchor

import android.content.Context
import com.facebook.react.bridge.JavaOnlyArray
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
  private var config: StyleConfig? = null
  private val renderer = Renderer()
  private val flags = Md4cFlags(latexMath = false)

  fun render(body: String, style: Map<String, Any?>): CharSequence? =
    try {
      if (style != source) {
        config = StyleConfig(readableMap(style), context, true, 0f)
        source = style
      }
      Parser.shared.parseMarkdown(body, flags, true)?.let { ast ->
        renderer.configure(config!!, context)
        renderer.renderDocument(ast)
      }
    } catch (error: Throwable) {
      android.util.Log.w("ChatRecycler", "Native Markdown row fell back to plain text", error)
      null
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
