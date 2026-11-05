import ExpoModulesCore
import Foundation
import Network

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
      guard Self.privateAddress(address, port),
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
        if let error { self.finish(id, Self.failure("channel-send-failed", error)) }
      }
    }
    Function("close") { (id: String) in self.finish(id, "channel-disconnected") }
    AsyncFunction("localNetwork") { (address: String, port: Int, promise: Promise) in
      guard Self.privateAddress(address, port), let target = NWEndpoint.Port(rawValue: UInt16(port))
      else {
        promise.resolve("unknown")
        return
      }
      let connection = NWConnection(host: NWEndpoint.Host(address), port: target, using: .tcp)
      let queue = DispatchQueue(label: "lan-channel.local-network")
      var settled = false
      let settle = { (status: String) in
        guard !settled else { return }
        settled = true
        connection.cancel()
        promise.resolve(status)
      }
      let denied = { connection.currentPath?.unsatisfiedReason == .localNetworkDenied }
      connection.stateUpdateHandler = { state in
        switch state {
        case .ready: settle("reachable")
        case .waiting, .failed: settle(denied() ? "denied" : "unreachable")
        default: break
        }
      }
      connection.start(queue: queue)
      queue.asyncAfter(deadline: .now() + 1.5) { settle(denied() ? "denied" : "timeout") }
    }
    OnDestroy {
      self.lock.lock()
      let ids = Array(self.channels.keys)
      self.lock.unlock()
      ids.forEach { self.finish($0, "channel-disconnected") }
      self.session.invalidateAndCancel()
    }
  }

  private static func privateAddress(_ address: String, _ port: Int) -> Bool {
    let parts = address.split(separator: ".", omittingEmptySubsequences: false)
    let numbers = parts.compactMap { Int($0) }
    return parts.count == 4 && numbers.count == 4 &&
      parts.allSatisfy({ $0.count <= 3 && $0.allSatisfy({ $0.isASCII && $0.isNumber }) }) &&
      numbers.allSatisfy({ (0...255).contains($0) }) &&
      (numbers[0] == 10 || (numbers[0] == 172 && (16...31).contains(numbers[1])) ||
        (numbers[0] == 192 && numbers[1] == 168)) && (1...65535).contains(port)
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
      case .failure(let error): self.finish(id, Self.failure("lan-unreachable", error))
      default: self.finish(id, "channel-frame-invalid")
      }
    }
  }
  private static func failure(_ reason: String, _ error: Error) -> String {
    let ns = error as NSError
    let path = ns.userInfo["_NSURLErrorNWPathKey"].map { String(describing: $0) } ?? ""
    if path.localizedCaseInsensitiveContains("local network prohibited") {
      return "\(reason):local-network-denied"
    }
    if ns.domain == NSURLErrorDomain { return "\(reason):nsurl\(ns.code)" }
    if ns.domain == NSPOSIXErrorDomain { return "\(reason):posix\(ns.code)" }
    return reason
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
