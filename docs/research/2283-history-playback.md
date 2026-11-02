# Android paged history must bypass stream playback (#2283)

## Result

A real long-history scroll on main exposes saved messages that remain `…` while reading older pages. The candidate excludes older committed journal revisions from new playback admission. This is a correctness prerequisite for meaningful scrolling measurements; no FPS improvement or 120-FPS qualification is claimed.

## Reproduction and cause

The dedicated synthetic conversation contains 300 unique messages: 240 plain messages, 30 code blocks and 30 tables, totaling 32,961 UTF-16 units. Ordered fixture SHA-256: `22302e29c3dc50f5303934d621aceba96264affa762e7c868cf4640fe68d4ad3`. Canonical timeline paging verifies the complete bodies and ordering.

On main `d53e03aebaab42d541294f48eae1341cd3de1ad6`, scrolling beyond the first 50 messages prepends old committed messages. Playback treats previously unseen IDs as new replies and creates empty players. Reading away from latest correctly pauses playback, leaving these incorrectly admitted historical messages empty indefinitely. A native capture after a later idle period still contains 15 ellipsis placeholders. A minimal real Host-client/Conversation pagination regression fails on main because `answer 8/10/12/14` become empty presentation bodies.

The candidate computes the maximum committed revision in the prior snapshot. A newly seen committed Bot message can create a player only if its revision exceeds that boundary; legacy messages without a revision retain their existing behavior. Existing draft binding and playback queues remain intact. Journal revision, rather than timestamp or visible array tail, handles same-time replies and pending Human messages.

## Native protocol

Physical Android, minified arm64 Release; source baseline d53 above, baseline APK built at runtime-equivalent e25c404674f99a18559847493018d8ba782ebce0. Candidate runtime source: `554e28a00c1f7c0e58d611c2b408421e8d235f70`. Later test-only commit dce9b0323358b4bf49febe0bca41e6501d94edce does not alter the installed runtime. Both APKs have the same private QA-only loopback transport allowance; that allowance is not committed to production configuration.

- Same target `AX_HISTORY_0230`, scale 1.0 / 1.3 / 2.0, light/dark, fresh app process each case. Baseline: target absent in all six cases; respectively 22, 22, 20, 20, 17 and 16 ellipsis nodes.
- Candidate: all six visual cases contain complete saved history and zero ellipsis nodes. Native screenshots were inspected. Target presence in accessibility is recorded separately from precise positioning: one case lands near rows 234–237 and others place the requested row near an edge. Exact centering remains unqualified.
- Actual 24-gesture scrolling traverses 300 → 240 → 180 → 120 → 60; captures at each stage have no ellipsis. After a five-second idle, the same nearby messages remain readable. Tapping Return to latest returns to 295–300. Pixel-perfect anchoring during momentum was not qualified.
- Long press opens the real message menu; default-font copy/paste and maximum-font keyboard interaction are checked separately.
- Both baseline and candidate naturally complete the plain (19,221 UTF-16 units) and rich prose (21,492) replies. Saved bodies match each fixed fixture exactly. First-visible-end brackets: plain baseline 34.737–36.780 s / candidate 34.188–36.244 s; prose baseline 40.241–42.252 s / candidate 40.224–42.226 s. Single matched behavior controls are not comparative timing trials; the baseline plain run overlapped the end of a host-side build. Both arms report active 120 Hz, which does not qualify app FPS.
- iOS native, peak memory and the overall 120-FPS bar remain unqualified.

## Automated coverage

48 focused tests pass, including real pagination, old history/new reply interleaving, same-time draft matching, pending Human messages, cached recovery and interrupted recovery. Full mobile suite: 818 passed, 9 skipped; type checks and repository lint pass. The process-local English Intl default used by prior slices is retained only for test execution to accommodate existing English-string expectations on this Chinese-locale machine; it does not ship.

## Retained failures and measurement limits

- A margin swipe failed to move the list; excluded from motion calibration.
- A CLI read requested more than the 200-item limit before seeding. A later legacy newest-first cursor was selected from the wrong end and produced overlapping reads; explicit canonical timeline cursors verify exactly 300 unique stored messages. No duplicate stored messages were created.
- The initial natural-completion driver tried reading a producer log before it existed. Its failure is retained; a new conversation and corrected existence check are used for the retry.
- A 30-second calibration trace includes real input/scroll events and has no error or data-loss stats. Its saved historical bodies were incorrectly collapsed, so it cannot support a before/after FPS improvement claim. Broader history/combined performance work must use the corrected baseline.

Agent task: `codex/local/01a15013-1309-7d42-a802-be72a1185b41`.

## Remaining native gaps

Both main and candidate reproduce a separate failure after returning from distant history: the last table message retains its bubble height and ending paragraph but the table region stays blank. The same main/candidate screenshots are committed; #2284 tracks the next diagnosis. This PR does not claim all history rendering or positioning is correct. The baseline accessibility capture after returning cannot reach idle because of its historical replay backlog; only its screenshots are used for that comparison. The native app remains in front, and Host observation is healthy; the Web observer has no native Client telemetry.

[Sanitized measurements](data/2283-history-playback.json) and [matched captures](../../.github/pr-screenshots/2283-history-playback) preserve results and limits.
