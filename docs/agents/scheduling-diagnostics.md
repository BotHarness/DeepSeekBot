# Opt-in Host scheduling evidence

This development-only capture helps distinguish a delivered steer, its asynchronous Memory scan,
and child-command execution. It does not diagnose a historical call failure by itself. It is off
unless `BOTHARNESS_SCHEDULING_DIAGNOSTICS=1` **and** a subscriber is present. No database writes,
call deadlines, admission policy, or scan scheduling are changed.

## Capture in an isolated QA Host

Follow [shared device QA](device-qa.md) and the normal isolated Host launcher. The runtime owner
must approve its restart window; do not attach this to another task's Host or change global
environment settings. Build the exact candidate before launch and keep its source/build proof.

For that one launcher process, inherit these three environment values:

- `BOTHARNESS_SCHEDULING_DIAGNOSTICS=1`
- `BOTHARNESS_SCHEDULING_REPORT=<absolute-private-directory>/scheduling` (a filename prefix;
  create the private directory first)
- Append `--import=<file-URL-of-this-checkout>/scripts/capture-scheduling-diagnostics.mjs` to its
  existing `NODE_OPTIONS`. Use a `file:///D:/...` URL on Windows, with spaces URL-encoded. A plain
  Windows drive path is not a valid ESM import URL. Do not replace pre-existing options silently.

`NODE_OPTIONS` must reach the actual Node Host child, not just the launcher. The collector does
not run in worker threads. Each Node process with observed events writes a different
`<prefix>.<pid>.json`, so inherited child environments cannot overwrite the Host's evidence.
Select the actual Host PID from the existing launcher metadata; a launcher-only file is not proof
of Host coverage. Files remain local. No command arguments, executable names, paths, prompts,
Bot names, output, error messages, or credentials are included in rows.

The collector retains at most 4096 rows and records `dropped` and `rejected`. Every second it
asynchronously writes a temporary file and renames it over that PID's report. There is at most one
write in flight. The timer is unreferenced and does not extend process lifetime. There is no exit
flush: before ending a capture, wait for a report containing the final expected settlement, then
copy the report to the task's private evidence directory. A stale/missing report or nonzero
`writeFailures` is a capture limitation, not a successful empty trace. Windows directory ACLs
remain the owner's responsibility; newly created files request mode 0600 on supporting systems.

## Interpret the rows

All rows have Host `at` (wall milliseconds) and `monotonicMs`, with report `timeOrigin` and PID.
Use this one process clock to compare with Host heartbeat admission/owner evidence. Phone clocks
are not calibrated by this capture.

| Row                       | Meaning                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `steer`                   | The Memory-aware steer returned its actual `delivered` boolean; anonymous `turn` identifies that active Memory turn.                                                        |
| `scan-start` / `scan-end` | One actual scan pass and its observation/inbox follow-up; outcome is `ok`, `stale`, or `error`.                                                                             |
| `scan-coalesced`          | A running scan's `again` flag changed from false to true; repeated requests already coalesced are not repeated rows.                                                        |
| `exec-dispatch`           | Command submitted through `worker` or fallback `direct`; the same numeric `operation` joins its settlement. This is submission, not a measured worker-side spawn timestamp. |
| `exec-settle`             | Command success/error returned on the Host. No error text is retained.                                                                                                      |

Scan `operation` identifies one coalescing chain: successive passes reuse it and are paired in
row order. `exec.scan` links commands launched within that scan's asynchronous context; zero
means no recorded scan context. Numeric identities are process-local and must not be joined
across restarts. Unrelated Git/Tailscale commands may appear with `scan=0`. There is no inference
that all command time is a main-thread pause or that a scan-end is the exact child-process exit.

## Qualify a distinguishing call run

Use only known synthetic WAV with the physical microphone denied. During a canonically active
Bot turn, deliver a further question and require a delivered steer, matching scan start/end, and
actual heartbeat processing during that interval. Keep the existing native/control/media and
canonical Host facts, final UI Hang up, and cleanup proof. Missing overlap is **inconclusive**.
Anonymous turn IDs do not identify a Bot. Establish that only the intended Bot is active and
receiving steering in the window using canonical evidence, or mark attribution inconclusive.
A long surviving call does not substitute for this qualification. Dropped rows, incomplete start
or end pairs, and missing early heartbeat admission limit the conclusion explicitly.

Afterward restart only the owned Host through its normal workflow without these task-local
options. This removes capture; there is no schema or persistent product state to roll back.
