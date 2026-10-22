package expo.modules.lanchannel

import java.io.IOException
import java.io.InputStream

internal class BoundedChannelInput(private val source: InputStream) : InputStream() {
  private var upgraded = false
  private var headerBytes = 0
  private var delimiter = 0
  private val header = ByteArray(10)
  private var headerSize = 0
  private var headerTarget = 2
  private var remaining = 0L
  private var messageBytes = 0L
  private var fragments = 0
  private var fragmented = false

  override fun read(): Int {
    val value = source.read()
    if (value >= 0) accept(value)
    return value
  }

  override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
    val count = source.read(buffer, offset, minOf(length, 8192))
    for (index in offset until offset + maxOf(count, 0)) accept(buffer[index].toInt() and 255)
    return count
  }

  override fun close() = source.close()

  private fun accept(value: Int) {
    if (!upgraded) {
      if (++headerBytes > 8192) refuse()
      delimiter = (delimiter shl 8) or value
      if (delimiter == 0x0d0a0d0a) upgraded = true
      return
    }
    if (remaining > 0) {
      remaining--
      return
    }
    header[headerSize++] = value.toByte()
    if (headerSize == 2) {
      val length = value and 127
      headerTarget = when (length) { 126 -> 4; 127 -> 10; else -> 2 }
    }
    if (headerSize != headerTarget) return
    val first = header[0].toInt() and 255
    val opcode = first and 15
    val final = first and 128 != 0
    if (first and 112 != 0 || header[1].toInt() and 128 != 0) refuse()
    var length = (header[1].toInt() and 127).toLong()
    if (length >= 126) {
      length = 0
      for (index in 2 until headerTarget) {
        length = (length shl 8) or (header[index].toLong() and 255)
        if (length > 70_000) refuse()
      }
    }
    when (opcode) {
      1 -> {
        if (fragmented) refuse()
        messageBytes = length
        fragments = 1
        fragmented = !final
      }
      0 -> {
        if (!fragmented || ++fragments > 1024) refuse()
        messageBytes += length
        fragmented = !final
      }
      8, 9, 10 -> if (!final || length > 125) refuse()
      else -> refuse()
    }
    if (messageBytes > 70_000) refuse()
    remaining = length
    headerSize = 0
    headerTarget = 2
  }

  private fun refuse(): Nothing = throw IOException("channel-frame-invalid")
}
