# Connect encrypted channel

## Sub-features

- Host fingerprint: Devices and `connect-status` expose one stable public identity across restart.
- Pairing: new phone/browser independently compares Host fingerprint; trusted Host approves the exact device key. No ordinary operation works while pending.
- Traffic: DM, image upload/download, avatar, approval, native private input, push registration and logical streams use the channel.
- Failure: changed/missing keys, replay, malformed frames, cancellation, revocation and reconnect fail closed without plaintext Connect fallback.
- Removal: full phone WebView remains absent; Connect Browser/Computer viewers remain unavailable.

## How to get to it (user POV)

Host Settings → Devices shows the Host fingerprint and pending device keys. Pair from the native phone or Add remote in another trusted Host's browser. Compare the complete Host fingerprint with the independent Host display, then compare and approve the device fingerprint on the Host. In chat, open a pending private-input request and choose Fill privately. Activity opens the same native form.

## Driving it with verify-app

Build and launch a named isolated Host with `verify-app`; run doctor with local network/process permissions. Use a second trusted browser Host for remote chat. Enable only a task-owned local connector or specifically authorized real tunnel. Qualify a real phone through the shared QA queue; a browser or Node carrier is not native proof. Use official DeepSeek credentials for a real DM and disposable private input.

Capture HTTP headers/URLs and WebSocket frames at the Connect origin before channel decryption. Compare synthetic sentinels with those bytes; preserve only redacted pass/fail summaries for publication. Read the owning Host's canonical timeline, approval outcome and private-input status. Verify `device-approve-key <receipt> <public-key> --confirm` and `connect-status` against this live Host. Restart the same isolated Profile and verify a stable fingerprint; reconnect must use new ephemeral keys. Revoke the device and verify open streams close.

## Gotchas

- A Node socket mapped from a Connect hostname to a local origin qualifies the application carrier and native DSH dispatch, not Cloudflare reachability or native key storage.
- The mobile QA queue may be paused. Keep iOS/Android/Human checks explicitly unrun rather than claiming web-export pixels as native evidence.
- A browser served through an untrusted intermediary is outside the executable-code trust claim. Origin-local storage is not hardware protection.
- Never capture real credentials or private chats. Only synthetic test input belongs in published evidence.
- Protocol vectors and peer reviews do not constitute an external security audit.
