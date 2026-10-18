# Mobile cloud channel name marks — UAT evidence

Issue #2161 / Draft PR #2162. Assigned shared iOS Simulator batch 20, 2026-10-18. No Prod, native build/install, remote PR merge or WorkOS settings changes.

- Before: `c183a2df0ed891c351da90a7937c81b38ee4597e`.
- After: `42c900eb790fe2dd5b4c00553a24b4f5607a8ff7` (runtime code identical to `6c7557419c2d39efe8e7a9fb0026938c827e1f1e`).
- Native inputs unchanged from installed `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`; existing development client, 402 × 874 screenshot pixels, English.
- Cloud service UAT release `3eeed5b05782276b1a02cc2412dd04ab0ec60bca`. Actual service data; independent synthetic user session.

## Display checks

48 unmodified screenshots: before/after × member/guest × list/conversation heading × default/intermediate/maximum × light/dark. The three iOS content sizes are `large`, `accessibility-medium`, `accessibility-extra-extra-extra-large`. Matching filenames identify each pair; JSON records count six completed cases per surface. AX snapshots separately asserted the unchanged channel name and the new `Cloud channel` accessible label.

The trailing cloud appears on both list names and conversation headings. Short names stay adjacent; long names wrap with glyph space reserved. Maximum-size content scrolls: a screenshot may show only part of the whole card or action. Actual maximum-size interactions returned to the list and opened the guest channel successfully. The Expo development-menu gear is present in these authentic development-client captures; it partly overlaps the glyph in the maximum guest-title viewport. This overlay is not application UI or proof that every pixel is unobscured. The same glyph is visible in the remaining sizes and list view.

## Access and session checks

The synthetic B user has ordinary member access to one workspace and only a direct channel grant in another. CLI verified no membership in the guest channel's organization and denied sibling-channel access. After capture, only this run's guest invitation was revoked: both revoked-channel and sibling access were denied, and the native refreshed list showed no guest channels. Both independent CLI sessions remained valid.

The mobile session survived cold restart and service verification. Its checkpoint kept the same session identity while refresh credentials rotated. Logout verification is recorded in the PR's batch result; do not infer logout from these screenshots alone.

## Retained first failures and limits

- Initial CI failed only the design table's formatting; corrected before this frozen runtime, then all applicable CI checks passed (run 39098033103).
- The first after attempt still loaded baseline JS because CI-mode Metro did not watch the checkout update. Its assertion failed; restarting only the assigned Metro loaded the frozen code. That attempt is excluded from these 48 cases.
- After resizing, an offscreen open button did not match. An erroneous subsequent title capture was discarded; the driver now checks the correct surface before collecting cases. The successful rerun produced these title files.
- A sandboxed driver read reported its daemon unreachable; the authorized simulator call succeeded without replacing or deleting shared daemon state.
- iOS native display/interaction evidence only. Android native, VoiceOver spoken output, physical iPhone and Human acceptance remain unverified. Source tests/CI and this Simulator run are distinct evidence.
- This slice does not implement desktop origin projection, cloud organization entries in the left sheet, or invitation URL/QR sharing. It does not close issue #2161 or the wider collaboration goal.
