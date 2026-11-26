// Adapted from makecindy/cindy, Apache-2.0, revision 945abae2b8a2ebf05ebb9a5d3d04fa14b55420fc.
// See packages/computer/THIRD_PARTY_NOTICES.md.

#if os(macOS)
import Foundation
import OpenDirectory
import SystemConfiguration

struct MacSystemAccount: Codable, Equatable {
  let uid: UInt32
  let recordID: String
  let name: String

  static func current() throws -> MacSystemAccount {
    let uid = getuid()
    guard uid != 0, uid == geteuid(), let entry = getpwuid(uid) else { throw UnlockFailure.unavailable }
    let name = String(cString: entry.pointee.pw_name)
    let record = try localRecord(name)
    guard let ids = try record.values(forAttribute: kODAttributeTypeGUID) as? [String],
      ids.count == 1, let uuid = UUID(uuidString: ids[0]) else { throw UnlockFailure.unavailable }
    return MacSystemAccount(uid: uid, recordID: uuid.uuidString.lowercased(), name: name)
  }

  /// Exactly one OS password verification attempt; never invokes shell tools,
  /// simulates keyboard input, retries, or stores a local copy of the password.
  func verify(_ password: Data) throws {
    let text = try unlockPasswordText(password)
    do {
      guard try Self.current() == self else { throw UnlockFailure.invalidIdentity }
      var consoleUID: uid_t = 0, consoleGID: gid_t = 0
      guard SCDynamicStoreCopyConsoleUser(nil, &consoleUID, &consoleGID) != nil,
        consoleUID == uid else { throw UnlockFailure.invalidIdentity }
      do { try Self.localRecord(name).verifyPassword(text) }
      catch { throw UnlockFailure.passwordRejected }
      guard try Self.current() == self else { throw UnlockFailure.invalidIdentity }
      // Check again after OpenDirectory returns; fast user switching must not
      // authorize a different current desktop through the same long-lived helper.
      guard SCDynamicStoreCopyConsoleUser(nil, &consoleUID, &consoleGID) != nil,
        consoleUID == uid else { throw UnlockFailure.invalidIdentity }
    } catch let failure as UnlockFailure { throw failure }
    catch { throw UnlockFailure.unavailable }
  }

  private static func localRecord(_ name: String) throws -> ODRecord {
    let node = try ODNode(session: ODSession.default(), type: UInt32(kODNodeTypeLocalNodes))
    return try node.record(withRecordType: kODRecordTypeUsers, name: name,
      attributes: [kODAttributeTypeGUID, kODAttributeTypeUniqueID])
  }

  /// A display name is accepted only if it identifies this one local record.
  /// Duplicate full names must not let another selected user receive a secret.
  func unambiguousDisplayNames() throws -> Set<String> {
    var names = Set<String>()
    let node = try ODNode(session: ODSession.default(), type: UInt32(kODNodeTypeLocalNodes))
    let fullNames = try Self.localRecord(name).values(forAttribute: kODAttributeTypeFullName) as? [String] ?? []
    for label in Set([name] + fullNames) where !label.isEmpty {
      var ids = Set<String>()
      for attribute in [kODAttributeTypeFullName, kODAttributeTypeRecordName] {
        let query = try ODQuery(node: node, forRecordTypes: kODRecordTypeUsers,
          attribute: attribute, matchType: ODMatchType(kODMatchEqualTo), queryValues: label,
          returnAttributes: [kODAttributeTypeGUID], maximumResults: 2)
        let records = try query.resultsAllowingPartial(false) as? [ODRecord] ?? []
        for record in records {
          guard let values = try record.values(forAttribute: kODAttributeTypeGUID) as? [String], values.count == 1 else {
            throw UnlockFailure.unlockUnavailable
          }
          ids.insert(values[0].lowercased())
        }
      }
      if ids == Set([recordID]) { names.insert(label) }
    }
    return names
  }
}
#endif
