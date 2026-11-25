import CryptoKit
import Foundation
import LocalAuthentication
import Security

struct UnlockVault: Sendable {
  let scope: String
  let pinScope: String

  init(host: String, device: String) throws {
    guard (1...128).contains(host.utf8.count), (1...128).contains(device.utf8.count) else {
      throw UnlockFailure.invalid
    }
    pinScope = Data(SHA256.hash(data: Data(host.utf8))).base64EncodedString()
    let binding = try JSONEncoder().encode([host, device])
    scope = Data(SHA256.hash(data: binding)).base64EncodedString()
  }

  private func item(_ name: String) -> [CFString: Any] {
    [kSecClass: kSecClassGenericPassword, kSecAttrService: "com.botharness.computer-unlock.v1." + name,
     kSecAttrAccount: name == "pin" ? pinScope : scope, kSecAttrSynchronizable: false]
  }

  func pin() throws -> Data? {
    var query = item("pin")
    query[kSecReturnData] = true
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data, data.count == 65 else {
      throw UnlockFailure.unavailable
    }
    return data
  }

  func pinFirstKey(_ key: Data) throws {
    var query = item("pin")
    query[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    query[kSecValueData] = key
    let status = SecItemAdd(query as CFDictionary, nil)
    if status == errSecDuplicateItem {
      guard try pin() == key else { throw UnlockFailure.keyChanged }
    } else if status != errSecSuccess {
      throw UnlockFailure.unavailable
    }
  }

  func hasPassword() throws -> Bool {
    var query = item("password")
    query[kSecReturnAttributes] = true
    let context = LAContext()
    context.interactionNotAllowed = true
    query[kSecUseAuthenticationContext] = context
    let status = SecItemCopyMatching(query as CFDictionary, nil)
    switch status {
    case errSecSuccess, errSecInteractionNotAllowed: return true
    case errSecItemNotFound: return false
    default: throw UnlockFailure.unavailable
    }
  }

  func readPassword(context: LAContext, reason: String) throws -> Data {
    var query = item("password")
    query[kSecReturnData] = true
    context.localizedReason = reason
    query[kSecUseAuthenticationContext] = context
    var result: CFTypeRef?
    switch SecItemCopyMatching(query as CFDictionary, &result) {
    case errSecSuccess:
      guard let password = result as? Data else { throw UnlockFailure.unavailable }
      return password
    case errSecUserCanceled: throw UnlockFailure.cancelled
    case errSecItemNotFound: throw UnlockFailure.passwordMissing
    default: throw UnlockFailure.faceIDRequired
    }
  }

  func savePassword(_ password: Data, context: LAContext) throws {
    guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
      .biometryCurrentSet, nil) else { throw UnlockFailure.faceIDRequired }
    let filter = item("password")
    var attributes = filter
    attributes[kSecValueData] = password
    attributes[kSecAttrAccessControl] = access
    attributes[kSecUseAuthenticationContext] = context
    let status = SecItemAdd(attributes as CFDictionary, nil)
    if status == errSecDuplicateItem {
      var query = filter
      query[kSecUseAuthenticationContext] = context
      guard SecItemUpdate(query as CFDictionary, [kSecValueData: password] as CFDictionary) == errSecSuccess else {
        throw UnlockFailure.unavailable
      }
    } else if status != errSecSuccess {
      throw UnlockFailure.unavailable
    }
  }

  func deletePassword() throws {
    let status = SecItemDelete(item("password") as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw UnlockFailure.unavailable }
  }
}
