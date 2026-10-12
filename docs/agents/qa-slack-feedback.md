# Slack feedback candidate QA / Slack 反馈候选验收

This is the bounded native qualification path for [#1161](https://github.com/BotHarness/DeepSeekBot/issues/1161), not a release, pin promotion or production receiver cutover. Automated checks do not prove Slack rendering.

## Prepare an isolated pair

1. Build the issue worktree and the candidate Provider. Record the BotHarness base/head plus local diff, Provider base/head plus local diff, and `providerRuntimeDigest` for the actual installed Provider. Uncommitted candidate changes are not represented by their base SHA alone.
2. Boot a task-owned Profile through `scripts/dev-instance.mjs --home <qa-home> --port <qa-port> --build`. Stop only its exact Host PID before changing composition. Add the built candidate as a `file:` dependency and its Bundle to that Profile's manifest. Restart the same Profile without `--im-provider`, which selects the separate qualified pin. Verify the installed runtime digest. Do not change the published pin or another task's Profile.
3. Have the Human sign into the shared browser and confirm the intended workspace, dedicated QA app, test public channel and app DM. Check installed Bot scopes, Socket Mode and event subscriptions. Obtain separate approval before adding scopes or reinstalling. Keep credentials in the local credentials service, never chat, Git, evidence or logs.
4. Connect only the designated QA app. Verify no other receiver owns it; do not copy another Profile's credentials or interrupt an existing receiver. Bind it to a task-owned PersonaBot and verify a real model reply locally before testing IM.

## Native verification matrix

| Case                          | Native result and canonical facts                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Channel @mention              | Exactly one Source Event and Inbox Admission; 👀 on the original Human message. Only its accepted reply Outbox produces ✅, not the topic root. |
| App DM                        | Same admission/reply correspondence; reaction on the original Human DM and reply through its bound identity.                                    |
| Silence, waits, delegation    | Admission may show 👀; no ✅ without an accepted source-specific reply.                                                                         |
| Context-only or muted message | No reaction. Muting while a feedback write is pending must refuse it at the current fence.                                                      |
| Failed/uncertain reply        | No ✅. Preserve Outbox result and do not retry an uncertain send to produce better evidence.                                                    |
| Permission failure            | Intake and replies remain usable. Missing reaction scope is a bounded failure, not permission to expand the app.                                |
| Reconnect/restart             | Previously attempted reactions are not replayed; a fresh message can produce new feedback.                                                      |
| Revocation/cancellation       | Pending writes refuse the current account, Registration, Consumer or source fence; no automatic rebind.                                         |

Adding ✅ precedes removing the app's own 👀. Partial cleanup can leave both visible and an unknown attempt; never remove Human reactions, rewrite uncertainty or replay the attempt. Provider serialization is per source and must not occupy the Bot transition queue during network writes.

## Evidence and handoff

### 2026-10-11 live candidate checkpoint

The Human authorized the dedicated QA app's Bot `reactions:write` and `im:history` scopes, `message.im` subscription, message input and workspace reinstall. Credentials were transferred through the browser's copy/paste controls into the isolated local setup, without printing token values; the temporary clipboard was replaced afterward. The task created a separate App Token with only `connections:write`, retained existing tokens and left other QA apps untouched.

The installed candidate has 412 runtime files and SHA-256 `27cf83ab50eda19681cf34aab051a516c39d78fe3049e10a3555c5e1f1ef9bb4`. This identifies the installed uncommitted Provider candidate, not the published pin. The local PersonaBot produced a real DM reply through `channel_send` before external testing.

| Check                    | Observed evidence                                                                                                                                                       | Limit                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Public-channel mention   | One admitted source, source-specific accepted Reply Outbox, native-client original-message check and original-thread reply                                              | The first received attempt was unknown, not retried; a fresh post-restart silent mention later had accepted eyes and matching native-client DOM |
| App DM                   | Fresh source had accepted eyes, accepted source-specific reply, accepted check and own-eyes removal; native-client DOM matched the original Human message and bot reply | Screenshot and Human QA gates remain open                                                                                                       |
| Silence                  | Fresh DM and channel sources had eyes without an answered attempt                                                                                                       | Does not qualify every delegation or wait variant                                                                                               |
| Muted DM                 | Canonical source and silent Admission retained, no feedback object, no native-client reaction; mute restored afterward                                                  | Dispatch-time mute races remain automated coverage, not live injected proof                                                                     |
| Ordinary channel message | No Source Event or Admission under the Provider's current mentions-only intake and no reply or feedback                                                                 | This verifies exclusion, not admitted context-only sources                                                                                      |

Two early received attempts remained `unknown`; their cause was not captured and must not be retrospectively called permission failure or timeout. A temporary read-only fetch probe recorded only Slack API method, duration, status and error code, never headers, tokens or message bodies. Fresh received and answered operations succeeded; this does not erase the earlier unknown outcomes or authorize replay.

The shared T3 browser snapshot operation was intermittent. Saved frames did not paint the message list even when its DOM contained the settled reactions; resize attempts timed out. Those blank frames are not usable visual evidence. Obtain a fresh painted native-client capture, crop unrelated content, and verify reviewer rendering before closing the issue or promoting the Provider.

On 2026-10-12 JST, a fresh native-client read after reload confirmed the clean-restart channel source's check, absence of eyes and original-thread bot reply. The silent channel source retained eyes, while the ordinary non-mention source had no reactions. The diagnostic probe was absent from this restart. T3 still reported the preview as not visible after opening it, and snapshot capture failed; the painted screenshot gate remains open. The focused feedback suite passed 19 tests, and format, Release Ledger and diff checks passed.

Later that day, while the shared T3 preview was visible, one painted native screenshot captured the silent channel source's eyes, the answered channel source's check and its original-thread reply. Focused crops were saved privately, excluding the unrelated sidebar. This is after-state evidence for separate sources, not a matched same-source before/after pair or reviewer-rendered evidence. A fresh marked channel mention again had accepted received and answered feedback plus a native-client check; the preview became hidden before its capture, so its visual transition remains uncaptured. DM screenshots and Human QA also remain pending.

The next visible-preview retry captured painted channel and DM after-states. The DM crop shows the silent source's eyes, answered source's check with its bot reply, and muted source without feedback or reply. A new DM test had accepted received and answered facts and matching native-client check and reply. Its same-source transition capture again failed when the preview became hidden. DM after-state evidence is now available privately; matched transition capture, reviewer rendering and Human QA are still open.

A subsequent visible-preview run captured a continuous native DM recording and extracted a matched pair for one marked source: eyes before the reply, then check without eyes with the bot's reply. The recording also shows a brief eyes-plus-check intermediate state before own-eyes cleanup. Canonical source feedback recorded both operations as accepted, correlated with the accepted source-specific Reply Outbox. Focused PNG crops and a cropped video exclude the unrelated sidebar and remain machine-local. This closes the DM same-source visual capture gap, not reviewer publication or Human QA. Channel visual after-states and original-thread reply evidence remain separate from the DM transition proof.

Capture matched native before/after screenshots in the authorized test conversation, cropping unrelated messages. Correlate visible effects with sanitized Source Event, Admission and source-specific Outbox/feedback facts. Record actual candidate digests and distinguish automated checks, running Host proof, platform acceptance, native rendering and Human QA. No live credentials, workspace/user identifiers, Profile paths, browser sessions or private chat content belong in public evidence.

Stop only the task's receiver when handing off; retain the private reconstruction setup locally. End the bounded issue at its PR and Human-QA gate before starting #1415 or #1046.

中文：先完成专用测试工作区／应用的浏览器登录和权限确认，再启动任务独占的 Profile 与接收器。公共频道和应用 DM 必须分别核对真实原消息反应与本地权威事实；静音、失败、未知、重启和撤销不靠成功示例推断。截图只包含授权测试消息，凭据与私密配置不进入公开材料。完成后停在本 issue 的 PR／Human QA，不自动扩展到普通角色配对或原生审批。
