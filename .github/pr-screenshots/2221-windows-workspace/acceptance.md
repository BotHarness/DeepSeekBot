# Windows acceptance — #2221

Date: 2026-10-19 (Asia/Tokyo).
Runtime code: `cb13dfb59ac55d5fa500c7bd06564ed8901ca8d2`.
Candidate: `1.4.1-qa.2221.fixes.2` (local package, not published).
Client SHA-256: `245d72de3aa2bfc3309ff3f0c876d33a260947a26237c4dc29354a69c26b930b`.

## Human acceptance

After receiving the outstanding two-version checklist, the Human reported in the owning task: “我都验收了，没问题，CI 过了的话就 merge”, then authorized opening the PR. Earlier explicit feedback confirmed header and rail blank-space window dragging after the fix. This is Human-reported acceptance, not an automated Windows E2E result.

The checklist covered DSH Desktop 0.2.0-rc.2 and 0.2.1-rc.2:

- Published 1.4.0 to candidate upgrade with existing layout retained.
- Control rail, Home, Channel list, Messages and child panels.
- Native menu, minimize/maximize/restore/close, caption drag and double-click.
- Header/rail blank-space window drag; title-only panel drag/click-close; Channel identity/action isolation.
- Wide/narrow windows and Windows display scaling at 100%, 125%, 150%.
- Global/child panel resize, reopen/restart persistence, exit/reenter Bot mode.

## Captured native evidence and limits

`before-1.4.0.png` and `after-candidate.png` are real Windows Desktop 0.2.1-rc.2 captures with synthetic test data. Before shows the old entry point, where Home is unavailable. After shows the control rail, Channel list, Home and original native caption/menu/buttons. Captures are approximately 1463 × 937; OS scaling differs between the captures, so these are layout/entry-point evidence, not a pixel-matched scaling comparison.

The final candidate capture and installed package hash correspond to the runtime code above. This evidence-only commit does not change runtime code. Screenshots do not prove dragging or restart persistence.

Automated caption dragging failed to move even the native caption; the Human then verified the native interactions manually. Computer Use was subsequently stopped with Escape. No final recording or complete per-version/per-scale/narrow/restart screenshot matrix was saved, and no fabricated substitute is provided. Those cases rely on the Human's acceptance. The earlier 0.2.1 downgrade/reupgrade observation retained an already-new workspace and is excluded as independent old-layout migration proof.

Runnable review path: use separate isolated Profiles for the two official Desktop versions; install published 1.4.0 first, resize flat panels and quit normally, then install the candidate in the same Profile and Electron user data. Do not clear storage. Exercise the checklist above, compare the `.before-workspace-shell` layout backup and imported child proportions, then restore the original Windows scaling.

## Automated checks

67 focused tests across five Client test files passed, including v8 flat-layout geometry import, closed-panel sizes, per-Channel state retention, delayed workspace activation and Windows drag-region separation. Root TypeScript checking, lint, changed-file formatting, release-fragment validation, Client build and candidate packaging passed. These checks are source/build evidence, not native acceptance. CI is reported separately on the PR.

## Recovery

The migration stores the untouched prior layout under the existing layout key plus `.before-workspace-shell`. Reverting code alone does not undo persisted layout migration; restoring the saved layout is a separate recovery operation. Published 1.4.0 packages and release tags were not modified.
