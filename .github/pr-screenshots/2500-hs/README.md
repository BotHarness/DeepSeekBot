# Host settings evidence — #2500

Captured on 2026-10-22 in two isolated DSH Hosts, using real UI pairing and one
task-owned Chromium profile. Screenshots are unmodified captures at 1440 × 900,
English, with light/dark themes and disposable Bot fixtures. No model calls were
made. Pairing offers, login URLs, credentials and private Profile files are excluded.

## Revision and image map

- Before source: `8f4e650db551ae8458211634872ed291ff4e5a4f`.
- After source: `08290c7192ad87a6f557a582d03bd2dce6d45aeb`.
- Owner/CLI runtime source: `01c0f4009472a5552ee6a5619619096c1e09acff`.
- The only production delta from 01c to 08290 makes the existing Appearance and
  Notifications hints visible through Note (two files, four additions/two removals).
- Filename: `b` = before, `a` = after; middle `a/n/m/s` = Appearance,
  Notifications, Models, Storage; final `l/d` = light/dark.

Appearance's predecessor is the separate icon dialog. Notifications previously
put its long hint in the sidebar header. After captures show Host icon/name in the
header and five navigation items. Both original hints are visible in the body.
Models and Storage retain their existing content. The background Home fixture
and local Host icon differ slightly across captures; the remote Host under test
uses the same default name/icon/color. The before light Notifications capture
contains slight background bleed during the dialog transition, but its text and
controls are readable; the failed later recapture is excluded.

## Executed checks

Actual toolchain: Node 24.21.0, pnpm 12.4.2, process GOMAXPROCS=2 and Vitest
maxWorkers=1. Checks ran serially.

| Check                                     | Source                   | Actual result                                    |
| ----------------------------------------- | ------------------------ | ------------------------------------------------ |
| Frozen install                            | da6fb748b9a2             | exit 0                                           |
| Three behavioral regression cases         | original 1ab2b33a7afe    | exit 1; all three fail for the intended behavior |
| Same three cases                          | da6fb748b9a2             | exit 0                                           |
| 13 focused files / 107 tests              | da6fb748b9a2             | exit 0                                           |
| Root/mobile typecheck, lint, format check | da6fb → format-only 01c0 | exit 0                                           |
| Baseline complete build                   | 8f4e650db551             | exit 0                                           |
| Candidate complete build                  | 01c0f4009472             | exit 0                                           |
| Final complete build                      | 08290c7192ad             | exit 0                                           |
| Final root/mobile typecheck, root lint    | 08290c7192ad             | exit 0                                           |
| Final two changed files format check      | 08290c7192ad             | exit 0                                           |

Builds produced the Client and natural bundles. The four tracked Browser/Computer
client JS/map artifacts remained unchanged. The 107 focused tests were not rerun
for the two hint placements. The full repository suite was not run. Local CI-plan
preview selects **full** because the old settings file was removed/renamed and its
importers cannot be traced; mobile checks are selected too. This is a plan, not
a CI result. An earlier automatic install was cancelled with exit 1 and ran no
tests; it is separate from the successful frozen install.

## Runtime facts and limits

At 01c, two real same-origin tabs had distinct Client IDs and shared actual Web
Locks. A stale second-tab revision was refused after the first tab saved a name.
Subsequent field updates preserved the name and other Host records. CLI readback,
reload persistence, a successful pre-deadline write, invalid input and unknown
Host refusals were observed. Local display-name changes left Host metadata alone.

The real lock test held the shared lock in one tab while another tab's CLI request
expired. Releasing it did not write the expired change. A separate synchronous
storage-read delay crossed wall-clock expiry while Client timers could not run;
the stored look was unchanged after the delayed operation. Both CLI timeout
results were **outcome unknown**, followed by readback; neither is cancellation
proof. Early process death or HTTP disconnect before expiry remains unknown.

Explicit, restored fault injection covered storage-read failure, blocked writes,
continued refusal after repair until explicit refresh, successful refresh,
distinct storage-write failure, and missing-WebLocks refusal. These are controlled
failure-path checks, not naturally occurring browser quota or permission failures.

At 08290, both hints and the Appearance/Notifications/Models/Storage views were
visually checked in light/dark. Remote Models, Usage and Storage CLI reads exited 0. Token usage opened using the actual dialog button and showed zero tokens,
with Memory still loading: this is partial UI proof. Earlier name-only selectors
hit another heading, so those mislabelled Usage captures are excluded. There is
no qualified matching Before Usage image.

Notification kind changes persisted. An explicitly delayed permission Promise
resolved after navigating away without writing; this is owner lifecycle evidence,
not proof of OS-granted notification delivery. Remove/re-pair cleared the saved
notification choices and restored disabled/default choices. With the remote Host
stopped, appearance/name and notification kind edits still saved; Models showed
the remote-unavailable state without serving-Host fallback.

## Preserved failures and outstanding acceptance

- An earlier heavy run was reported cancelled; cause unknown. Its baseline
  background-tab driver timeout and observe/doctor results were retained.
- The first candidate browser exited during capture: `Page.captureScreenshot:
Target closed`, followed by browser connection/session closure. Host doctor
  remained healthy. No cause was established. The one authorized browser rebuild
  succeeded; it does not erase the original failure.
- The supplementary Chinese tab later became blank after the remote Host was
  offline. Console reported `locale subscriber crashed`,
  `uiConversation.binding: unknown session`, and a released Session reference.
  Observe exited 1 while Host doctor exited 0. Attribution is unresolved.
  Chinese settings screenshots and the supplementary This Host UI capture are
  **not passed**. No production fix was made for this finding.
- At 560 px the existing mobile shell unmounted the dialog. No narrow settings
  acceptance is claimed. Re-run this journey in its supported shell before
  claiming responsive acceptance.
- Background Client-unavailable refusals, a CLI argument-driver mistake, and
  name-only ARIA selector mistakes are retained separately from product results.
- Native/device UI, live model calls, OS alert delivery, destructive storage
  cleanup, model-preset mutation and live Browser/Computer viewer removal were
  not tested here. Shared native-owner contracts and T7/T8 paths have focused
  source-test coverage only. Human QA and CI remain separate gates.

Review history: R1 Standards **0 hard + 2 P3 heuristics**, Spec **3 P2**.
R2 at da6fb: Standards **0 hard / 0 new heuristics**, Spec **0**; original findings
statically closed. The parent directly reviewed the tiny 08290 hint delta with
no new finding. Static review does not imply runtime acceptance.

## Follow-up path and release

Keep the PR draft pending diagnosis of the Chinese session/locale failure and
Human QA. In a separately scheduled window, reuse isolated profiles, activate the
target tab, capture console/ARIA and observe/doctor before retrying the Chinese
remote settings journey. Check This Host UI and remaining Usage/narrow states;
native compatibility goes through the shared Android testing queue.

All task-owned Hosts/browser/build processes were stopped and exact recorded PIDs
were checked absent at **2026-10-22T05:13:32.1553288Z**. Task ports had no listeners.
The heavy window was explicitly released before PR preparation. Private logs,
ARIA snapshots, command receipts and the release record remain in the task's
ignored evidence directory; none of the private runtime profiles are published.
