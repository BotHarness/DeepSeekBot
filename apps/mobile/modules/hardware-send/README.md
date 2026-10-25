# Hardware keyboard send

This local Expo module wraps the chat composer's text field so a hardware
keyboard can send the draft. It owns no text and no layout: the field, its
draft and the send action stay in React Native, and the view only reports
`onSend`.

- **iOS and iPadOS:** the view adds a `UIKeyCommand` for ⌘↩. UIKit collects key
  commands along the responder chain, so it applies only while the field inside
  is first responder. The command is offered and its action is accepted only when
  a text input inside the view remains first responder and has no marked text.
  This also rejects a cached action after composition starts or focus leaves the
  composer. The command title appears in the ⌘-hold shortcut overlay.
- **Android:** the view intercepts `dispatchKeyEvent` before the focused
  `EditText`. Enter sends when `enter` is set, Shift+Enter always adds a line,
  and Ctrl+Enter or Meta+Enter always sends. Key events flagged as coming from
  the on-screen keyboard, or from a virtual input device, pass through
  unchanged, with one exception. Some input methods, such as WeType, take a
  hardware Enter and send it again as their own key event. The view notes each
  hardware Enter in `dispatchKeyEventPreIme`, before the input method sees it,
  and treats an input-method Enter that follows within 500 ms as that key, with
  its original modifiers. Other input methods, including WeType on HyperOS,
  type a newline into the field instead of sending a key. The view watches the
  focused field inside it, and a single newline typed within 500 ms of a
  hardware Enter that would send is removed and sends instead. The view records
  whether the focused field is composing text before the input method handles
  that Enter. A composition-confirming key cannot send, even if the input method
  clears its composing span before echoing a key or inserting a newline. Changing
  focus, canceling a key, releasing it or consuming a send clears the pending
  echo. The next hardware key starts a fresh decision. Like `stream-reveal`, the
  view keeps the size Yoga gives it and leaves child layout to React Native.

When `enabled` is false the view does nothing, so an empty draft or a
dictation in progress never sends. The binding lives in
`src/ui/primitives/hardware-send.*.tsx`; builds without the module fall back to
a plain `View`. **Adding this module requires a native rebuild**; an OTA update
alone cannot install it.

After Expo prebuild, run the Android unit tests from the repository root:

```sh
pnpm --filter @botharness/mobile exec expo prebuild --platform android --no-install
bash apps/mobile/android/gradlew -p apps/mobile/android :hardware-send:testDebugUnitTest
```

## iOS composition regression target

`ios/Tests/HardwareSendViewTests.swift` drives a real `UITextView` in a window,
then dispatches the view's `UIKeyCommand` and observes Expo's `onSend` event.
It includes an ordinary-send positive control, marked text with a cached command,
and a cached command after focus leaves the composer. The opt-in CocoaPods
`HardwareSend/TestHost` app specification supplies an independent scene-based
UIKit host; the fixture attaches its window to that host's real connected scene.
It does not build or launch the full app.

The normal app excludes `Tests/**/*` and `TestHost/**/*`. Only the task-specific, non-public
`BOTHARNESS_HARDWARE_SEND_IOS_TESTS=1` environment flag enables the local config
plugin. During CNG it declares the `HardwareSend/Tests` test specification before
Expo autolinking, without changing app identity, signing or permissions. The
plugin's configuration-to-Podfile boundary is covered by
`apps/mobile/test/hardware-send-plugin.test.ts`.

In an assigned Mac QA window, the runner sets that flag for iOS prebuild, installs
the generated Podfile, then enumerates the actual generated Xcode schemes and
checks the test target and Debug testability before running XCTest. Do not edit
the generated Podfile or guess a scheme name. Record the exact commit, generated
scheme, destination and pass/fail results, including the ordinary-send control.
A source or configuration check is not an iOS keyboard result.

The `verify.yml` workflow also offers a manual `ios_hardware_send_tests` boolean
input, disabled by default. Enable it on the exact branch head to use the standard
`xcode-27` runner. The job checks the generated `HardwareSend-Unit-Tests` scheme,
selects an installed iOS 27 phone simulator, runs the ordinary-send positive
control, then runs the two cached-command regressions without rebuilding. It uses
the independent CocoaPods test host and no signing/account credentials. Only
synthetic test logs, result bundles and scheme/simulator metadata are retained for
seven days; no app Profile, full DerivedData or Pods folder is uploaded. Each
successful phase must also report exactly its expected test methods and passing
counts; missing, skipped, empty or crash-placeholder results fail verification.
A UIKit `markedTextRange` regression is separate from actual CJK candidate input,
physical keyboards and Human acceptance.
