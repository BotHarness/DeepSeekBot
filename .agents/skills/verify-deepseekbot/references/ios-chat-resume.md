# iOS chat background recovery

Run this branch only inside an assigned physical iOS QA window. Follow the shared-device queue and qualify the installed source/build before driving it.

## Prepare

Open a designated QA conversation with known static content. Preserve its original draft, input method, appearance and text size. Reuse the window's existing agent-device session.

Keep the lease in a private JSON file outside Git:

```json
{
  "active": true,
  "owner": "<assigned task reference>",
  "driver": "<cached agent-device entry point>",
  "stateDir": "<owned driver state directory>",
  "session": "<existing owned session>",
  "udid": "<assigned physical iPhone>"
}
```

Choose a reading rectangle in native points: `x,y,width,height`. Include visible static message text above the composer. Exclude clocks, blinking carets, active indicators and overlays. The script rejects an empty region, an out-of-image region or one overlapping the composer.

## Run

From the repository root:

```sh
node scripts/e2e-mobile-chat-resume.mjs \
  --lease <private-lease.json> --owner <assigned-task-reference> \
  --message <known-visible-QA-text> --seconds 5 \
  --reading-region <x,y,width,height> --out <new-private-directory>
```

The script focuses the composer, proves actual SpringBoard foreground, waits 5–30 seconds and resumes Dev without relaunch. It saves private snapshots, original screenshots and a structured verdict. It never builds, pairs or sends.

PASS requires all of:

- Known QA text and a nonzero, hittable composer remain visible.
- The draft value and exact Dev main PID remain unchanged.
- The nonempty static message region changes zero original RGB pixels.

Inspect both screenshots to confirm a real soft keyboard and reachable controls. Third-party keyboard AX metadata may say absent. iOS can merge AX cells and change their coordinate space on resume even when the pixels do not move; geometry-only comparisons are insufficient.

Repeat with empty and nonempty multiline unsent drafts, 5 and 30 seconds, and repeated returns. Add `--keyboard-closed` only after visually confirming dismissal. Check list re-entry and Apple/third-party input methods where available, restoring the original input method afterward. Record font/theme and unavailable platform cases explicitly. Streaming and long-history performance use their separate journeys.

## Finish

The caller owns the existing driver and its teardown. The script attempts to restore Dev foreground if the Home step partially fails; it retains the failure evidence. Restore only the task's temporary draft and settings, stop owned drivers/recorders and verify release under the resource runbook. Raw snapshots and images may contain private text and stay local; publish only reviewed QA-only derivatives.
