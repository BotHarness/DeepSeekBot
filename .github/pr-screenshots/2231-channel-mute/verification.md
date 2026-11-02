# Channel mute filtering — #2231 first slice

Baseline: `132b33e3c9965fcb5a01066a134f2744269b2d75`. Captured 2026-10-19 (Asia/Tokyo) against the baseline and this PR's implementation, on the same disposable Profile and message data. DSH CLI: pinned `0.2.1-rc.2`. Only synthetic QA conversations are shown.

## Observable result

- Before/after pairs use the same theme and viewport: Dock 1440×900 (light/dark); page 800×900 (dark). The Channel is muted in both captures. Before: its ordinary message and mention still appear. After: both disappear from Activity.
- Existing Channel context menu → Mute hides messages without reloading the page. CLI `channel-mute <channel> --off` restores them in the already-open Activity; one observed transition took 1,240 ms, not a performance guarantee.
- CLI `inbox --category replies` and `inbox --category unread` agree with the UI. `channel-unread` retains the muted group's raw count of 2. Its read position remains unchanged.
- A second Bot requested to join that muted group through a real Human DM with a selected Channel reference. The pending request remains visible and actionable, while the group's message categories stay empty. It was not approved or rejected.
- Browser warning/error collections were empty for the successful captures and interaction run. The grey local count is intentional. Unmuted QA DMs and a pending request can still light the global indicator.

## Setup and proof limits

Group messages and mentions came from real model turns through `channel_send`, preserving trusted Source Event causation. The first configured provider hit its quota; the disposable QA Bot was switched to the existing DeepSeek provider. The quota-error DM visible in some captures is unrelated setup evidence and belongs to an unmuted Channel. A direct Group tool attempt correctly refused missing trusted causation. No production conversation, credential, Host token or Profile database is published.

Early browser attempts selected the hidden native Activity entry or used an incomplete row accessibility snapshot. The final run targets the visible control-rail button and the accessible Channel menu. Initial failures remain in local evidence; they are not claimed as product regressions.

## Verification

- Red/green: restoring the baseline query/feed made the two new regressions fail; restoring the implementation passed.
- CI-selected related suite: **214 files passed, 1 skipped; 2,021 tests passed, 1 skipped**.
- Focused Host/Client coverage: mute/unmute, DM/Group, simultaneous mention+reply counted once, read retained replies, search/pagination, stale in-flight responses, consumer disposal, global status without Activity open, and pending requests. The final pagination fixture places the unmuted message earlier than muted messages; its 3-test file passed again.
- Lint, format, typecheck, build, bilingual changelog check, docs build (600 pages), and the generated changelog public-surface test passed. Chinese OG font regeneration produced no committed font change.
- Real Web/CLI checks above are separate from source tests. Native iOS/Android, every Human-request subtype, and Human QA were not run. Host restart persistence relies on the existing Roster implementation and its regression coverage; no new live restart claim is made.

## Human check and integration

Open Activity and use the synthetic Quiet QA 2231 Channel menu to toggle mute. Its message groups should disappear/reappear while the pending join request and grey per-Channel unread state remain. Repeat with Activity in a page and a Dock. Do not decide the request unless intentionally testing that separate behavior.

This is a partial implementation of #2231. Independent control-rail dot preferences are deferred. PR #2232 also edits the Activity feed and related documentation for general live refresh: whichever lands second must integrate the shared invalidation path and rerun the stale-response/mute tests. No additional stream or polling loop is introduced here. Human feedback and explicit merge authorization remain pending.
