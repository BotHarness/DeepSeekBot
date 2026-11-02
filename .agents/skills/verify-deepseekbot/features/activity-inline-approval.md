# Activity Center inline Tool approvals

## Sub-features

- Full page and Dock open Human Inbox directly, without Overview or statistics.
- Content fills the allocated Panel width in page and Dock, including after resizing; the workspace shell owns outer insets and gaps. Dock body shares the Channel list shell’s 2px padding on all sides, without additional content gutters. Cards match Channel rows: small radius, transparent resting fill and the same hover fill.
- Tool approval preview, single decision, below-card context and source navigation.
- A failed submission remains pending and retryable; success removes the inert card with
  a 220ms exit. Removing a focused card cannot approve the next item.
- Dock decides the card's own Channel request while another Channel remains selected.
- Batch controls appear only in explicit Select mode. Needs you, For you and Other unread are independently collapsible sections; initial state is expanded, with browser/Host-origin collapse preferences. History stays in the header menu.
- Search expands inside the header like the Channel list, uses the Host query across all eligible results (not just loaded rows), and retains section order. Each section paginates independently; failed reads retain existing rows and offer retry.

## How to get to it (user POV)

Enter Bot mode and open Activity Center from the workspace control rail on desktop.
This opens Dock even without a selected Channel. The narrow Web shell exposes Activity
Center in its Bot mode navigation and opens the full page. Wait for responsive navigation
to finish mounting after resizing. Toggle the other panels off from the rail for a wide
list; verify both a narrow allocated Panel and a width greater than the former 760px cap.
Expand **View context** below an approval, then collapse it and choose **Allow once** or
**Reject** directly. **Open source** opens the exact Channel message. Select reveals the
existing checkboxes/batch controls. The header’s Notification settings ellipsis menu owns category/history, sorting, Bot/Channel filters and snoozed items; no filter tabs appear in the body. Verify menu selection, Escape/outside dismissal, and that changing filters clears explicit selection/context.

## Driving it with verify-app

Use a task-local `verify-app` instance and run `doctor` first. The journey requires two
real pending bash requests in distinct disposable QA Bot DMs; it never fabricates approval
state or creates a test-only Host endpoint. Seed them through public `create`, `channelDm`
and `channelSend` calls, using a working model. Both commands use the default authorized
workspace and write only into this worktree's ignored `.humanlayer/tasks/2026-inline-approval/`.
The allow command must be `printf ACTIVITY_2026_APPROVED > <absolute-QA-directory>/approved-by-ui.txt`;
the reject command must be `printf ACTIVITY_2026_UI_PROOF > <absolute-QA-directory>/rejected-by-ui.txt`.
The files must not already exist. Let native bash first report its sandbox denial, then
request its sanctioned one-shot wider-mode retry; never change standing permissions.

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json \
BH_APPROVAL_ALLOW_CHANNEL=<allow-QA-DM-id> \
BH_APPROVAL_REJECT_CHANNEL=<reject-QA-DM-id> \
node scripts/e2e-inbox-tool-approval.mjs
```

The script validates the exact safe commands before clicking. It captures both surfaces,
light/dark and context, injects one failed decision response at the browser boundary,
asserts no canonical decision/file effect, retries through the real Host, and verifies
one canonical allowed-once decision plus the native file effect. It then rejects the other
request in Dock and verifies its canonical rejected decision and absent file. It saves
screenshots, ARIA, console, request/audit/trace evidence, and preserves failures separately.
Inspect screenshots yourself. A successful simulated failure is not evidence of a real
network outage. Model text alone is not execution proof.

Also verify source navigation and Select/Cancel manually. Unit coverage tests remote expiry
before submission; multi-window stale-request UI and all non-Tool request kinds need their
own runtime checks before claiming them. Human QA remains a separate gate.

## Gotchas

- Use the actual accessible Activity Center label; it includes changing unread/action text.
- Wait for the responsive navigation and Dock panels to mount before inspecting controls.
- The script uses Chinese accessible names on this machine. Locale changes require matching
  names, not silently switching to CSS clicks.
- A default provider may have exhausted its quota. Inspect the actual model/tool trace;
  configure only the task's QA Bot to an already available route before retrying.
- Passing the current sandbox mode again does not request approval. Respect the native
  denial and documented escalation modes. An unauthorized `workdir` is a different refusal;
  this fixture uses the existing default workspace and an explicit output path.
- The retired Overview idle journey is recorded in [activity-center-idle.md](activity-center-idle.md).
  It must not be treated as current Activity Center verification.

## Three-section and search follow-up

Verify all three headers on page and narrow/wide Dock, light/dark. Collapse each independently, reload and reopen the panel to verify persistence; arrivals must not reopen a collapsed section. Open Search notifications in the header, type a matching query and a no-result query, then close with Escape or the clear button. Verify focus returns to the search trigger and browsing never marks read or consumes approvals. Search matches beyond the first page through Host `humanAttention` query version 1; unread summaries search eligible message bodies before grouping. Verify Bot/Channel filters, default/chronological sort, handled history and per-section pagination, including stale responses after a search switch and failed-page retry. The CLI equivalent is `deepseekbot inbox --category replies --search <text> --sort mentions-first`; an old Host must refuse the versioned query instead of silently returning unfiltered data.

## Live Activity refresh

Run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-activity-live.mjs`
on a fresh task-local Host after `doctor`. This journey observes 12 idle seconds with no list
polling, delays background reads by 350ms without replacing the loaded empty DOM, creates a
real reply in another Channel, marks it read through Activity, closes the browser's actual
WebSocket while offline, and checks canonical unread recovery after reconnect. Source navigation
must reveal the same message ID in the conversation. A second disposable Bot requests membership in a Human-selected Group: its Activity card
appears, snoozes, returns at expiry and disappears after a decision from the public API.
The journey also runs `inbox-watch` against that same Host and saves its bounded JSON result.

QA Bots use the already configured `deepseek-official/deepseek-flash` route; override only these
Bots with `BH_QA_PROVIDER` / `BH_QA_MODEL` if that catalog route is unavailable. The shared AX
default may return QUOTA even when the alternate configured route works. Preserve that failure;
never treat Host health or a mocked reply as proof of model usability. The browser instrumentation
only closes its transport or delays its own requests; it does not fabricate messages or requests.

Also compare the three empty sections on full page (600×1000) and Dock (1440×1000), light/dark,
with the base revision: background reads must preserve text and section heights. Screenshots,
ARIA, canonical item/message/Source Event IDs and console failures stay in the instance evidence.
Human QA and native mobile behavior remain separate from these Web checks.

The first RC2 run of this journey observed a native `ask_user_question` tool pending without a
canonical Channel question card, including after a timed retry. Preserve the trace and do not
claim native question creation as verified by this journey. The group-join case qualifies updates
to existing canonical action sources; it does not repair or substitute for that request-creation path.

## Bidirectional Approve and sustained multi-Channel load

Run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-activity-approve-sync.mjs`
for two real native bash approvals. It creates disposable QA Bots, validates the exact harmless
marker commands, clicks **Allow once** in Activity and then in the conversation, and checks
both rendered projections, exactly one canonical decision, and the actual native file effect.
Each observer uses a separate browser so a hidden tab's rendering lifecycle is not mistaken
for a live synchronization failure. Saved layout state must be handled when opening a second
page. A resolved request renders an approved notice rather than retaining its pending card.

Run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-activity-load.mjs`
on a fresh isolated Host. It creates 24 silent Groups and drives the public `botToolRun`
`bot_send_message` path (no model tokens or fabricated Client events) after a trusted Human Source
Event in each Group. Three rounds each send 240 messages in waves of 24, with a 100ms minimum
wave period. The actual achieved rate is reported, not assumed. Compare sequential runs on
main and the candidate on the same machine; use `BH_LOAD_BASELINE=1` for the main run.
Capture write/query latency, query counts, browser task time, animation frame intervals,
long tasks, heap samples, bounded draining of in-flight refreshes before the 12-second idle window,
one existing remote.mux connection, and exact latest
message identities across all 24 Channels. This bounded load is not an unlimited-capacity
or long-duration memory-leak qualification. Preserve failed runs and their DOM evidence.

## Channel mute message filtering (#2231, first slice)

Seed Group messages and Human mentions through a real Bot turn using `bot_send_message` with `channel_id` and `mention_human_ids`. The direct no-model send can seed a Human DM, but a Group send requires trusted Source Event causation and must not be fabricated. In the Channel list, right-click that Channel and choose Mute. Verify both Activity page and Dock remove its Related to you and Other unread entries, while pending explicit Human requests remain. Unmute and verify eligibility returns without advancing the Channel read position. Repeat via `channel-mute` in the CLI while Activity stays open, and verify the existing Roster subscription updates the list and global status without a page reload. Capture before/after with the same data, theme and viewport; inspect console and source IDs, `channel-unread`, Inbox categories and read position. The Channel's grey local unread count remains real. The following indicator journey separately qualifies its display preference.


## Independent control-rail indicator (#2231, second slice)

Right-click the desktop control-rail Activity button, or focus it and press Shift+F10/ContextMenu. Verify All notifications, Needs you, Related to you, Other unread and Off as a single selection. Context-menu open must not toggle the Activity panel; Escape/selection must restore focus and outside dismissal must keep the new target's focus. Off hides only the dot: normal click and the shortcut still open Activity, and the accessible label retains true counts. Read retained replies and handled requests never light the corresponding scope.

Use real ordinary messages, Human mentions/replies and a pending Group join request. Compare every indicator scope against CLI `inbox-status` messageCounts and existing Inbox queries. Mute/unmute through the Channel menu and CLI, mark the latest message read, and resolve the disposable join request; verify status refresh changes the dot while filters remain independent. Change Activity search/category and clear its filters, then change the indicator scope; neither setting may overwrite the other. Check persistence after reload, same-origin second-window synchronization, and a different origin or browser context staying independent. Invalid stored values return to All. A deliberately failed status request must show unknown rather than a fabricated zero; Off remains off through failure/recovery. Label this injected transport failure separately from real outages. Capture menu and dot states in light/dark and inspect browser errors and canonical read state. The narrow native sidebar entry is outside the control-rail preference's scope.

## Remote Host Activity actions (#2500)

For the narrow-dock layout regression, use the default left Activity panel beside an open conversation at a 1440×1000 viewport, then widen that same panel. Measure each local and remote mention row, summary and action area. At the observed 229px row width, the summary must retain the row's content width and actions must wrap below it without hiding controls; wide rows may keep them alongside. Exercise long Chinese and English content, loading and failed requests, and expanded request details. Details must span the row. Capture matching light/dark before and after states; the offline Chromium layout regression in `packages/client/test/human-inbox-layout.test.tsx` does not replace this real Host journey.

The page and Dock group each paired Remote Host's Needs you, For you and Other unread under its Host name and a Remote mark. HumanInboxView receives a Host-scoped source for identities, commands and request cards. Approvals and questions reuse the existing cards with the shared request module; join requests, snooze and clear use shared attention-actions. Source links open the remote conversation, not an exact historical message. Search, category, history and sorting query each Host. The Bot and Channel pickers contain This Host's identities, so either filter hides remote groups.

Use two task-local Hosts with different home basenames and ports. Pair B from A through Add remote in the header add menu. Retain the browser profile for baseline and changed captures. Give their built-in Tob different display names and use distinct DM messages to prove same-slug isolation. Use disposable ordinary Bots with deepseek-v4-pro for real pending approvals, questions, joins and group mentions. Never fabricate Inbox rows.

Open Activity from A's rail and narrow page. Inspect all three sections, names and avatars in light/dark. Open B's approval and question details; submit a decision/answer, and verify B's canonical state changes while A has no matching write. Snooze a join, inspect Later, cancel snooze, then accept or decline it. Clear a reply and verify B's dismissed query; failures must stay visible, not look successful. Source links open B's conversation and the narrow Back path returns to Activity. Search and load-more use B's device gateway.

Stop only B's recorded PID to inspect offline cached rows, then restart that task Profile. Revoke A's paired device from B and confirm refused rows disappear. Keep ARIA, console and canonical evidence for each exercised path; label unrun paths separately. This logical two-Host browser journey does not qualify DSH Desktop, physical-machine tailnet or native iOS/Android. Host looks are device-local by design. Full remote conversation images/cards are a separate track.
