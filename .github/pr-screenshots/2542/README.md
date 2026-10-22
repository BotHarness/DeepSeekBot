# Connect Noise XK — review evidence

Issue #2542, stacked PR #2547 above Track A #2546. Synthetic accounts and values only.

## Captures

- `private-before-{light,dark}.png`: Track A's existing remote Web card blocks secret input over Connect. Copied without alteration from #2546 evidence; the captured behavior is unchanged at stack base `b842d3ce0750b5085106defef21c4d4eb0112f81`.
- `private-after-{light,dark}.png`: a trusted second Host's browser paired through the actual encrypted channel, after independent Host fingerprint comparison and explicit approval of its exact device key. The remote card shows a masked field and a working submit action. The visible result was **Submitted**, canonical status was **configured**, and the official DeepSeek Bot resumed with `ENCRYPTED-PRIVATE-OK`. No page errors were observed. The driver's final English wait initially expected “Saved”; the captured “Submitted” state was reconciled with canonical state separately.
- `mobile-web-{light,dark}.png` and `mobile-web-saved.png`: Expo Web at 390 × 844, using the real isolated Host through the encrypted carrier. The input is `type=password`; submitting the synthetic value clears the field, renders **已处理**, and settles canonical state to **configured**. The corrected bilingual driver completed with no page errors. These are **Web export captures, not iOS or Android evidence**.

Browser/Host code corresponds to `9a08d65cc114b978b904cc626ab0c8c4c1a6d07e`; the Host implementation is unchanged since `db7fa00`. Mobile export was built at `db7fa00a4dd8dfd501ddea953e1bbb53a5338237`; the form and encrypted wire implementation are unchanged at `9a08d65`. The later commit only adds terminal handling for unsuccessful Connect HTTP responses in push/removal and its regression.

## Runtime scope

Two task-owned DSH `0.2.1-rc.2` Profiles. A synthetic Connect hostname maps locally to the real task-owned Connect origin; no real Cloudflare tunnel or relay deployment is claimed. Actual Device Gateway admission and DSH dispatch were used. Public test vectors use independent Cacophony fixtures; they are not an external cryptographic audit.

Verified: fingerprint + CLI exact-key approval, `connect-status`, encrypted list and synthetic credential set/unset, live roster, image upload with an official DeepSeek reply, byte-identical encrypted attachment download, browser private input, and the Expo Web private-input form. Outer-frame checks found none of the synthetic credential/offer/value/method sentinels. These observations do not prove resistance to every active attack.

Focused tests, static checks, full-suite results and CI status are reported separately in the PR. Native key storage, iOS/Android rendering and lifecycle, real Cloudflare traversal, account enrollment in the deployed relay, accessibility, Human QA and external security audit remain unrun. The native queue is paused by the Human. No merge, release or deployment occurred.

## Real Cloudflare follow-up (2026-10-22)

Runtime code: `683b0cbe9c0f158e80929601f59a312ff5f9c4bf`; this follow-up adds evidence only. See [real-tunnel.md](real-tunnel.md) for method, failure matrix, native build correction and the unresolved first-pairing sheet error. `cf-web-*` captures trusted Web Client submission before/error/success over real Cloudflare. `cf-ios-input/fail/ok` captures the rebuilt native app on the existing QA iOS27, including the real keyboard. All values/accounts are synthetic. No device credential, pairing payload, private key, cloud identity or raw traffic capture is published. These are runtime state evidence; earlier Track A/B comparison images remain above. Physical iPhone, Android, deployed account enrollment, Human QA and external audit are not covered.

## Native pairing fix follow-up (2026-10-22)

[Native pairing report](native-pairing.md) and [redacted results](native-pairing-results.json) supersede the earlier first-pairing limitation: the iOS pairing modal and first-notice transition are fixed, with six light/dark × text-size cases and the Maestro interaction regression passing without a post-pairing restart. Existing QA iOS27 and its qualified native binary were reused. `pair-before.png` records the original error; `pair-*` after images show usable Chats, Activity and the existing QA conversation. This is bounded native pairing acceptance, not a claim that all mobile features, physical iPhone, Android or Human QA are complete.

## Concise native verification follow-up (2026-10-22)

[Fingerprint UI report](fingerprint-ui.md) and [exact-source results](fingerprint-results.json) record the replacement of the long native alert with focused verification and phone-approval steps. Complete selectable fingerprints, native actions and optional details passed six iOS theme/text cases, mismatch and cancellation checks. The previous password matrix remains separate; Android/physical-device/Chinese-rendering/assistive-technology acceptance is not inferred from this run.
