import CryptoKit
import Foundation
import Security

enum UnlockFailure: String, Error {
  case unavailable, invalid, cancelled, expired, busy, limited
  case keyChanged = "key-changed"
  case faceIDRequired = "face-id-required"
  case passwordMissing = "password-missing"
  case passwordRejected = "password-rejected"
  case accessibilityRequired = "accessibility-required"
  case unlockUnavailable = "unlock-unavailable"
  case invalidIdentity = "invalid-identity"
  case invalidMessage = "invalid-message"
}

enum UnlockOperation: String, Codable {
  case verify, unlock
}

struct UnlockChallenge: Codable, Equatable {
  let version: Int
  let id: UUID
  let host: String
  let device: String
  let operation: UnlockOperation
  let key: Data
}

struct SignedUnlockChallenge: Codable {
  let challenge: Data
  let signature: Data

  func verified(host: String, device: String, operation: UnlockOperation, pin: Data?) throws -> UnlockChallenge {
    let value = try JSONDecoder().decode(UnlockChallenge.self, from: challenge)
    guard value.version == 1, value.host == host, value.device == device, value.operation == operation else {
      throw UnlockFailure.invalid
    }
    if let pin, pin != value.key { throw UnlockFailure.keyChanged }
    let key = try P256.Signing.PublicKey(x963Representation: value.key)
    guard key.isValidSignature(try P256.Signing.ECDSASignature(derRepresentation: signature), for: challenge) else {
      throw UnlockFailure.invalid
    }
    return value
  }
}

struct SealedUnlockRequest: Codable {
  let id: UUID
  let key: Data
  let sealed: Data
}

struct UnlockKeys {
  let request: SymmetricKey
  let receipt: SymmetricKey

  init(privateKey: SecKey, publicKey: Data, challenge: Data) throws {
    _ = try P256.KeyAgreement.PublicKey(x963Representation: publicKey)
    guard let peer = SecKeyCreateWithData(publicKey as CFData, [
      kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeyClass: kSecAttrKeyClassPublic,
      kSecAttrKeySizeInBits: 256,
    ] as CFDictionary, nil),
      let secret = SecKeyCopyKeyExchangeResult(privateKey, .ecdhKeyExchangeStandard, peer, [:] as CFDictionary, nil) as Data?
    else { throw UnlockFailure.invalid }
    let key = SymmetricKey(data: secret)
    let salt = Data(SHA256.hash(data: challenge))
    request = HKDF<SHA256>.deriveKey(inputKeyMaterial: key, salt: salt,
      info: Data("com.botharness.computer-unlock.v1.request".utf8), outputByteCount: 32)
    receipt = HKDF<SHA256>.deriveKey(inputKeyMaterial: key, salt: salt,
      info: Data("com.botharness.computer-unlock.v1.receipt".utf8), outputByteCount: 32)
  }
}

func unlockPublicKey(_ key: SecKey) throws -> Data {
  guard let pub = SecKeyCopyPublicKey(key), let data = SecKeyCopyExternalRepresentation(pub, nil) as Data?,
    data.count == 65 else { throw UnlockFailure.unavailable }
  return data
}

func unlockPasswordText(_ password: Data) throws -> String {
  guard !password.isEmpty, password.count <= 1024, !password.contains(0),
    let text = String(data: password, encoding: .utf8) else { throw UnlockFailure.invalidMessage }
  return text
}
