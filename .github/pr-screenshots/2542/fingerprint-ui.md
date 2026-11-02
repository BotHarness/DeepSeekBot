# Native fingerprint verification

Baseline: `cb65e435e76f14c435a462863ebd3a3e374104cf`. The exact changed source hashes and native results are in [fingerprint-results.json](fingerprint-results.json).

The long system alert over the scan/link form becomes a focused verification step inside the existing pairing modal. A short instruction, computer name and complete selectable fingerprint appear above native actions. Explanation is collapsed by default. After the Human compares every group with the trusted computer and explicitly confirms, the page switches to the phone fingerprint and waits for the computer to approve that exact key. Back, mismatch and Cancel do not grant trust. Switching steps resets the scroll position. Both account and direct pairing use this view; deployed account enrollment was not exercised here.

SwiftUI buttons use semantic text and native sizing on iOS; the shared action adapter uses native Compose controls on Android. No dependency or native-build input changed. No additional sheet or alert is presented over the pairing route.

## Actual captures

All captures use the existing assigned QA iOS27 Simulator at 402 × 874 and the qualified signed Debug development client. The computer name is synthetic, and the fingerprints are public identities in a dedicated QA Profile. No private keys, invitation payloads, account credentials, temporary tunnel hostname or raw captures are published.

- `fp-before.png`: original Host verification alert, light/default text, captured before editing.
- `fp-light.png` / `fp-dark.png`: new focused Host verification, default text.
- `fp-phone.png`: new phone-approval step on the same real tunnel. The former inline fingerprint lived below the scan/link form; the before capture shows that original form behind its confirmation alert.
- `fp-mid.png` / `fp-mid-dark.png`: intermediate system text.
- `fp-max.png` / `fp-max-dark.png`: maximum system text, fingerprint reached by scrolling.
- `fp-actions.png`: reachable native confirmation actions at maximum text/dark.

Every fingerprint character remains available; no ellipsis, abbreviated comparison, reduced font scaling or automatic trust is used. Text can wrap and the page scrolls. The evidence captures are English; Chinese copy is maintained, but Chinese native rendering is not claimed by this run.

## Verification and limits

The real Cloudflare public DNS/TLS tunnel and production Connect adapter were used. Six light/dark × default/intermediate/maximum text cases compared the complete Host fingerprint, then compared the full phone fingerprint with the pending Host key before approving it. Each returned to Chats and opened/closed Settings, opened Activity and returned to Chats in the same application process. No post-pairing cold restart or reload, native sheet error, or blocked action was required. First-use notice dismissal preceded each case.

Explanation expansion does not grant trust. Native mismatch and Back cancellation opened no channel; a new invitation worked immediately. The capture also checks fixed channel URLs, no outer credential headers and zero fallback requests. These are pairing/navigation observations; the earlier [real password failure matrix](real-tunnel.md) remains separate and was not rerun for this presentation change.

Focused regression tests cover full fingerprint preservation, optional details, explicit confirmation, rejection, stale confirmation after cancellation and cancellation while awaiting phone approval. Device dismissal and actual touch behavior are supported by the native runs, not the mocked component tests.

Android, physical iPhone, deployed account enrollment, VoiceOver/TalkBack, Human QA and external security audit remain separate acceptance work. The PR stays Draft and stacked; no merge, release or product-service deployment.
