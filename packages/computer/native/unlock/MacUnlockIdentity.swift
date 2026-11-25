import Foundation
import Security

enum MacUnlockIdentity {
  static func requireLaunchAgent() throws {
    guard getuid() != 0, getuid() == geteuid(), getppid() == 1 else { throw UnlockFailure.unavailable }
    var launchd: SecStaticCode?
    var requirement: SecRequirement?
    guard SecStaticCodeCreateWithPath(URL(fileURLWithPath: "/sbin/launchd") as CFURL, [], &launchd) == errSecSuccess,
      SecRequirementCreateWithString("identifier \"com.apple.xpc.launchd\" and anchor apple" as CFString, [], &requirement) == errSecSuccess,
      let launchd, let requirement, SecStaticCodeCheckValidity(launchd, [], requirement) == errSecSuccess
    else { throw UnlockFailure.unavailable }
  }

  static func load(directory: URL, allowCreation: Bool) throws -> SecKey {
    let marker = directory.appendingPathComponent("identity-created")
    let tag = Data("com.botharness.computer-unlock.mac-key.v1".utf8)
    let attributes: [CFString: Any] = [
      kSecAttrApplicationTag: tag, kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeyClass: kSecAttrKeyClassPrivate,
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(attributes.merging([
      kSecClass: kSecClassKey, kSecReturnRef: true,
    ]) { _, value in value } as CFDictionary, &result)
    if status == errSecSuccess, let result, CFGetTypeID(result) == SecKeyGetTypeID() {
      if !FileManager.default.fileExists(atPath: marker.path) { try Data().write(to: marker, options: .atomic) }
      return (result as! SecKey)
    }
    guard status == errSecItemNotFound, allowCreation,
      !FileManager.default.fileExists(atPath: marker.path) else { throw UnlockFailure.unavailable }
    var application: SecTrustedApplication?
    var access: SecAccess?
    guard SecTrustedApplicationCreateFromPath(nil, &application) == errSecSuccess, let application,
      SecAccessCreate("BotHarness Computer Unlock" as CFString, [application] as CFArray, &access) == errSecSuccess,
      let access else { throw UnlockFailure.unavailable }
    let privateAttributes = attributes.merging([
      kSecAttrIsPermanent: true, kSecAttrIsExtractable: false, kSecAttrAccess: access,
    ]) { _, value in value }
    guard let key = SecKeyCreateRandomKey([
      kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeySizeInBits: 256,
      kSecPrivateKeyAttrs: privateAttributes,
    ] as CFDictionary, nil) else { throw UnlockFailure.unavailable }
    try Data().write(to: marker, options: .atomic)
    return key
  }
}
