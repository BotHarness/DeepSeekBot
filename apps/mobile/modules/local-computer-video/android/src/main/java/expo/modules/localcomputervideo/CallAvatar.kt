package expo.modules.localcomputervideo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import java.io.File

/**
 * The Bot's avatar for the call notification and the over-other-apps bubble (#3804): the
 * PNG the app already caches for message notifications, cropped to a circle. The notice
 * is re-sent on every call phase, so the last decode is kept until the file changes.
 * Main thread only.
 */
object CallAvatar {
  private var key: String? = null
  private var cached: Bitmap? = null

  fun load(context: Context, path: String?): Bitmap? {
    val file = CallAvatarFiles.resolve(File(context.filesDir, CallAvatarFiles.ROOT), path)
    if (file == null) {
      key = null
      cached = null
      return null
    }
    val next = "${file.path}:${file.lastModified()}:${file.length()}"
    if (next == key) return cached
    key = next
    cached = runCatching { BitmapFactory.decodeFile(file.path)?.let(::circle) }.getOrNull()
    return cached
  }

  private fun circle(source: Bitmap): Bitmap {
    val size = minOf(source.width, source.height)
    val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
      shader = BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
        val matrix = android.graphics.Matrix()
        matrix.setTranslate(-(source.width - size) / 2f, -(source.height - size) / 2f)
        setLocalMatrix(matrix)
      }
    }
    Canvas(output).drawCircle(size / 2f, size / 2f, size / 2f, paint)
    return output
  }
}
