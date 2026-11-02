# Host cloud connection UAT checkpoint

Issue #2155 / Draft #2157; two distinct isolated DSH Profiles and Bots, real Cloudflare UAT. No Prod or merge.

- Initial import/binding runtime: `1a4983f5a69e7f5c7d44ef9fae421912852fde7e`.
- Restart/readback and after screenshots: `eee4047bf8ca51dcf81a2fadfc1935e15f0dc629`.
- Cloud runtime: `3eeed5b05782276b1a02cc2412dd04ab0ec60bca`, schemas 5/4/5.
- `context-replay-light.png` / `context-replay-dark.png`: actual local Messages panel after permission and crash tests, 1440×900, Chinese locale, zero browser-console issues. The three visible messages correlate with canonical local group history; the right pane has no task Session. This image alone does not prove absence of execution.
- Permission/removal/interrupted-checkpoint runtime: `416ac3bec6f5ce095220feb84f09538ea7e748db`.
- Before image shows the imported account **before binding**, not a baseline without this feature. After images show the existing Apps surface retaining its binding after restart. Viewport 1440×900, Chinese locale. Browser console checks reported zero issues. Images were visually inspected.

## Observed

Private CLI import qualified separate channel Agents and saved credentials through the native Credentials provider. A bound through the actual Apps picker; B bound through the parity CLI. Both reported receiving. Human plain text advanced both cursors without a new model turn. Explicit Messaging grants then permitted one fixed CLI send from each real Host; cloud history confirmed the two distinct canonical Agent authors. Both Profiles restarted without deletion; retrying the original Outbox request IDs retained the same receipts and exactly four total cloud messages. The fourth message was a fixed health request while both local work allow-lists were empty; A's model trace stayed at its earlier successful local DM turn, and B still had no model session. This is not an execution-ledger proof.

The initial OpenCode Go model probe failed with quota 429. Only the two synthetic Bots were changed to the already configured official DeepSeek route; A's real DM returned 43. This does not prove cloud work execution or B model readiness.

## Permission and recovery follow-up

`permission-recovery-uat.json` records the next real UAT gate on runtime `416ac3bec`:

- An explicit Messaging grant allowed collection of ordinary text. Even after setting its ordinary wake to immediate and bridging it into a local group whose Bot wakes on all messages, plain text and a typed request from a Human absent from the cloud allow-list remained context. Both appeared in canonical local group messages; the prior model turn did not change. Temporary policy overrides were restored.
- Removing Host B's connection stopped delivery and confirmed native credential deletion. A subsequent cloud message left B's cursor unchanged while disabled. Reimporting the original private credential reset local work policy to default-deny and resumed history. This tests local removal; it does not claim remote Agent revocation.
- An external Node preload, scoped to Host A's exact temporary Profile and cursor statement, sent SIGKILL after Source Event/Inbox commit but immediately before cursor update. The stopped Host had one canonical source, one admission and cursor 8. A clean restart without the preload replayed the cloud message, retained those same counts and advanced to cursor 9. The model turn stayed unchanged. This is deliberate fault injection against a real UAT message, not an unmodified-process crash claim.
- Both task-owned Hosts are healthy after restoration. No other Profile, native device or production resource was changed.

Before the permission fix, a focused regression using the real Core/Messaging implementation reproduced an unauthorized ordinary-message wake. After the fix, the cloud suite passed 14 tests and the wider Messaging boundary set passed 175. Current source CI passed: [run 39093482065](https://github.com/BotHarness/DeepSeekBot/actions/runs/39093482065). The live-model workflow was skipped; the local DM and UAT observations above are separate evidence.

## Retained failures and limits

Initial English navigation selector did not match the Chinese shell. The binding action succeeded, but waiting for nonexistent “已绑定” text timed out; formal readback and fresh screenshots confirmed the actual Bot-name/unbind state. Sandboxed process checks falsely reported dead Hosts; checks with local process access passed, and the attempted relaunch safely refused a running PID. No Profile was replaced.

Initial CI had two endpoint inventory failures and one real recovery-mode startup failure. The fix defers cloud Provider registration when the Operational Database is unavailable; 51 entry/cloud tests, direct root/mobile typechecks, build and lint passed. The aggregate typecheck wrapper hit pnpm's existing dependency-symlink task-state restriction; its two underlying checks passed separately. The follow-up source CI passed as linked above.

The interruption test's first cleanup used an unsupported `--inherit` flag for Messaging policy. The documented stdin payload restored inheritance successfully; connection traffic and Host health were checked afterward. Additional group capture attempts retained selector/locale timeouts. One text wait matched a sidebar preview while the main pane remained Home; visual inspection rejected that apparent pass. These captures are not proof of a successful message-page journey. The corrected path explicitly opens the Messages rail panel, selects the group and waits for its composer; the actual message panel and empty task-session area were visually inspected.

Pending at that checkpoint: WebSocket, organization-wide Agent membership and a fresh mobile-to-two-Host run (the latter is qualified below). The following bounded-work follow-up supersedes the earlier execution-pending status. Current-consumption policy revocation and another local Bot's lack of execution authority have source-test coverage; they are not yet a live work-execution proof. Phone, Android and Human QA are not established by this desktop Host evidence. No video was captured in this checkpoint.

## Bounded model work and restart follow-up

Runtime `f02c2423bce02c264548193ac738013f4eac83ab` / unchanged TOB UAT `3eeed5b` passed the two-Host fixed health path. After explicit owner instructions to the synthetic Bots, A called native `cloud_work inspect` and `forward`; B called `inspect` and `execute`. Channel sequences 13, 14 and 15 contain exactly the Human parent, Agent A child and Agent B result. Original Human and deadline are preserved. A ledger records zero executions; B records one. Restarting both exact Profiles and invoking the same Tool through formal CLI returned the same child and zero additional executions/messages. Local work policies were restored to deny-by-default. See [sanitized assertions](work-model-uat.json).

First attempts are retained: sending while local policy denied work and reception collected only mentions produced no accepted source; that fixture setup was corrected. A then executed the initial request locally despite its updated saved persona. A fresh explicit owner DM established the dispatcher instruction; a new request qualified forwarding. This is a model-choice result, not a silent retry of an already executed request. The initial local execution remains a separate valid result. Both Bots produced real model replies; no synthetic model adapter is used in this UAT run.

Source73tests, typecheck, lint, formatting and build passed before the runtime run. A sandboxed test invocation stalled before test output; it was terminated and the equivalent local-permission run passed in 6.34 seconds. Native phone/Android, hardware diversity, general commands, current-policy revocation during an actual effect, and video are not established by this follow-up.

The f02c2423b CI affected suite passed 2,672 tests and failed its direct-tool catalog assertion, which assumed every Bot tool uses the generic runner. The follow-up records the dedicated `cloud-work` command and makes the parity checker reject generic `bot-tool` as coverage for `cloud_work`; focused catalog/owner/checker tests passed 19. The production runtime is unchanged by that test/checker correction. A new activity capture initially used an accessibility-only label as visible text and timed out; the corrected navigation passed, but shows the owner's acknowledgement rather than the cloud result, so it is not published as work-result proof.

## Phone to both native Hosts — 2026-10-18 UAT

Mobile JS / assigned qa/batch-19: `247a727b8ee832f1fd21318b2c0063a1b2f3c53b`; installed native inputs `494a20f1e`, unchanged by this JS-only window. Host runtime remains `f02c2423bce02c264548193ac738013f4eac83ab`, cloud remains `3eeed5b`. [CI 39095884899](https://github.com/BotHarness/DeepSeekBot/actions/runs/39095884899) passed all applicable checks at 247a727b8, including the affected suite; the optional model workflow was skipped. This evidence update changes no executable code.

The actual iOS Simulator member UI selected the existing organization and host-uat channel, then pressed **Request health check** for Host UAT A. Cloud sequences **16 → 17 → 18** are the phone Human request, A's forwarded request and B's completed result. Both Hosts used real native model tools; the canonical ledgers record **A=0, B=1** executions with original Human/deadline preserved. The phone used Reload messages and visibly displayed all three records. See [machine assertions](phone-work-uat.json).

Images are English/light at 402×874, visually inspected. `phone-before.png` is the same feature before this request, not a baseline without the implementation. `phone-result.png` shows the exact three new messages. `phone-restart.png` and `phone-logout.png` show verified-session and remote-revoked states. [Request recording](phone-request.mp4) is the first 18 seconds of the post-authentication capture; [result recording](phone-result.mp4) is the full 35-second reload/scroll capture, re-encoded for size. Original local recordings remain available. No credentials or personal mailbox appear; IDs belong to synthetic test users/Agents.

Independent synthetic staging authentication was prepared through the authorized test driver; this run does not re-prove Hosted AuthKit/PKCE. Refresh through the UI rotated credentials, cold restart retained the same verified identity/session, and Sign out cleared mobile secrets while retaining trusted configuration. WorkOS readback confirmed that exact session was revoked, latest refresh rejected and baseline sessions preserved. Both independent A/B CLI sessions then passed whoami. The redundant cleanup revoke returned a generic helper failure after logout had already been verified; the exact temporary fixture was removed after those independent checks. No WorkOS configuration was changed.

Initial Metro resolved localhost to IPv6 and the Simulator could not connect to 127.0.0.1; restarting only this runner's Metro with IPv4 resolved it. A cold-start selector ran too early; the loaded page was then observed before proceeding. The generic back command is not available on the presented iOS sheet; the visible native downward-dismiss gesture returned successfully. These are retained test/setup observations, not omitted failures.

The runner closed its driver and own 8091 Metro, restored both Host work policies, and released the assigned lane. Existing shared data, three untracked QA documents, physical-phone 8097 and shared Host 39100 were preserved. No native build, install, erase, Prod operation or merge occurred. Android, physical hardware diversity, Human QA and a new text-size/theme matrix are not claimed by this increment. WebSocket, organization-wide Agent membership and wider live revocation remain open goal gates.

### Live completed-request permission fences

After the phone run, formal `deepseekbot cloud-work` exercised the same native Tool owner against those real admitted sources. Removing the original Human refused both A forwarding replay and B execution replay (`CLOUD_WORK_DENIED`). With Human authority restored but no target grant, A forwarding replay refused (`CLOUD_FORWARD_DENIED`). B could not add a second hop, A could not target itself (`FORWARD_LIMIT`), and A could not execute after committing a forward (`CLOUD_WORK_CONFLICT`). An authorized B replay returned executed0 and canonical executionCount1; cloud history remained at sequence18. All temporary policies were restored. [Assertions](work-denials-uat.json).

This closes six real completed-request denial checks; it does not simulate revocation racing a new running effect or remote Agent credential revocation. Those narrower limits remain explicit.
