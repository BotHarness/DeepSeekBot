package expo.modules.localcomputervideo

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class CallCameraFramesTest {
  @Test
  fun `portrait thumbnails keep the camera aspect ratio`() {
    assertEquals(64 to 114, CallCameraFrames.thumbnailSize(720, 1280, 64))
    assertEquals(1 to 1, CallCameraFrames.thumbnailSize(0, 0, 1))
    assertEquals(256 to 144, CallCameraFrames.thumbnailSize(1920, 1080, 512))
  }

  @Test
  fun `keyframes cap the long edge and keep small frames`() {
    assertEquals(720 to 1280, CallCameraFrames.scaledSize(720, 1280, 1280))
    assertEquals(1280 to 720, CallCameraFrames.scaledSize(1920, 1080, 1280))
    assertEquals(1280 to 720, CallCameraFrames.scaledSize(1280, 720, 1280))
  }

  @Test
  fun `grey samples the Y plane at the requested width`() {
    val y = byteArrayOf(0, 10, 20, 30, 40, 50, 60, 70)
    val grey = CallCameraFrames.grey(y, width = 4, height = 2, rowStride = 4, pixelStride = 1, targetWidth = 2)
    assertEquals(2, grey.width)
    assertEquals(1, grey.height)
    assertArrayEquals(byteArrayOf(0, 20), grey.bytes)
  }

  @Test
  fun `grey handles padded rows and chroma pixel stride`() {
    val y = byteArrayOf(1, 2, 0, 0, 3, 4, 0, 0)
    val grey = CallCameraFrames.grey(y, width = 2, height = 2, rowStride = 4, pixelStride = 1, targetWidth = 2)
    assertEquals(2, grey.width)
    assertEquals(2, grey.height)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), grey.bytes)
  }

  @Test
  fun `bounded jpeg stops at the first quality under the limit`() {
    val tried = mutableListOf<Int>()
    val data = CallCameraFrames.boundedJpeg(10) { quality ->
      tried += quality
      if (quality == 60) ByteArray(8) else ByteArray(20)
    }
    assertArrayEquals(ByteArray(8), data)
    assertEquals(listOf(80, 60), tried)
  }

  @Test
  fun `bounded jpeg refuses a frame that stays over the limit`() {
    val tried = mutableListOf<Int>()
    val data = CallCameraFrames.boundedJpeg(4) { quality ->
      tried += quality
      ByteArray(8)
    }
    assertEquals(null, data)
    assertEquals(listOf(80, 60, 45), tried)
  }

  @Test
  fun `bounded jpeg skips an encoder that returns nothing`() {
    val data = CallCameraFrames.boundedJpeg(8) { quality ->
      if (quality == 80) null else ByteArray(8)
    }
    assertArrayEquals(ByteArray(8), data)
  }

  @Test
  fun `nv21 interleaves V then U and drops row padding`() {
    val y = ByteArray(16) { (it + 1).toByte() }
    val u = byteArrayOf(10, 0, 11, 0, 12, 0, 13, 0)
    val v = byteArrayOf(20, 0, 21, 0, 22, 0, 23, 0)
    val frame = CallCameraFrames.nv21(
      y,
      u,
      v,
      width = 4,
      height = 4,
      yRowStride = 4,
      yPixelStride = 1,
      uRowStride = 4,
      uPixelStride = 2,
      vRowStride = 4,
      vPixelStride = 2,
    )
    assertArrayEquals(
      byteArrayOf(
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
        20, 10, 21, 11, 22, 12, 23, 13,
      ),
      frame,
    )
  }
}
