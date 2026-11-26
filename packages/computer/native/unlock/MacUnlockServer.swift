import ApplicationServices
import CryptoKit
import Foundation
import Security

struct MacUnlockRequest: Decodable {
  let token: Data
  let kind: String
  var host: String?
  var device: String?
  var operation: UnlockOperation?
  var packet: Data?
}

struct MacUnlockReply: Encodable {
  let code: String
  var locked: Bool?
  var offer: Data?
  var receipt: Data?
}

struct UnlockChallenges {
  private struct Entry {
    let challenge: UnlockChallenge
    let bytes: Data
    let deadline: TimeInterval
  }

  private var entries: [UUID: Entry] = [:]

  mutating func issue(host: String, device: String, operation: UnlockOperation, key: SecKey,
    now: TimeInterval) throws -> Data {
    entries = entries.filter { $0.value.deadline > now }
    guard entries.count < 16 else { throw UnlockFailure.busy }
    let value = UnlockChallenge(version: 1, id: UUID(), host: host, device: device, operation: operation,
      key: try unlockPublicKey(key))
    let bytes = try JSONEncoder().encode(value)
    guard let signature = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, bytes as CFData, nil) as Data?
    else { throw UnlockFailure.unavailable }
    entries[value.id] = Entry(challenge: value, bytes: bytes, deadline: now + 90)
    return try JSONEncoder().encode(SignedUnlockChallenge(challenge: bytes, signature: signature))
  }

  mutating func consume(_ request: SealedUnlockRequest, host: String, device: String, operation: UnlockOperation,
    now: TimeInterval) throws -> Data {
    guard let entry = entries[request.id], entry.deadline > now,
      entry.challenge.host == host, entry.challenge.device == device, entry.challenge.operation == operation
    else { throw UnlockFailure.expired }
    entries.removeValue(forKey: request.id)
    return entry.bytes
  }
}

@MainActor
final class MacUnlockServer {
  private let token: Data
  private let directory: URL
  private var key: SecKey?
  private var challenges = UnlockChallenges()
  private var lastAttempt: TimeInterval?
  private var failedAttempts: [TimeInterval] = []
  private var busy = false

  init(token: Data, directory: URL) {
    self.token = token
    self.directory = directory
  }

  func handle(_ request: MacUnlockRequest, current: () throws -> Void) async -> MacUnlockReply {
    do {
      try current()
      guard token.count == request.token.count,
        zip(token, request.token).reduce(UInt8(0), { $0 | ($1.0 ^ $1.1) }) == 0
      else { throw UnlockFailure.invalid }
      let account = try MacSystemAccount.current()
      let state = try MacConsoleState.read(account: account)
      if request.kind == "status" && !AXIsProcessTrusted() {
        return MacUnlockReply(code: UnlockFailure.accessibilityRequired.rawValue, locked: state.locked)
      }
      guard AXIsProcessTrusted() else { throw UnlockFailure.accessibilityRequired }
      let key = try key ?? MacUnlockIdentity.load(directory: directory, allowCreation: !state.locked)
      self.key = key
      if request.kind == "status" { return MacUnlockReply(code: "ready", locked: state.locked) }
      guard let host = request.host, let device = request.device, let operation = request.operation,
        (1...128).contains(host.utf8.count), (1...128).contains(device.utf8.count)
      else { throw UnlockFailure.invalid }
      guard state.locked == (operation == .unlock) else { throw UnlockFailure.unlockUnavailable }
      guard !busy else { throw UnlockFailure.busy }
      let now = ProcessInfo.processInfo.systemUptime
      if request.kind == "begin" {
        let offer = try challenges.issue(host: host, device: device, operation: operation, key: key, now: now)
        return MacUnlockReply(code: "ready", offer: offer)
      }
      guard request.kind == "finish", let packet = request.packet, packet.count <= 4096 else { throw UnlockFailure.invalid }
      let sealed = try JSONDecoder().decode(SealedUnlockRequest.self, from: packet)
      let challenge = try challenges.consume(sealed, host: host, device: device, operation: operation, now: now)
      let keys = try UnlockKeys(privateKey: key, publicKey: sealed.key, challenge: challenge)
      let password = try AES.GCM.open(AES.GCM.SealedBox(combined: sealed.sealed), using: keys.request, authenticating: challenge)
      failedAttempts.removeAll { now - $0 >= 300 }
      guard failedAttempts.count < 5, lastAttempt.map({ now - $0 >= 3 }) ?? true
      else { throw UnlockFailure.limited }
      try current()
      lastAttempt = now
      busy = true
      defer { busy = false }
      do {
        try account.verify(password)
        failedAttempts.removeAll()
      } catch UnlockFailure.passwordRejected {
        failedAttempts.append(now)
        throw UnlockFailure.passwordRejected
      }
      try current()
      if operation == .unlock {
        try await MacScreenUnlocker.shared.unlock(account: account, password: password, current: current)
      }
      let receipt = try AES.GCM.seal(Data("ok".utf8), using: keys.receipt, authenticating: challenge)
      return MacUnlockReply(code: "ok", receipt: receipt.combined)
    } catch let error as UnlockFailure {
      return MacUnlockReply(code: error.rawValue)
    } catch {
      return MacUnlockReply(code: UnlockFailure.invalid.rawValue)
    }
  }
}
