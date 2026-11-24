import ExpoModulesCore
import UIKit

public final class ComputerUnlockModule: Module {
  @MainActor private static let unlock = MobileUnlock()

  public func definition() -> ModuleDefinition {
    Name("ComputerUnlock")
    AsyncFunction("saved") { (host: String, device: String) -> Bool in
      try UnlockVault(host: host, device: device).hasPassword()
    }
    AsyncFunction("disable") { (host: String, device: String) async throws in
      try await Self.unlock.disable(host: host, device: device)
    }
    AsyncFunction("cancel") { () async in
      await Self.unlock.cancel()
    }
    AsyncFunction("prepare") { (host: String, device: String, action: String, offer: String, saved: Bool,
      copy: String) async -> [String: String] in
      guard let operation = UnlockOperation(rawValue: action),
        let labels = try? JSONDecoder().decode(UnlockPromptCopy.self, from: Data(copy.utf8))
      else { return ["code": "invalid"] }
      do {
        return try await Self.unlock.prepare(host: host, device: device, operation: operation,
          offer: offer, saved: saved, copy: labels, presenter: self.appContext?.utilities?.currentViewController())
      } catch {
        return ["code": (error as? UnlockFailure)?.rawValue ?? "invalid"]
      }
    }
    AsyncFunction("finish") { (request: String, receipt: String) async -> String in
      do {
        try await Self.unlock.finish(request: request, receipt: receipt)
        return "ok"
      } catch {
        return (error as? UnlockFailure)?.rawValue ?? "invalid"
      }
    }
    OnDestroy {
      Task { @MainActor in Self.unlock.cancel() }
    }
    OnAppEntersBackground {
      Task { @MainActor in Self.unlock.cancel() }
    }
  }
}
