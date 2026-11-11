package expo.modules.latestanchor

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.view.View
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** A committed plain-text DM message drawn natively instead of mounted as React views. */
data class TextRow(val key: String, val human: Boolean, val first: Boolean, val last: Boolean, val body: String, val time: String) {
  companion object {
    fun from(value: Map<String, Any?>): TextRow? {
      val key = value["key"] as? String ?: return null
      return TextRow(
        key,
        value["human"] == true,
        value["first"] == true,
        value["last"] == true,
        value["body"] as? String ?: return null,
        value["time"] as? String ?: "",
      )
    }
  }
}

/** Design tokens in logical pixels and CSS colors, as sent by JavaScript. */
data class TextRowStyle(
  val accent: Int, val surface: Int, val onAccent: Int, val fg: Int, val muted: Int,
  val bodySize: Float, val bodyLine: Float, val metaSize: Float, val metaLine: Float, val fontScale: Float,
  val rowInset: Float, val firstGap: Float, val joinGap: Float, val lastGap: Float,
  val padX: Float, val padY: Float, val timeGap: Float, val stackGap: Float,
  val open: Float, val join: Float, val tail: Float, val besideMax: Int, val maxWidth: Float,
) {
  companion object {
    fun from(value: Map<String, Any?>): TextRowStyle? {
      fun number(name: String) = (value[name] as? Number)?.toFloat()
      fun color(name: String) = (value[name] as? String)?.let(::cssColor)
      return TextRowStyle(
        color("accent") ?: return null, color("surface") ?: return null, color("onAccent") ?: return null,
        color("fg") ?: return null, color("muted") ?: return null,
        number("bodySize") ?: return null, number("bodyLine") ?: return null,
        number("metaSize") ?: return null, number("metaLine") ?: return null, number("fontScale") ?: 1f,
        number("rowInset") ?: 0f, number("firstGap") ?: 0f, number("joinGap") ?: 0f, number("lastGap") ?: 0f,
        number("padX") ?: 0f, number("padY") ?: 0f, number("timeGap") ?: 0f, number("stackGap") ?: 0f,
        number("open") ?: 0f, number("join") ?: 0f, number("tail") ?: 0f,
        number("besideMax")?.toInt() ?: 60, number("maxWidth") ?: 0.88f,
      )
    }
  }
}

fun cssColor(value: String): Int? {
  val text = value.trim()
  Regex("""rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)""").matchEntire(text)?.let { m ->
    val (r, g, b) = m.destructured
    val a = m.groupValues[4].ifEmpty { "1" }.toFloat()
    return Color.argb((a * 255).roundToInt(), r.toFloat().roundToInt(), g.toFloat().roundToInt(), b.toFloat().roundToInt())
  }
  if (!text.startsWith("#")) return null
  val hex = text.substring(1)
  val full = when (hex.length) {
    3, 4 -> hex.map { "$it$it" }.joinToString("")
    6, 8 -> hex
    else -> return null
  }
  val rgb = full.substring(0, 6).toLongOrNull(16) ?: return null
  val alpha = if (full.length == 8) full.substring(6, 8).toLongOrNull(16) ?: return null else 0xFF
  return ((alpha shl 24) or rgb).toInt()
}

/** Text layout, bubble geometry and row height for one row at one width, in physical pixels. */
class TextBubbleLayout(val row: TextRow, val tokens: TextRowStyle, val width: Int, density: Float) {
  private val scale = density * tokens.fontScale
  val body: StaticLayout
  val timePaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  val bubble: RectF
  val timeX: Float
  val timeBaseline: Float
  val height: Int
  val fill = if (row.human) tokens.accent else tokens.surface
  val radii: FloatArray
  private val textTop: Float
  private val textLeft: Float

  init {
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = tokens.bodySize * scale
      color = if (row.human) tokens.onAccent else tokens.fg
    }
    timePaint.textSize = tokens.metaSize * scale
    timePaint.color = if (row.human) tokens.onAccent else tokens.muted
    val line = tokens.bodyLine * scale
    val metaLine = tokens.metaLine * scale
    val padX = tokens.padX * density
    val padY = tokens.padY * density
    val gap = tokens.timeGap * density
    val inset = tokens.rowInset * density
    val inner = max(1, ((width - 2 * inset) * tokens.maxWidth - 2 * padX).toInt())
    val natural = ceil(Layout.getDesiredWidth(row.body, paint)).toInt()
    val spacing = line - paint.getFontMetricsInt(null)
    body = StaticLayout.Builder.obtain(row.body, 0, row.body.length, paint, max(1, min(natural, inner)))
      .setIncludePad(false)
      .setLineSpacing(spacing, 1f)
      .build()
    val textWidth = (0 until body.lineCount).maxOf { body.getLineWidth(it) }
    val lastWidth = body.getLineWidth(body.lineCount - 1)
    val timeWidth = timePaint.measureText(row.time)
    val textHeight = body.lineCount * line
    val beside = !row.human && body.lineCount == 1 && !row.body.contains('\n') &&
      row.body.length <= tokens.besideMax && textWidth + gap + timeWidth <= inner
    val contentWidth: Float
    val contentHeight: Float
    if (row.human) {
      val fits = lastWidth + gap + timeWidth <= inner
      contentWidth = if (fits) max(textWidth, lastWidth + gap + timeWidth) else max(textWidth, timeWidth)
      contentHeight = textHeight + if (fits) 0f else metaLine
    } else if (beside) {
      contentWidth = textWidth + gap + timeWidth
      contentHeight = max(line, metaLine)
    } else {
      contentWidth = max(textWidth, timeWidth)
      contentHeight = textHeight + tokens.stackGap * density + metaLine
    }
    val bubbleWidth = contentWidth + 2 * padX
    val bubbleHeight = contentHeight + 2 * padY
    val top = (if (row.first) tokens.firstGap else tokens.joinGap) * density
    val left = if (row.human) width - inset - bubbleWidth else inset
    bubble = RectF(left, top, left + bubbleWidth, top + bubbleHeight)
    timeX = bubble.right - padX - timeWidth
    timeBaseline = bubble.bottom - padY - timePaint.fontMetrics.descent
    height = ceil(bubble.bottom + (if (row.last) tokens.lastGap else 0f) * density).toInt()
    val open = tokens.open * density
    val join = tokens.join * density
    val tail = tokens.tail * density
    val (topLeft, topRight, bottomRight, bottomLeft) = if (row.human)
      listOf(open, if (row.first) open else join, if (row.last) tail else join, open)
    else
      listOf(if (row.first) open else join, open, open, if (row.last) tail else join)
    radii = floatArrayOf(topLeft, topLeft, topRight, topRight, bottomRight, bottomRight, bottomLeft, bottomLeft)
    textTop = bubble.top + padY
    textLeft = bubble.left + padX
  }

  private val path = Path()
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)

  fun draw(canvas: Canvas) {
    fillPaint.color = fill
    path.reset()
    path.addRoundRect(bubble, radii, Path.Direction.CW)
    canvas.drawPath(path, fillPaint)
    canvas.save()
    canvas.translate(textLeft, textTop)
    body.draw(canvas)
    canvas.restore()
    canvas.drawText(row.time, timeX, timeBaseline, timePaint)
  }
}

class TextBubbleView(context: Context) : View(context) {
  var layout: TextBubbleLayout? = null
    set(value) {
      field = value
      contentDescription = value?.let { "${it.row.body}, ${it.row.time.replace(' ', ' ')}" }
      invalidate()
    }
  init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES }
  override fun onDraw(canvas: Canvas) { layout?.draw(canvas) }
}
