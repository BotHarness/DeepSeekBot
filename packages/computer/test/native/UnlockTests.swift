import ApplicationServices
import CryptoKit
import Foundation
import Security

@main
enum UnlockTests {
  @MainActor
  static func main() async throws {
    try wire()
    try selection()
    try await submission()
  }

  static func wire() throws {
    let attributes = [kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeySizeInBits: 256] as CFDictionary
    guard let agent = SecKeyCreateRandomKey(attributes, nil),
      let phone = SecKeyCreateRandomKey(attributes, nil),
      let replacement = SecKeyCreateRandomKey(attributes, nil)
    else { throw UnlockFailure.unavailable }
    var store = UnlockChallenges()
    let encoded = try store.issue(host: "mac", device: "iphone", operation: .unlock, key: agent, now: 10)
    let signed = try JSONDecoder().decode(SignedUnlockChallenge.self, from: encoded)
    let challenge = try signed.verified(host: "mac", device: "iphone", operation: .unlock, pin: nil)
    let oldPin = try unlockPublicKey(agent)
    let changed = try store.issue(host: "mac", device: "iphone", operation: .unlock, key: replacement, now: 11)
    let changedOffer = try JSONDecoder().decode(SignedUnlockChallenge.self, from: changed)
    fails(.keyChanged) {
      _ = try changedOffer.verified(host: "mac", device: "iphone", operation: .unlock, pin: oldPin)
    }
    fails(.invalid) {
      _ = try signed.verified(host: "mac", device: "other", operation: .unlock, pin: oldPin)
    }
    let input = Data("fixture".utf8)
    let keys = try UnlockKeys(privateKey: phone, publicKey: challenge.key, challenge: signed.challenge)
    let sealed = try AES.GCM.seal(input, using: keys.request, authenticating: signed.challenge)
    let phoneKey = try unlockPublicKey(phone)
    let packet = SealedUnlockRequest(id: challenge.id, key: phoneKey, sealed: sealed.combined!)
    fails(.expired) { _ = try store.consume(packet, host: "mac", device: "other", operation: .unlock, now: 11) }
    fails(.expired) { _ = try store.consume(packet, host: "mac", device: "iphone", operation: .verify, now: 11) }
    let consumed = try store.consume(packet, host: "mac", device: "iphone", operation: .unlock, now: 11)
    let hostKeys = try UnlockKeys(privateKey: agent, publicKey: packet.key, challenge: consumed)
    let decoded = try AES.GCM.open(sealed, using: hostKeys.request, authenticating: consumed)
    precondition(decoded == input)
    let receipt = try AES.GCM.seal(Data("ok".utf8), using: hostKeys.receipt, authenticating: consumed)
    let confirmation = try AES.GCM.open(receipt, using: keys.receipt, authenticating: signed.challenge)
    precondition(confirmation == Data("ok".utf8))
    fails(.expired) { _ = try store.consume(packet, host: "mac", device: "iphone", operation: .unlock, now: 11) }
  }

  private static func node(_ id: String, _ role: String, _ subrole: String = "", parent: Int? = 0,
    own: Bool = true) -> MacUnlockProfile.Node {
    .init(parent: parent, role: role, subrole: subrole, identifier: id,
      enabled: true, writable: true, press: true, matchesAccount: own)
  }

  private static let window = node("login", kAXWindowRole, parent: nil)
  private static let label = node("FocusedUser", kAXStaticTextRole)
  private static let secure = node("UserPasswordTextField", kAXTextFieldRole, kAXSecureTextFieldSubrole)
  private static let submit = node("LUIBUTTON_GO", kAXButtonRole)

  static func selection() throws {
    let expected = try MacUnlockProfile.select([window, label, secure, submit])
    precondition(expected.field == 2 && expected.submit == 3)
    let choice = try MacUnlockProfile.selectWindow([[window], [window, label, secure, submit]])
    precondition(choice == 1)
    for rejected in [
      [window, label, secure, secure, submit],
      [window, label, secure, node("recovery", kAXSheetRole), submit],
      [window, node("FocusedUser", kAXStaticTextRole, own: false), secure, submit],
      [node("unknown-window", kAXWindowRole), label, secure, submit],
      [window, label, node("otherField", kAXTextFieldRole, kAXSecureTextFieldSubrole), submit],
      [window, label, secure, node("LUIBUTTON_GO", kAXButtonRole, parent: 1)],
    ] {
      fails(.unlockUnavailable) { _ = try MacUnlockProfile.select(rejected) }
    }
    fails(.unlockUnavailable) {
      _ = try MacUnlockProfile.selectWindow([[window, label, secure, submit], [window, label, secure, submit]])
    }
  }

  @MainActor
  static func submission() async throws {
    for observed in [true, false] {
      var presses = 0
      var currentTime = 0.0
      var writes = 0
      do {
        try await MacUnlockSubmission.run(field: 2, current: {}, validate: {
          ([0, 1, 2, 3], [window, label, secure, submit])
        }, same: ==, write: { _ in writes += 1; return .success },
          press: { _ in presses += 1; return .cannotComplete },
          unlocked: { observed }, now: { currentTime }, sleep: { _ in currentTime += 1 })
        precondition(observed)
      } catch let error as UnlockFailure {
        precondition(!observed && error == .unlockUnavailable)
      }
      precondition(presses == 1 && writes == 1)
    }
    var validations = 0
    do {
      try await MacUnlockSubmission.run(field: 2, current: {}, validate: {
        validations += 1
        return ([0, 1, 2, validations == 3 ? 4 : 3], [window, label, secure, submit])
      }, same: ==, write: { _ in .success }, press: { _ in preconditionFailure("Changed button was pressed") },
        unlocked: { false })
      preconditionFailure("Changed button was accepted")
    } catch let error as UnlockFailure {
      precondition(error == .unlockUnavailable)
    }
  }

  static func fails(_ expected: UnlockFailure, _ operation: () throws -> Void) {
    do {
      try operation()
      preconditionFailure("Expected failure")
    } catch let error as UnlockFailure {
      precondition(error == expected)
    } catch {
      preconditionFailure("Unexpected failure")
    }
  }
}
