import ExpoModulesCore
import Foundation

private final class LanSessionDelegate: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

public final class LanChannelModule: Module {
  private var channels: [String: URLSessionWebSocketTask] = [:]
  private let lock = NSLock()
  private let delegate = LanSessionDelegate()
  private var queued: [String: Int] = [:]
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = nil
    config.httpShouldSetCookies = false
    config.urlCredentialStorage = nil
    config.timeoutIntervalForRequest = 10
    config.connectionProxyDictionary = [:]
    return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
  }()

  public func definition() -> ModuleDefinition {
    Name("LanChannel")
    Events("channel")
    Function("open") { (id: String, address: String, port: Int) in
      let parts = address.split(separator: ".", omittingEmptySubsequences: false)
      let numbers = parts.compactMap { Int($0) }
      guard parts.count == 4, numbers.count == 4,
        parts.allSatisfy({ $0.count <= 3 && $0.allSatisfy({ $0.isASCII && $0.isNumber }) }),
        numbers.allSatisfy({ (0...255).contains($0) }),
        (numbers[0] == 10 || (numbers[0] == 172 && (16...31).contains(numbers[1])) ||
          (numbers[0] == 192 && numbers[1] == 168)), (1...65535).contains(port),
        let url = URL(string: "ws://\(address):\(port)/botharness-device/channel")
      else { throw NSError(domain: "lan-route-invalid", code: 1) }
      self.lock.lock()
      guard self.channels.count < 8, self.channels[id] == nil else {
        self.lock.unlock()
        throw NSError(domain: "channel-busy", code: 1)
      }
      let socket = self.session.webSocketTask(with: url)
      socket.maximumMessageSize = 70_000
      self.channels[id] = socket
      self.queued[id] = 0
      self.lock.unlock()
      socket.resume()
      // send() queues until the WebSocket upgrade completes; no application data precedes Noise.
      self.emit(id, "open")
      self.receive(id, socket)
    }
    Function("send") { (id: String, text: String) in
      guard self.valid(text), let socket = self.socket(id) else {
        throw NSError(domain: "channel-frame-invalid", code: 1)
      }
      self.lock.lock()
      let size = (self.queued[id] ?? 0) + text.utf8.count
      if size > 20 * 1024 * 1024 {
        self.lock.unlock()
        self.finish(id, "channel-busy")
        throw NSError(domain: "channel-busy", code: 1)
      }
      self.queued[id] = size
      self.lock.unlock()
      socket.send(.string(text)) { error in
        self.lock.lock()
        if let pending = self.queued[id] { self.queued[id] = pending - text.utf8.count }
        self.lock.unlock()
        if error != nil { self.finish(id, "channel-send-failed") }
      }
    }
    Function("close") { (id: String) in self.finish(id, "channel-disconnected") }
    OnDestroy {
      self.lock.lock()
      let ids = Array(self.channels.keys)
      self.lock.unlock()
      ids.forEach { self.finish($0, "channel-disconnected") }
      self.session.invalidateAndCancel()
    }
  }

  private func socket(_ id: String) -> URLSessionWebSocketTask? {
    lock.lock()
    defer { lock.unlock() }
    return channels[id]
  }
  private func valid(_ text: String) -> Bool {
    let bytes = text.utf8
    return (3...70_000).contains(bytes.count) && bytes.count % 2 == 1 &&
      (bytes.first == 104 || bytes.first == 100) &&
      bytes.dropFirst().allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
  }
  private func receive(_ id: String, _ socket: URLSessionWebSocketTask) {
    socket.receive { result in
      guard self.socket(id) === socket else { return }
      switch result {
      case .success(.string(let text)) where self.valid(text):
        self.emit(id, "message", text)
        self.receive(id, socket)
      default: self.finish(id, "lan-unreachable")
      }
    }
  }
  private func emit(_ id: String, _ type: String, _ text: String = "") {
    sendEvent("channel", ["id": id, "type": type, "text": text])
  }
  private func finish(_ id: String, _ reason: String) {
    lock.lock()
    let socket = channels.removeValue(forKey: id)
    queued.removeValue(forKey: id)
    lock.unlock()
    guard let socket else { return }
    socket.cancel(with: .goingAway, reason: nil)
    emit(id, "closed", reason)
  }
}
