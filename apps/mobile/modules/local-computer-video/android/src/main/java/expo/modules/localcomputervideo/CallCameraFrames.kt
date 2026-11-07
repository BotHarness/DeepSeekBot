package expo.modules.localcomputervideo

import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Pure frame math for the call camera. Kept free of Android types so the JVM tests can
 * check the thumbnail, scaling and NV21 conversion without a device or Robolectric.
 */
internal object CallCameraFrames {
  data class Grey(val bytes: ByteArray, val width: Int, val height: Int)

  /** iOS tries the same qualities before giving up on a keyframe. */
  val jpegQualities = intArrayOf(80, 60, 45)

  /** The first encoded frame within [maxBytes], or null when every quality is too large. */
  fun boundedJpeg(maxBytes: Int, encode: (Int) -> ByteArray?): ByteArray? {
    for (quality in jpegQualities) {
      val data = encode(quality) ?: continue
      if (data.isNotEmpty() && data.size <= maxBytes) return data
    }
    return null
  }

  /** The grey thumbnail keeps the source aspect ratio at [targetWidth] pixels wide. */
  fun thumbnailSize(width: Int, height: Int, targetWidth: Int): Pair<Int, Int> {
    val sourceWidth = width.coerceAtLeast(1)
    val sourceHeight = height.coerceAtLeast(1)
    val outWidth = targetWidth.coerceIn(1, 256)
    val outHeight = ((sourceHeight.toDouble() / sourceWidth) * outWidth).roundToInt().coerceAtLeast(1)
    return outWidth to outHeight
  }

  /** The keyframe long edge is capped; smaller frames keep their own size. */
  fun scaledSize(width: Int, height: Int, maxLongEdge: Int): Pair<Int, Int> {
    val longEdge = max(width, height)
    if (longEdge <= maxLongEdge) return width to height
    val scale = maxLongEdge.toDouble() / longEdge
    return (width * scale).roundToInt().coerceAtLeast(1) to
      (height * scale).roundToInt().coerceAtLeast(1)
  }

  /** Nearest-neighbour grey thumbnail sampled from the Y plane. */
  fun grey(
    y: ByteArray,
    width: Int,
    height: Int,
    rowStride: Int,
    pixelStride: Int,
    targetWidth: Int,
  ): Grey {
    val (outWidth, outHeight) = thumbnailSize(width, height, targetWidth)
    val pixels = ByteArray(outWidth * outHeight)
    for (row in 0 until outHeight) {
      val sourceY = (row.toLong() * height / outHeight).toInt().coerceIn(0, height - 1)
      val rowStart = sourceY * rowStride
      for (column in 0 until outWidth) {
        val sourceX = (column.toLong() * width / outWidth).toInt().coerceIn(0, width - 1)
        pixels[row * outWidth + column] = y[rowStart + sourceX * pixelStride]
      }
    }
    return Grey(pixels, outWidth, outHeight)
  }

  /** NV21 is the Y plane followed by interleaved V and U chroma samples. */
  fun nv21(
    y: ByteArray,
    u: ByteArray,
    v: ByteArray,
    width: Int,
    height: Int,
    yRowStride: Int,
    yPixelStride: Int,
    uRowStride: Int,
    uPixelStride: Int,
    vRowStride: Int,
    vPixelStride: Int,
  ): ByteArray {
    val chromaWidth = (width + 1) / 2
    val chromaHeight = (height + 1) / 2
    val frame = ByteArray(width * height + 2 * chromaWidth * chromaHeight)
    if (yPixelStride == 1 && yRowStride == width) {
      System.arraycopy(y, 0, frame, 0, width * height)
    } else {
      for (row in 0 until height) {
        val source = row * yRowStride
        val target = row * width
        for (column in 0 until width) {
          frame[target + column] = y[source + column * yPixelStride]
        }
      }
    }
    var offset = width * height
    for (row in 0 until chromaHeight) {
      val uRow = row * uRowStride
      val vRow = row * vRowStride
      for (column in 0 until chromaWidth) {
        frame[offset++] = v[vRow + column * vPixelStride]
        frame[offset++] = u[uRow + column * uPixelStride]
      }
    }
    return frame
  }
}
