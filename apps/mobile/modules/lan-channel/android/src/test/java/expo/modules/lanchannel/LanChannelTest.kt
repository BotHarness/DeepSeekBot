package expo.modules.lanchannel

import org.junit.Assert.*
import org.junit.Test

class LanChannelTest {
  @Test fun acceptsOnlyPrivateIpv4WithoutDns() {
    assertArrayEquals(byteArrayOf(192.toByte(), 168.toByte(), 1, 20), privateAddress("192.168.1.20"))
    for (address in listOf("127.0.0.1", "8.8.8.8", "169.254.169.254", "172.32.1.1", "10.0.0.256", "host.local", "::1", "1.2.3")) {
      assertThrows(IllegalArgumentException::class.java) { privateAddress(address) }
    }
  }
  @Test fun refusesRawMessagesAndOversizedFrames() {
    assertTrue(validFrame("h" + "ab".repeat(48)))
    assertTrue(validFrame("d" + "ab".repeat(64)))
    for (frame in listOf("Device token", "{\"text\":\"private\"}", "hzz", "daa0", "d" + "ab".repeat(35_000))) {
      assertFalse(validFrame(frame))
    }
  }
}
