# Hardware keyboard send

This local Expo module wraps the chat composer's text field so a hardware
keyboard can send the draft. It owns no text and no layout: the field, its
draft and the send action stay in React Native, and the view only reports
`onSend`.

- **iOS and iPadOS:** the view adds a `UIKeyCommand` for ⌘↩. UIKit collects key
  commands along the responder chain, so it applies only while the field inside
  is first responder. The command title appears in the ⌘-hold shortcut overlay.
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
  hardware Enter that would send is removed and sends instead. When the input
  method uses the Enter to confirm text it is composing, it types that text and
  no newline, so nothing is sent. Like `stream-reveal`, the view keeps the size Yoga gives it and
  leaves child layout to React Native.

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
