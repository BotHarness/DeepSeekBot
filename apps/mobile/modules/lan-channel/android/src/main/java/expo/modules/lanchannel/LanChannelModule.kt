package expo.modules.lanchannel

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.ConnectionPool
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.net.InetAddress
import java.net.Proxy
import java.net.Socket
import javax.net.SocketFactory
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

private const val CARRIER_HOST = "encrypted-lan.invalid"
private const val CHANNEL_PATH = "/botharness-device/channel"
private const val FRAME_LIMIT = 70_000

class LanChannelModule : Module() {
  private data class Channel(val client: OkHttpClient, var socket: WebSocket? = null)
  private val channels = ConcurrentHashMap<String, Channel>()

  override fun definition() = ModuleDefinition {
    Name("LanChannel")
    Events("channel")

    Function("open") { id: String, address: String, port: Int ->
      require(port in 1..65535 && channels.size < 8 && !channels.containsKey(id)) { "lan-route-invalid" }
      val bytes = privateAddress(address)
      val client = OkHttpClient.Builder()
        .socketFactory(object : SocketFactory() {
          override fun createSocket(): Socket = object : Socket() {
            private val bounded by lazy { BoundedChannelInput(super.getInputStream()) }
            override fun getInputStream() = bounded
          }
          override fun createSocket(host: String, port: Int): Socket = error("lan-route-invalid")
          override fun createSocket(host: String, port: Int, local: InetAddress, localPort: Int): Socket = error("lan-route-invalid")
          override fun createSocket(host: InetAddress, port: Int): Socket = error("lan-route-invalid")
          override fun createSocket(host: InetAddress, port: Int, local: InetAddress, localPort: Int): Socket = error("lan-route-invalid")
        })
        .proxy(Proxy.NO_PROXY)
        .dns(Dns { hostname ->
          require(hostname == CARRIER_HOST) { "lan-route-invalid" }
          listOf(InetAddress.getByAddress(bytes))
        })
        .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS))
        .followRedirects(false).followSslRedirects(false)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()
      val channel = Channel(client)
      channels[id] = channel
      channel.socket = client.newWebSocket(
        Request.Builder().url("ws://$CARRIER_HOST:$port$CHANNEL_PATH").build(),
        object : WebSocketListener() {
          override fun onOpen(socket: WebSocket, response: Response) {
            if (channels[id] !== channel) socket.cancel()
            else emit(id, "open")
          }
          override fun onMessage(socket: WebSocket, text: String) {
            if (!validFrame(text)) finish(id, "channel-frame-invalid")
            else if (channels[id] === channel) emit(id, "message", text)
          }
          override fun onMessage(socket: WebSocket, bytes: okio.ByteString) { finish(id, "channel-frame-invalid") }
          override fun onClosing(socket: WebSocket, code: Int, reason: String) { finish(id, "channel-disconnected") }
          override fun onFailure(socket: WebSocket, error: Throwable, response: Response?) { finish(id, "lan-unreachable") }
          override fun onClosed(socket: WebSocket, code: Int, reason: String) { finish(id, "channel-disconnected") }
        }
      )
      if (channels[id] !== channel) channel.socket?.cancel()
    }
    Function("send") { id: String, text: String ->
      val socket = channels[id]?.socket ?: error("channel-disconnected")
      require(validFrame(text)) { "channel-frame-invalid" }
      if (socket.queueSize() + text.length > 20 * 1024 * 1024 || !socket.send(text)) {
        finish(id, "channel-busy")
        error("channel-busy")
      }
    }
    Function("close") { id: String -> finish(id, "channel-disconnected") }
    OnDestroy { channels.keys.toList().forEach { finish(it, "channel-disconnected") } }
  }

  private fun emit(id: String, type: String, text: String = "") {
    sendEvent("channel", mapOf("id" to id, "type" to type, "text" to text))
  }

  private fun finish(id: String, reason: String) {
    val channel = channels.remove(id) ?: return
    channel.socket?.cancel()
    channel.client.connectionPool.evictAll()
    channel.client.dispatcher.executorService.shutdown()
    emit(id, "closed", reason)
  }
}

internal fun validFrame(text: String): Boolean =
  text.length in 3..FRAME_LIMIT && text.length % 2 == 1 &&
    (text[0] == 'h' || text[0] == 'd') && text.drop(1).all { it in '0'..'9' || it in 'a'..'f' }

internal fun privateAddress(address: String): ByteArray {
  val parts = address.split('.')
  require(parts.size == 4 && parts.all { it.matches(Regex("[0-9]{1,3}")) }) { "lan-route-invalid" }
  val numbers = parts.map { it.toInt() }
  require(numbers.all { it in 0..255 } &&
    (numbers[0] == 10 || (numbers[0] == 172 && numbers[1] in 16..31) ||
      (numbers[0] == 192 && numbers[1] == 168))) { "lan-route-invalid" }
  return numbers.map { it.toByte() }.toByteArray()
}
