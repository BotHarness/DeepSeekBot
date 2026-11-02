# Tob invitation and join decisions

Runtime source: `f50bc6de8211f4ee4755221d369747720578b0c1`.

The pairs show **before and after actions on the same candidate**, not a base-versus-head visual redesign. No UI component or layout changes in this PR. The existing Members and invitation/request history show the result of natural Tob requests executed through native Shell CLI.

- Web: 1440 × 900, dark theme, Chinese locale.
- Installed macOS Desktop renderer: 2522 × 1640 capture, dark theme, Chinese locale.
- Before: one existing Bot member, one pending invitation and three real Bot join requests.
- After: invitation cancelled; first request accepted, second declined; an independent Human CLI declined the third while Tob approval was pending. The old approval refused `stale-channel`, leaving the decline and membership unchanged.
- Both surfaces also verified denying the cancellation/acceptance approval leaves pending state unchanged, direct CLI terminal refusals, and actual same-Profile restart persistence.

Only synthetic local test Bots and Channels are shown. Raw credentials, login URLs and local logs remain private. First-run selector/capture failures were preserved; the corrected journey closes the dialog by its actual accessible container and waits for finite animations before capture. These screenshots do not replace Human review or CI.
