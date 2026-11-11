package expo.modules.latestanchor

import android.app.Activity
import android.graphics.Color
import android.os.Looper
import android.view.View
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.bridge.BridgeReactContext
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import java.lang.ref.WeakReference
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], shadows = [TargetEventBridge::class], instrumentedPackages = ["expo.modules.kotlin.viewevent"])
class TextBubbleTest {
  private val style = mapOf<String, Any?>(
    "accent" to "#c0392b", "surface" to "rgba(240, 240, 244, 1)", "onAccent" to "#ffffff",
    "fg" to "#1b1b1f", "muted" to "#77777f",
    "bodySize" to 14.0, "bodyLine" to 20.0, "metaSize" to 12.0, "metaLine" to 16.0, "fontScale" to 1.0,
    "rowInset" to 12.0, "firstGap" to 12.0, "joinGap" to 2.0, "lastGap" to 4.0,
    "padX" to 16.0, "padY" to 10.0, "timeGap" to 8.0, "stackGap" to 4.0,
    "open" to 16.0, "join" to 8.0, "tail" to 8.0, "besideMax" to 60.0, "maxWidth" to 0.88,
  )
  private val tokens = TextRowStyle.from(style)!!

  @Test fun parsesCssColors() {
    assertEquals(Color.parseColor("#c0392b"), cssColor("#c0392b"))
    assertEquals(Color.argb(128, 1, 2, 3), cssColor("rgba(1, 2, 3, 0.5)"))
    assertEquals(Color.parseColor("#80112233"), cssColor("#11223380"))
    assertNull(cssColor("teal"))
  }

  @Test fun placesBubblesBySenderAndGroup() {
    val human = TextBubbleLayout(TextRow("h", true, true, true, "hello", "09:30 ✓"), tokens, 1200, 3f)
    val bot = TextBubbleLayout(TextRow("b", false, false, false, "hello", "09:30"), tokens, 1200, 3f)
    assertEquals(1200f - 36f, human.bubble.right, 0.5f)
    assertEquals(36f, bot.bubble.left, 0.5f)
    assertEquals(36f, human.bubble.top, 0.5f)
    assertEquals(6f, bot.bubble.top, 0.5f)
    assertEquals(kotlin.math.ceil(human.bubble.bottom + 12f).toInt(), human.height)
    assertTrue(bot.height >= bot.bubble.bottom.toInt())
  }

  @Test fun putsShortBotTimeBesideAndKeepsLongTextWithinTheBubbleWidth() {
    val short = TextBubbleLayout(TextRow("s", false, true, true, "short", "09:30"), tokens, 1200, 3f)
    val long = TextBubbleLayout(TextRow("l", false, true, true, "word ".repeat(80).trim(), "09:30"), tokens, 1200, 3f)
    assertEquals(1, short.paragraphs.single().lineCount)
    assertTrue(short.timeX > short.bubble.left + short.paragraphs.single().width)
    if (long.paragraphs.single().lineCount > 1) assertTrue(long.timeBaseline > long.bubble.top + long.paragraphs.single().height)
    assertTrue(long.bubble.width() <= (1200 - 72) * 0.88f + 0.5f)
  }

  @Test fun separatesBotParagraphsByTheMarkdownGap() {
    val gapped = tokens.copy(paragraphGap = 8f)
    val two = TextBubbleLayout(TextRow("p", false, true, true, "first\n\nsecond", "09:30"), gapped, 1200, 3f)
    val human = TextBubbleLayout(TextRow("q", true, true, true, "first\n\nsecond", "09:30"), gapped, 1200, 3f)
    assertEquals(2, two.paragraphs.size)
    assertEquals(1, human.paragraphs.size)
  }

  @Test fun recyclerDrawsTextRowsNativelyWithTheirOwnHeights() {
    val controller = Robolectric.buildActivity(Activity::class.java).setup().visible()
    val activity = controller.get()
    val react = BridgeReactContext(activity)
    val modules = object : ModulesProvider { override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap() }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val list = ChatRecyclerView(react, app)
    activity.setContentView(list)
    list.setTextStyle(style)
    list.setTextRows(listOf(mapOf("key" to "item:b", "human" to false, "first" to true, "last" to true, "body" to "plain", "time" to "09:30")))
    list.setRows(listOf("item:a", "item:b", "item:c"))
    list.measure(View.MeasureSpec.makeMeasureSpec(1200, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(2000, View.MeasureSpec.EXACTLY))
    list.layout(0, 0, 1200, 2000)
    shadowOf(Looper.getMainLooper()).idle()
    list.layout(0, 0, 1200, 2000)
    val recycler = list.getChildAt(0) as RecyclerView
    assertEquals(1, recycler.adapter!!.getItemViewType(1))
    assertEquals(0, recycler.adapter!!.getItemViewType(0))
    val holder = recycler.findViewHolderForAdapterPosition(1)!!
    val expected = TextBubbleLayout(TextRow("item:b", false, true, true, "plain", "09:30"), tokens, list.width, list.resources.displayMetrics.density).height
    assertEquals(expected, holder.itemView.layoutParams.height)
    controller.pause().stop().destroy()
  }
}
