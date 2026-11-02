package expo.modules.lanchannel

import java.io.ByteArrayInputStream
import java.io.IOException
import org.junit.Assert.*
import org.junit.Test

class BoundedChannelInputTest {
  private val upgrade = "HTTP/1.1 101 Switching Protocols\r\n\r\n".toByteArray()
  private fun read(vararg frames: ByteArray): ByteArray = BoundedChannelInput(
    ByteArrayInputStream(upgrade + frames.reduce { first, next -> first + next })
  ).readBytes()

  @Test fun acceptsBoundedTextWithFragmentationAndPing() {
    val frames = byteArrayOf(1, 2, 100, 97, 137.toByte(), 0, 128.toByte(), 1, 98)
    assertArrayEquals(upgrade + frames, read(frames))
  }

  @Test fun refusesDeclaredLengthBeforeReadingPayload() {
    assertThrows(IOException::class.java) {
      read(byteArrayOf(129.toByte(), 127, 0, 0, 0, 0, 0, 1, 17, 113))
    }
  }

  @Test fun refusesAggregateFragmentsAndFragmentCount() {
    val first = byteArrayOf(1, 126, 0x9c.toByte(), 0x40) + ByteArray(40_000)
    val second = byteArrayOf(128.toByte(), 126, 0x9c.toByte(), 0x40)
    assertThrows(IOException::class.java) { read(first, second) }
    assertThrows(IOException::class.java) { read(byteArrayOf(1, 0), *Array(1024) { byteArrayOf(0, 0) }) }
  }

  @Test fun refusesBinaryCompressionAndOversizedUpgrade() {
    for (frame in listOf(byteArrayOf(130.toByte(), 0), byteArrayOf(193.toByte(), 0))) {
      assertThrows(IOException::class.java) { read(frame) }
    }
    assertThrows(IOException::class.java) { BoundedChannelInput(ByteArrayInputStream(ByteArray(8193))).readBytes() }
  }
}
