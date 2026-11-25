// Adapted from makecindy/cindy, Apache-2.0, revision 945abae2b8a2ebf05ebb9a5d3d04fa14b55420fc.
// See packages/computer/THIRD_PARTY_NOTICES.md.

#if os(macOS)
import AppKit
import ApplicationServices
import Foundation
import IOKit.pwr_mgt
import Security
import SystemConfiguration

/// Only an already logged-in, foreground session owned by this helper is eligible.
struct MacConsoleState {
  let locked: Bool
  static func read(account: MacSystemAccount) throws -> Self {
    guard try MacSystemAccount.current() == account else { throw UnlockFailure.invalidIdentity }
    var uid: uid_t = 0, gid: gid_t = 0
    guard SCDynamicStoreCopyConsoleUser(nil, &uid, &gid) != nil, uid == account.uid,
      let session = CGSessionCopyCurrentDictionary() as? [String: Any],
      (session[kCGSessionUserIDKey as String] as? NSNumber)?.uint32Value == account.uid,
      session[kCGSessionOnConsoleKey as String] as? Bool == true,
      session[kCGSessionLoginDoneKey as String] as? Bool == true else { throw UnlockFailure.invalidIdentity }
    return Self(locked: session["CGSSessionScreenIsLocked"] as? Bool ?? false)
  }
}

/// The identifiers are evidenced in Apple's LoginUIKit implementation. Unknown
/// layouts deliberately fail rather than falling back to focused/global input.
struct MacUnlockProfile {
  struct Node {
    let parent: Int?
    let role: String
    let subrole: String
    let identifier: String
    let enabled: Bool
    let writable: Bool
    let press: Bool
    let matchesAccount: Bool
  }
  struct Selection: Equatable { let field: Int; let submit: Int; let label: Int? }
  struct FieldSelection: Equatable { let field: Int; let label: Int? }
  /// Secondary displays can expose empty login windows. Never pick the first
  /// window: accept exactly one actionable surface and reject unknown siblings.
  static func selectWindow(_ windows: [[Node]]) throws -> Int {
    var candidates: [Int] = []
    for (index, nodes) in windows.enumerated() {
      _ = try accountLabel(nodes)
      if nodes.count == 1 { continue }
      guard (try? selectField(nodes)) != nil || (try? presentationLabel(nodes)) != nil else {
        throw UnlockFailure.unlockUnavailable
      }
      candidates.append(index)
    }
    guard candidates.count == 1, let selected = candidates.first else { throw UnlockFailure.unlockUnavailable }
    return selected
  }
  private static func accountLabel(_ nodes: [Node]) throws -> Int? {
    guard nodes.first?.identifier == "login", nodes.first?.role == kAXWindowRole,
      !nodes.contains(where: { [kAXSheetRole, kAXListRole, kAXTableRole, kAXOutlineRole, kAXComboBoxRole, kAXPopUpButtonRole].contains($0.role)
        || $0.subrole == kAXDialogSubrole || $0.subrole == kAXSystemDialogSubrole }) else { throw UnlockFailure.unlockUnavailable }
    let labels = nodes.indices.filter { nodes[$0].identifier == "FocusedUser" }
    // Modern lock screens replace the account label with the password field.
    // collect() independently binds the console UID and Apple loginwindow PID.
    guard labels.count <= 1 else { throw UnlockFailure.unlockUnavailable }
    guard let label = labels.first else { return nil }
    guard nodes[label].role == kAXStaticTextRole, nodes[label].matchesAccount else { throw UnlockFailure.unlockUnavailable }
    return label
  }
  static func presentationLabel(_ nodes: [Node]) throws -> Int {
    guard let label = try accountLabel(nodes),
      !nodes.contains(where: { $0.role == kAXTextFieldRole || ["ResetPasswordTitle", "ResetUsingRecoveryButton"].contains($0.identifier) }) else { throw UnlockFailure.unlockUnavailable }
    return label
  }
  static func selectField(_ nodes: [Node]) throws -> FieldSelection {
    let label = try accountLabel(nodes)
    guard nodes.filter({ $0.role == kAXTextFieldRole }).count == 1 else { throw UnlockFailure.unlockUnavailable }
    let fields = nodes.indices.filter { nodes[$0].identifier == "UserPasswordTextField" }
    let buttons = nodes.indices.filter { nodes[$0].identifier == "LUIBUTTON_GO" }
    guard fields.count == 1, buttons.count <= 1 else { throw UnlockFailure.unlockUnavailable }
    let field = fields[0]
    guard nodes[field].role == kAXTextFieldRole, nodes[field].subrole == kAXSecureTextFieldSubrole,
      nodes[field].enabled, nodes[field].writable, let parent = nodes[field].parent,
      nodes.indices.contains(parent) else { throw UnlockFailure.unlockUnavailable }
    if let button = buttons.first {
      guard nodes[button].role == kAXButtonRole, nodes[button].parent == parent else { throw UnlockFailure.unlockUnavailable }
    }
    return FieldSelection(field: field, label: label)
  }
  static func select(_ nodes: [Node]) throws -> Selection {
    let field = try selectField(nodes)
    let buttons = nodes.indices.filter { nodes[$0].identifier == "LUIBUTTON_GO" }
    guard buttons.count == 1 else { throw UnlockFailure.unlockUnavailable }
    let button = buttons[0]
    guard
      nodes[button].role == kAXButtonRole, nodes[button].enabled, nodes[button].press,
      nodes[button].parent == nodes[field.field].parent else { throw UnlockFailure.unlockUnavailable }
    return Selection(field: field.field, submit: button, label: field.label)
  }
}

/// The production traversal, with AX reads and the monotonic clock injectable
/// so budget and object-mapping regressions can be tested without a real login.
enum MacUnlockWindowCollector {
  static func collect<Element>(windows: [Element], cleanupWindow: Element? = nil,
    now: () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
    equal: (Element, Element) -> Bool,
    read: (Element, Int?) throws -> MacUnlockProfile.Node,
    children: (Element) throws -> [Element]) throws -> (elements: [Element], nodes: [MacUnlockProfile.Node]) {
    // Cleanup may inspect only the original window. It must never fall back to
    // another candidate, and unrelated sibling changes cannot suppress clearing.
    let windows = cleanupWindow.map { original in windows.filter { equal($0, original) } } ?? windows
    guard !windows.isEmpty, windows.count <= 16,
      cleanupWindow == nil || windows.count == 1 else { throw UnlockFailure.unlockUnavailable }
    let deadline = now() + 2
    var elements: [Element] = [], nodes: [MacUnlockProfile.Node] = []
    var visited: [Element] = []
    func visit(_ element: Element, parent: Int?, depth: Int) throws {
      guard now() < deadline, depth <= 12, visited.count < 256,
        !visited.contains(where: { equal($0, element) }) else { throw UnlockFailure.unlockUnavailable }
      visited.append(element)
      let index = nodes.count
      elements.append(element)
      nodes.append(try read(element, parent))
      for child in try children(element) { try visit(child, parent: index, depth: depth + 1) }
    }
    var surfaces: [(elements: [Element], nodes: [MacUnlockProfile.Node])] = []
    for window in windows {
      elements = []; nodes = []
      try visit(window, parent: nil, depth: 0)
      surfaces.append((elements, nodes))
    }
    guard now() < deadline else { throw UnlockFailure.unlockUnavailable }
    return surfaces[try MacUnlockProfile.selectWindow(surfaces.map { $0.nodes })]
  }
}

/// Kernel start time is available for loginwindow even when NSWorkspace has no
/// launchDate. Bind PID reuse checks to the same OS process and owning user.
struct MacUnlockProcessIdentity: Equatable {
  let pid: pid_t
  let uid: uid_t
  let seconds: UInt64
  let microseconds: UInt64

  static func read(pid: pid_t, uid: uid_t) throws -> Self {
    var info = proc_bsdinfo()
    guard proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, Int32(MemoryLayout<proc_bsdinfo>.size)) == MemoryLayout<proc_bsdinfo>.size,
      info.pbi_uid == uid, info.pbi_start_tvsec > 0 else { throw UnlockFailure.invalidIdentity }
    return Self(pid: pid, uid: uid, seconds: info.pbi_start_tvsec, microseconds: info.pbi_start_tvusec)
  }
}

enum MacUnlockSubmission {
  @MainActor
  static func run<Element>(
    field: Element,
    current: () async throws -> Void,
    validate: () throws -> (elements: [Element], nodes: [MacUnlockProfile.Node]),
    same: (Element, Element) -> Bool,
    write: (Element) -> AXError,
    press: (Element) -> AXError,
    unlocked: () throws -> Bool,
    now: () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
    sleep: (UInt64) async throws -> Void = { try await Task.sleep(nanoseconds: $0) }
  ) async throws {
    try await current()
    _ = try validate()
    guard write(field) == .success else { throw UnlockFailure.unlockUnavailable }
    let submitDeadline = now() + 2
    var submit: Element?
    while now() < submitDeadline {
      try await current()
      let next = try validate()
      if let selection = try? MacUnlockProfile.select(next.nodes) {
        submit = next.elements[selection.submit]
        break
      }
      try await sleep(50_000_000)
    }
    guard let submit else { throw UnlockFailure.unlockUnavailable }
    try await current()
    let final = try validate()
    let selection = try MacUnlockProfile.select(final.nodes)
    guard same(submit, final.elements[selection.submit]) else { throw UnlockFailure.unlockUnavailable }
    try await current()
    let result = press(submit)
    guard result == .success || result == .cannotComplete else { throw UnlockFailure.unlockUnavailable }
    let deadline = now() + 7
    while now() < deadline {
      try await current()
      if try unlocked() { return }
      try await sleep(100_000_000)
    }
    throw UnlockFailure.unlockUnavailable
  }
}

@MainActor
final class MacScreenUnlocker {
  static let shared = MacScreenUnlocker()
  private var busy = false
  private let path = "/System/Library/CoreServices/loginwindow.app/Contents/MacOS/loginwindow"
  private struct Target {
    let application: NSRunningApplication
    let launch: MacUnlockProcessIdentity
    let code: SecCode
    let elements: [AXUIElement]
    let nodes: [MacUnlockProfile.Node]
    let selection: MacUnlockProfile.FieldSelection
  }
  private typealias Snapshot = (application: NSRunningApplication, launch: MacUnlockProcessIdentity, code: SecCode,
    elements: [AXUIElement], nodes: [MacUnlockProfile.Node])

  func unlock(account: MacSystemAccount, password: Data, current: () async throws -> Void) async throws {
    guard !busy else { throw UnlockFailure.unlockUnavailable }
    busy = true; defer { busy = false }
    try await current()
    guard try MacConsoleState.read(account: account).locked else { throw UnlockFailure.unlockUnavailable }
    let text = try unlockPasswordText(password)
    var activity: IOPMAssertionID = 0
    guard IOPMAssertionDeclareUserActivity("BotHarness Computer unlock" as CFString, kIOPMUserActiveRemote, &activity) == kIOReturnSuccess else {
      throw UnlockFailure.unlockUnavailable
    }
    defer { IOPMAssertionRelease(activity) }
    let target = try await prepare(account: account, current: current)
    let field = target.elements[target.selection.field]
    var wrote = false
    defer {
      if wrote, (try? validate(target, account: account, forCleanup: true)) != nil {
        AXUIElementSetMessagingTimeout(field, 2)
        _ = AXUIElementSetAttributeValue(field, kAXValueAttribute as CFString, "" as CFString)
      }
    }
    try await MacUnlockSubmission.run(
      field: field,
      current: current,
      validate: {
        let next = try validate(target, account: account)
        return (next.elements, next.nodes)
      },
      same: { CFEqual($0, $1) },
      write: {
        // loginwindow secure writes can exceed the 0.1s traversal budget.
        AXUIElementSetMessagingTimeout($0, 2)
        wrote = true
        return AXUIElementSetAttributeValue($0, kAXValueAttribute as CFString, text as CFString)
      },
      press: {
        AXUIElementSetMessagingTimeout($0, 2)
        return AXUIElementPerformAction($0, kAXPressAction as CFString)
      },
      unlocked: { try !MacConsoleState.read(account: account).locked }
    )
  }

  private func prepare(account: MacSystemAccount, current: () async throws -> Void) async throws -> Target {
    let deadline = ProcessInfo.processInfo.systemUptime + 3
    while ProcessInfo.processInfo.systemUptime < deadline {
      try await current()
      let raw: Snapshot
      do { raw = try collect(account: account) }
      catch UnlockFailure.unlockUnavailable {
        // Waking can temporarily expose no window/children. Identity and
        // accessibility failures are never treated as readiness delays.
        try await Task.sleep(nanoseconds: 100_000_000)
        continue
      }
      if let selection = try? MacUnlockProfile.selectField(raw.nodes) {
        return Target(application: raw.application, launch: raw.launch, code: raw.code,
          elements: raw.elements, nodes: raw.nodes, selection: selection)
      }
      try await Task.sleep(nanoseconds: 100_000_000)
    }
    throw UnlockFailure.unlockUnavailable
  }
  private func collect(account: MacSystemAccount, cleanupWindow: AXUIElement? = nil) throws -> Snapshot {
    guard AXIsProcessTrusted() else { throw UnlockFailure.accessibilityRequired }
    guard try MacConsoleState.read(account: account).locked else { throw UnlockFailure.unlockUnavailable }
    let apps = NSWorkspace.shared.runningApplications.filter { $0.bundleIdentifier == "com.apple.loginwindow" && $0.executableURL?.path == path }
    guard apps.count == 1, let app = apps.first else { throw UnlockFailure.unlockUnavailable }
    let launch = try MacUnlockProcessIdentity.read(pid: app.processIdentifier, uid: account.uid)
    var code: SecCode?, requirement: SecRequirement?
    guard SecRequirementCreateWithString("identifier \"com.apple.loginwindow\" and anchor apple" as CFString, [], &requirement) == errSecSuccess,
      SecCodeCopyGuestWithAttributes(nil, [kSecGuestAttributePid: app.processIdentifier] as CFDictionary, [], &code) == errSecSuccess,
      let code, SecCodeCheckValidity(code, [], requirement) == errSecSuccess else { throw UnlockFailure.invalidIdentity }
    let root = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(root, 0.25)
    guard let windows = try value(root, kAXWindowsAttribute) as? [AXUIElement] else { throw UnlockFailure.unlockUnavailable }
    let names = try account.unambiguousDisplayNames()
    let selected = try MacUnlockWindowCollector.collect(windows: windows, cleanupWindow: cleanupWindow, equal: { CFEqual($0, $1) }, read: { element, parent in
      AXUIElementSetMessagingTimeout(element, 0.1)
      guard let role = try value(element, kAXRoleAttribute) as? String, !role.isEmpty else { throw UnlockFailure.unlockUnavailable }
      let subrole = try value(element, kAXSubroleAttribute) as? String ?? ""
      let identifier = try value(element, kAXIdentifierAttribute) as? String ?? ""
      var writable: DarwinBoolean = false
      if identifier == "UserPasswordTextField" {
        guard AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &writable) == .success else { throw UnlockFailure.unlockUnavailable }
      }
      guard try value(element, kAXModalAttribute) as? Bool != true else { throw UnlockFailure.unlockUnavailable }
      var actions: CFArray?
      let actionStatus = AXUIElementCopyActionNames(element, &actions)
      guard actionStatus == .success || actionStatus == .noValue || actionStatus == .attributeUnsupported else {
        throw UnlockFailure.unlockUnavailable
      }
      // AXValue is read only for the specifically identified static account label.
      var matches = false
      if identifier == "FocusedUser", role == kAXStaticTextRole {
        matches = names.contains(try value(element, kAXValueAttribute) as? String ?? "")
      }
      return .init(parent: parent, role: role, subrole: subrole, identifier: identifier,
        enabled: try value(element, kAXEnabledAttribute) as? Bool == true, writable: writable.boolValue,
        press: (actions as? [String])?.contains(kAXPressAction) == true, matchesAccount: matches)
    }, children: { element in
      try value(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
    })
    return (app, launch, code, selected.elements, selected.nodes)
  }
  private func validate(_ target: Target, account: MacSystemAccount, forCleanup: Bool = false) throws -> Snapshot {
    guard !target.application.isTerminated,
      try MacUnlockProcessIdentity.read(pid: target.application.processIdentifier, uid: account.uid) == target.launch,
      SecCodeCheckValidity(target.code, [], nil) == errSecSuccess else { throw UnlockFailure.invalidIdentity }
    let next = try collect(account: account, cleanupWindow: forCleanup ? target.elements[0] : nil)
    let selection = try MacUnlockProfile.selectField(next.nodes)
    guard next.application.processIdentifier == target.application.processIdentifier, next.launch == target.launch,
      CFEqual(next.elements[0], target.elements[0]),
      CFEqual(next.elements[selection.field], target.elements[target.selection.field]) else { throw UnlockFailure.unlockUnavailable }
    if let label = selection.label, let previous = target.selection.label {
      guard CFEqual(next.elements[label], target.elements[previous]) else { throw UnlockFailure.unlockUnavailable }
    }
    return next
  }
  private func value(_ element: AXUIElement, _ attribute: String) throws -> CFTypeRef? {
    var result: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(element, attribute as CFString, &result)
    if status == .attributeUnsupported || status == .noValue { return nil }
    guard status == .success else { throw UnlockFailure.unlockUnavailable }
    return result
  }
}

#endif
