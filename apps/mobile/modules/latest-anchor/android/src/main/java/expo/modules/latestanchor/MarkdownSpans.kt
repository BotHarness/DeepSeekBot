package expo.modules.latestanchor

import android.content.Context
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

  fun render(body: String, style: Map<String, Any?>): CharSequence? {
    if (style != source) {
      source = style
      config = StyleConfig(JavaOnlyMap.from(style), context, true, 0f)
    }
    val ast = Parser.shared.parseMarkdown(body, flags, true) ?: return null
    renderer.configure(config!!, context)
    return renderer.renderDocument(ast)
  }
}
