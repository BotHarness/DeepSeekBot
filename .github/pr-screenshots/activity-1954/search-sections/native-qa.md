# Activity search section follow-up — 2026-10-16

- PR #1966 remains Draft; no merge or release.
- Before source: `6434877ddb6cdab5da585ea376dd83d41187bdff`; matching screenshots are the previous statusbar/after-search-light.png and after-search-dark.png.
- After source: `df40659ff1e2d0f3ce3f2834cb88d09ee1a029ca`; equivalent QA cherry-pick `7477699c3` on qa/batch-7.
- Same iOS 26 Simulator, compatible installed Batch 6 development binary, task-only authenticated Host, default text size and unedited 402 × 874 PNGs. Relative times/unread counts advance; query `needle` selects the same earlier message.

Actual native checks passed:

- Searching `needle` shows only Other unread and its matching message. Needs my action and For you are absent, including their empty messages.
- Searching `needlezzznomatch` shows only “No matching activity.”, with no section headers.
- The native clear control restores normal sections, including the empty action section, while retaining editing.
- Matching and no-result states inspected and captured in light and dark appearances; status-bar contrast remains readable through normal navigation.

Source checks: 434 mobile tests passed / 8 skipped; mobile typecheck, repository lint/policies, formatting and changelog checks passed. Both review axes reported no new actionable findings. Tests also keep cursor-bearing sections reachable and preserve a matching collapsed section. No Host query contract changed.

The prior report’s boundaries remain: full developer reload may reset status-bar contrast until Activity re-entry; Android/physical-device/accessibility and full native lifecycle acceptance are still untested. Existing compatible binary reuse does not qualify latest-main native integration. No request was approved or answered in this follow-up.
