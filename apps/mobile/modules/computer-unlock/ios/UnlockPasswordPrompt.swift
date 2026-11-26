import SwiftUI
import UIKit

struct UnlockPromptCopy: Decodable {
  let title: String
  let field: String
  let submit: String
  let cancel: String
  let faceID: String
}

@MainActor
final class UnlockPasswordPrompt {
  private var pending: CheckedContinuation<Data, Error>?
  private weak var controller: UIViewController?

  func read(from presenter: UIViewController, copy: UnlockPromptCopy) async throws -> Data {
    guard pending == nil, presenter.viewIfLoaded?.window != nil else { throw UnlockFailure.unavailable }
    return try await withCheckedThrowingContinuation { continuation in
      pending = continuation
      let host = UIHostingController(rootView: PasswordForm(copy: copy, submit: { [weak self] password in
        self?.close(.success(Data(password.utf8)))
      }, cancel: { [weak self] in self?.cancel() }))
      host.modalPresentationStyle = .pageSheet
      host.isModalInPresentation = true
      controller = host
      presenter.present(host, animated: true)
    }
  }

  func cancel() { close(.failure(UnlockFailure.cancelled)) }

  private func close(_ result: Result<Data, Error>) {
    guard let pending else { return }
    self.pending = nil
    if let controller {
      controller.dismiss(animated: true) { pending.resume(with: result) }
    } else {
      pending.resume(with: result)
    }
  }
}

private struct PasswordForm: View {
  let copy: UnlockPromptCopy
  let submit: (String) -> Void
  let cancel: () -> Void
  @State private var password = ""
  @FocusState private var focused: Bool

  var body: some View {
    NavigationStack {
      Form {
        SecureField(copy.field, text: $password)
          .privacySensitive()
          .textContentType(.password)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .focused($focused)
          .submitLabel(.go)
          .accessibilityIdentifier("computer-unlock-password")
          .onSubmit(confirm)
      }
      .navigationTitle(copy.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.cancel, action: cancel).accessibilityIdentifier("computer-unlock-cancel")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(copy.submit, action: confirm).disabled(password.isEmpty)
            .accessibilityIdentifier("computer-unlock-submit")
        }
      }
      .onAppear { focused = true }
      .accessibilityAction(.escape, cancel)
    }
  }

  private func confirm() {
    guard !password.isEmpty else { return }
    let value = password
    password = ""
    submit(value)
  }
}
