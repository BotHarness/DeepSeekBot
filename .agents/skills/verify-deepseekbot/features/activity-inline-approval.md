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
