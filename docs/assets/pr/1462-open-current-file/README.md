# Open current file from Evolution diffs — #1462

Captured through the real UI of an isolated Host on DSH **0.2.0-rc.1**, macOS, Chinese locale, dark theme, 1280 × 800. Before uses base `2b4e2680` (with #1461 merged); after uses this branch. Both Profiles hold the same QA Memory commits: add `notes/a.md`, `old.md` and `gone.md`; rename `notes/a.md` to `notes/b.md`; delete `old.md`. The working tree then recreates `old.md`, removes `gone.md` and edits `notes/b.md`.

## Screens

- [before-commit-diff-dark.jpg](before-commit-diff-dark.jpg) / [after-commit-diff-dark.jpg](after-commit-diff-dark.jpg): the rename commit. Each file row gains **打开当前文件** with the shared dropdown. The old path shows a neutral icon because nothing exists there now; the new path shows the default application's icon.
- [after-missing-dark.jpg](after-missing-dark.jpg): clicking the old path's button reports that no file exists now, that nothing is rebuilt, and that this commit marked the path as deleted.
- [after-working-diff-dark.jpg](after-working-diff-dark.jpg): the uncommitted diff of the removed `gone.md` has the same control.

## What was exercised on the real Host

- Delete commit, `old.md` (marked D, recreated later): the button resolved to the Host's default application for the current file, so the old D marker did not block it.
- Rename commit: `notes/a.md` reported the present absence with the commit's deletion note and launched nothing; `notes/b.md` resolved to the current file. A one-time choice from its dropdown was accepted by the Host ("打开请求已发送到 Host").
- Working diff, `gone.md`: reported absence with the working-change deletion note.
- Clicking the file name still collapsed and expanded the diff; the button and its dropdown did not toggle it.
- `git status` and `HEAD` of the Memory repository were identical before and after the open actions.

## Not covered here

- A visible native window was not independently observed, and the application was already running, so only the Host's accepted dispatch is evidence. The opened content was not read back from the external application.
- Light theme, 390-wide layout, English copy, a branch switch on the real Host, a tunnelled browser, Windows and Linux were not captured for this slice; the shared control's light and narrow rendering is in the #1461 evidence, and branch change, late removal and path refusal are covered by focused tests.
- The Memory panels defer loading while the browser pane is hidden; the captures forced the page's visibility state for the test session only.
