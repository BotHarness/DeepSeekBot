# Native first-pairing follow-up — PR #2547

This follow-up builds on `606b1b75e7cb` and stays stacked on #2546. It changes JavaScript only and reuses the same normally signed Expo 58.0.17 / React Native 0.88.0 Debug app on the existing QA iOS 27 Simulator. No new Simulator, erase, native rebuild, store-app change or physical-phone use.

## Reproduction and diagnosis

The red-capable native driver opened a fresh invitation over real public Cloudflare DNS/TLS, independently compared the Host fingerprint, compared the pending device fingerprint, then approved that exact key on the trusted Host. It asserted on the exact `sheetPresentationController is null when attempting to set allowed detents` error and checked actual post-pairing interactions.

- Baseline reproduced the native error immediately after successful pairing. Marking the first-use notice already read did not remove it.
- The pairing route contained a nested native stack inside a `formSheet`. During dismissal, React Native Screens received content layout after its sheet presentation controller was unavailable. Using the existing Settings-style iOS `modal` presentation removed that detent-controller path. Android's form sheet is unchanged.
- A separate boundary remained: closing the first-use React Native notice and immediately opening the pairing link could leave taps blocked even without the red error. The same maximum-text case worked when the notice was already read. Removing only this notice's iOS fade made the immediate close → pair → use case pass. Other sheets retain their default fade; Android's notice is unchanged.
- An early presentation probe used Metro's stale CI-mode bundle and is not evidence against the fix. Metro was restarted with watching enabled before the red/green comparison. Initial driver preparation failures (deep-link startup, duplicated native labels, fingerprint parsing and scrolling) are excluded from passing results.

No handshake, key admission, credential persistence, gateway, secret submission or fallback code changed in this follow-up. The earlier real password success/failure evidence remains in [real-tunnel.md](real-tunnel.md); it is not claimed as a new password run here.

## Native regression method

Only test setup may terminate the development app to reset its task-owned first-use-notice fixture. After the displayed device key is approved, no process restart, Metro reload or overlay dismissal is allowed as a recovery step. The driver records the same app PID before approval, after pairing and after Settings/Activity use. The result must show usable Chats, Settings opening and closing, Activity, and return to Chats, with no native error. The QA conversation is separately opened from the returned Chats list.

`apps/mobile/.maestro/sim/pairing-return.yaml` preserves the post-approval regression: no launch, reload or clear-state command, actual Settings/Activity actions, reopening Settings and explicit absence of the error. It must be run immediately after the owning runner's trusted fingerprint comparison and device-key approval. JavaScript DOM tests cannot reproduce UIKit's presentation lifecycle; native evidence is the regression seam.

## Results

- Six cases passed: light/dark × default (`large`), intermediate (`accessibility-medium`) and maximum (`accessibility-extra-extra-extra-large`) system text. Every case started with the first-use notice unread, closed it, paired, then opened/closed Settings and used Activity and Chats in the same app process. No cold restart, reload or red-overlay dismissal after pairing.
- The committed Maestro post-approval flow passed on the final source. Native child Back, root Close and downward swipe returned to the existing Chats list; the QA conversation opened afterward in the same process.
- The repeated native maximum-text failure with the old notice fade is retained locally; the earlier baseline red overlay is `pair-before.png`. `pair-light.png`, `pair-dark.png`, `pair-max.png`, `pair-max-dark.png`, `pair-activity.png` and `pair-chat.png` are inspected native after states at 402 × 874. The Handled cards in the conversation are historical fixtures, not new password submissions.
- Six focused test files / 23 tests, mobile typecheck, lint, format and both changelog checks passed. Full GitHub CI is tracked separately by the PR head.
- This follow-up observed 2,385 outer entries / 46 upgrades, only the channel path, no credential headers and zero fallback-trap requests. It exercises pairing/navigation; the earlier password failure matrix is preserved separately.

See [the redacted receipt](native-pairing-results.json) for per-case checks and the exact runtime source-file hashes. Raw native snapshots and process IDs stay local. The automated driver required scrolling to reach the pending fingerprint at maximum text; no layout or font scaling was weakened.

## Scope

Public screenshots contain only the task's synthetic QA content. Raw pairing links, credentials, gateway captures, infrastructure identifiers and native snapshots stay machine-local. Existing app data and other pairings are preserved. Human QA, physical iPhone, Android, deployed account enrollment and external cryptographic audit remain separate. No merge, release or product relay deployment is authorized.

Cleanup verified: the temporary named tunnel and DNS record were deleted, test device keys revoked, Connect disabled, and the task Host/Metro/recorder stopped. The task's Tunnel QA pairing was removed; the other saved pairing remained. The notice fixture was restored, appearance/text returned to light/default, and the device lane released. Existing Simulator, physical phone, store app, native build products and source/evidence were preserved.
