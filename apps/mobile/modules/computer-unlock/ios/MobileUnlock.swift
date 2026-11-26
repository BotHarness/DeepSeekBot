import CryptoKit
import Foundation
import LocalAuthentication
import Security
import UIKit

@MainActor
final class MobileUnlock {
  private struct Pending {
    let request: UUID
    let challenge: Data
    let keys: UnlockKeys
    let vault: UnlockVault
    let passwordToSave: Data?
    let faceIDReason: String
  }

  private let prompt = UnlockPasswordPrompt()
  private var attempt: UUID?
  private var context: LAContext?
  private var pending: Pending?

  func disable(host: String, device: String) throws {
    let vault = try UnlockVault(host: host, device: device)
    cancel()
    try vault.deletePassword()
  }

  func cancel() {
    attempt = nil
    pending = nil
    context?.invalidate()
    context = nil
    prompt.cancel()
  }

  func prepare(host: String, device: String, operation: UnlockOperation, offer: String,
    saved: Bool, copy: UnlockPromptCopy, presenter: UIViewController?) async throws -> [String: String] {
    guard attempt == nil, UIApplication.shared.applicationState == .active else {
      throw UnlockFailure.busy
    }
    let requestID = UUID()
    attempt = requestID
    do {
      let vault = try UnlockVault(host: host, device: device)
      let pin = try vault.pin()
      if saved && (operation != .unlock || pin == nil) { throw UnlockFailure.passwordMissing }
      guard offer.utf8.count <= 2048, let data = Data(base64Encoded: offer) else { throw UnlockFailure.invalid }
      let signed = try JSONDecoder().decode(SignedUnlockChallenge.self, from: data)
      let challenge = try signed.verified(host: host, device: device, operation: operation, pin: pin)
      try vault.pinFirstKey(challenge.key)
      let password: Data
      if saved {
        let auth = try faceIDContext()
        password = try await Task.detached { try vault.readPassword(context: auth, reason: copy.faceID) }.value
      } else {
        guard let presenter else { throw UnlockFailure.unavailable }
        password = try await prompt.read(from: presenter, copy: copy)
      }
      try requireCurrent(requestID)
      _ = try unlockPasswordText(password)
      guard let privateKey = SecKeyCreateRandomKey([
        kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeySizeInBits: 256,
      ] as CFDictionary, nil) else { throw UnlockFailure.unavailable }
      let keys = try UnlockKeys(privateKey: privateKey, publicKey: challenge.key, challenge: signed.challenge)
      let sealed = try AES.GCM.seal(password, using: keys.request, authenticating: signed.challenge)
      guard let ciphertext = sealed.combined else { throw UnlockFailure.unavailable }
      let packet = SealedUnlockRequest(id: challenge.id, key: try unlockPublicKey(privateKey), sealed: ciphertext)
      pending = Pending(request: requestID, challenge: signed.challenge, keys: keys, vault: vault,
        passwordToSave: operation == .verify ? password : nil, faceIDReason: copy.faceID)
      let encoded = try JSONEncoder().encode(packet).base64EncodedString()
      return ["code": "ready", "packet": encoded, "request": requestID.uuidString]
    } catch {
      if attempt == requestID { cancel() }
      throw error
    }
  }

  func finish(request: String, receipt: String) async throws {
    guard let item = pending, item.request.uuidString == request else { throw UnlockFailure.expired }
    pending = nil
    defer { if attempt == item.request { cancel() } }
    try requireCurrent(item.request)
    guard receipt.utf8.count <= 128, let combined = Data(base64Encoded: receipt),
      try AES.GCM.open(AES.GCM.SealedBox(combined: combined), using: item.keys.receipt,
        authenticating: item.challenge) == Data("ok".utf8) else { throw UnlockFailure.invalid }
    if let password = item.passwordToSave {
      let auth = try faceIDContext()
      do {
        guard try await auth.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
          localizedReason: item.faceIDReason) else { throw UnlockFailure.faceIDRequired }
      } catch let error as LAError where [.userCancel, .appCancel, .systemCancel, .userFallback].contains(error.code) {
        throw UnlockFailure.cancelled
      } catch {
        throw UnlockFailure.faceIDRequired
      }
      try requireCurrent(item.request)
      try item.vault.savePassword(password, context: auth)
    }
  }

  private func faceIDContext() throws -> LAContext {
    let auth = LAContext()
    auth.localizedFallbackTitle = ""
    guard auth.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil), auth.biometryType == .faceID
    else { throw UnlockFailure.faceIDRequired }
    context = auth
    return auth
  }

  private func requireCurrent(_ id: UUID) throws {
    guard attempt == id, UIApplication.shared.applicationState != .background else {
      throw UnlockFailure.cancelled
    }
  }
}
