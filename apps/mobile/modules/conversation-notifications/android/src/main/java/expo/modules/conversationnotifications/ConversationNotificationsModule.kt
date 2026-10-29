package expo.modules.conversationnotifications

import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import com.caverock.androidsvg.SVG
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ConversationNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ConversationNotifications")

    AsyncFunction("rasterizeSvgAsync") { svg: String, target: String, size: Int ->
      rasterize(svg, File(Uri.parse(target).path ?: target), size)
    }
  }
}

/**
 * Generated Bot avatars are SVG, which expo-image cannot load into a bitmap on Android, so the
 * avatar cache (src/host/native-notification-avatars.ts) has them drawn into a PNG here.
 */
fun rasterize(svg: String, target: File, size: Int) {
  val document = SVG.getFromString(svg)
  document.documentWidth = size.toFloat()
  document.documentHeight = size.toFloat()
  val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
  try {
    document.renderToCanvas(Canvas(bitmap))
    target.parentFile?.mkdirs()
    val temporary = File(target.parentFile, "${target.name}.tmp")
    temporary.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    if (!temporary.renameTo(target)) {
      temporary.delete()
      error("rasterize-write-failed")
    }
  } finally {
    bitmap.recycle()
  }
}
