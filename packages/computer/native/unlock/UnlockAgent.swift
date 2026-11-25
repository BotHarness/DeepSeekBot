import Darwin
import Foundation

private let maximumRequestBytes = 8192

private struct UnlockConnection: Sendable {
  let fd: Int32

  func current() throws {
    var probe = UInt8(0)
    let result = recv(fd, &probe, 1, MSG_PEEK | MSG_DONTWAIT)
    guard result == -1, errno == EAGAIN || errno == EWOULDBLOCK else { throw UnlockFailure.cancelled }
  }

  func read() throws -> MacUnlockRequest {
    var timeout = timeval(tv_sec: 2, tv_usec: 0)
    guard setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size)) == 0
    else { throw UnlockFailure.invalid }
    var bytes = Data()
    var buffer = [UInt8](repeating: 0, count: 1024)
    while bytes.count < maximumRequestBytes {
      let count = recv(fd, &buffer, min(buffer.count, maximumRequestBytes - bytes.count), 0)
      guard count > 0 else { throw UnlockFailure.invalid }
      bytes.append(contentsOf: buffer.prefix(count))
      if bytes.last == 10 {
        guard bytes.firstIndex(of: 10) == bytes.count - 1 else { throw UnlockFailure.invalid }
        return try JSONDecoder().decode(MacUnlockRequest.self, from: bytes)
      }
    }
    throw UnlockFailure.invalid
  }

  func reply(_ result: MacUnlockReply) {
    guard var bytes = try? JSONEncoder().encode(result) else { return }
    bytes.append(10)
    bytes.withUnsafeBytes { data in
      guard let address = data.baseAddress else { return }
      var offset = 0
      while offset < data.count {
        let count = send(fd, address.advanced(by: offset), data.count - offset, MSG_DONTWAIT)
        guard count > 0 else { return }
        offset += count
      }
    }
  }
}

@main
enum UnlockAgent {
  @MainActor
  static func main() async {
    do {
      do { try MacUnlockIdentity.requireLaunchAgent() } catch { exit(EX_NOPERM) }
      var limit = rlimit(rlim_cur: 0, rlim_max: 0)
      guard setrlimit(RLIMIT_CORE, &limit) == 0 else { exit(EX_OSERR) }
      guard CommandLine.arguments.count == 3 else { exit(EX_USAGE) }
      let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
      let token = try Data(contentsOf: directory.appendingPathComponent("ipc-token"))
      guard token.count == 32 else { exit(EX_CONFIG) }
      var service: mach_port_t = 0
      guard botharness_unlock_check_in(&service) == KERN_SUCCESS
      else { exit(EX_UNAVAILABLE) }
      let listener = try listen(at: CommandLine.arguments[2])
      let server = MacUnlockServer(token: token, directory: directory)
      DispatchQueue.global(qos: .userInitiated).async { acceptConnections(listener, server: server) }
      await withUnsafeContinuation { (_: UnsafeContinuation<Void, Never>) in }
    } catch {
      exit(EX_NOINPUT)
    }
  }

  private static func listen(at path: String) throws -> Int32 {
    var address = sockaddr_un()
    let bytes = path.utf8CString
    guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { throw UnlockFailure.invalid }
    address.sun_family = sa_family_t(AF_UNIX)
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: bytes.map { UInt8(bitPattern: $0) }) }

    var existing = stat()
    if lstat(path, &existing) == 0 {
      guard existing.st_uid == getuid(), existing.st_mode & S_IFMT == S_IFSOCK, unlink(path) == 0
      else { throw UnlockFailure.unavailable }
    } else if errno != ENOENT {
      throw UnlockFailure.unavailable
    }
    umask(0o177)
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { throw UnlockFailure.unavailable }
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard bound == 0, Darwin.listen(fd, 8) == 0 else {
      close(fd)
      throw UnlockFailure.unavailable
    }
    return fd
  }

  private static func acceptConnections(_ listener: Int32, server: MacUnlockServer) {
    let slots = DispatchSemaphore(value: 8)
    while true {
      let fd = accept(listener, nil, nil)
      if fd < 0 {
        if errno == EINTR { continue }
        exit(EX_OSERR)
      }
      var uid: uid_t = 0
      var gid: gid_t = 0
      var enabled: Int32 = 1
      guard getpeereid(fd, &uid, &gid) == 0, uid == getuid(),
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &enabled, socklen_t(MemoryLayout<Int32>.size)) == 0,
        slots.wait(timeout: .now()) == .success
      else {
        close(fd)
        continue
      }
      let connection = UnlockConnection(fd: fd)
      DispatchQueue.global(qos: .userInitiated).async {
        guard let request = try? connection.read() else {
          close(fd)
          slots.signal()
          return
        }
        Task { @MainActor in
          let result = await server.handle(request, current: connection.current)
          connection.reply(result)
          close(fd)
          slots.signal()
        }
      }
    }
  }
}
