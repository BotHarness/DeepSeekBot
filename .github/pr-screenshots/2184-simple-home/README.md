# Home #2184 — macOS Desktop evidence

Captured in an isolated synthetic Profile on official DSH Desktop 0.2.1-rc.2. All interaction and captures used native macOS accessibility/mouse/keyboard. No browser automation, DOM injection, or browser screenshots.

## Observable results

- Wide Home: shared composer and four draft-only starters; below it only Token history and Bot activity, in two borderless solid-color cards. TanStack Charts 1.1.0 renders real Host usage.
- Narrow native window/Home: cards stack; ranges remain operable and Bot names truncate. Below the existing Dock breakpoint, the existing compact chat shell remains in control; this change does not replace that shell.
- Light and dark captures show the final removal of the redundant date/timezone summary, overall total, daily subtitle and Details disclosure. Date-axis endpoints and partial/error notices remain.
- Starter prompt fills the existing Home draft. A real synthetic Home prompt returned `Home 2184 ready.` in the original Tob DM. A second Bot returned `Second Bot ready.`. Canonical week read-back after both replies: 212,620 tokens. Dashboard reads themselves do not call a model.
- Bot rows select the existing DM and reveal Messages when hidden. No duplicate DM was created.
- Home name opens the existing Messaging setting; `Home QA` was saved and restored. The compact trigger's tooltip is directly below it. Default Chinese Tob is 托布 and its uncustomized avatar follows the selected system icon.
- Home hide/reopen preserves the unsent draft, surrounding column width, row height and the Messages Session split (70%). The before/after-toggle images show the same geometry. Native testing found and fixed another edge: resize a column while Messages is hidden, then reopen Messages; the remembered height no longer overwrites that new width.
- Desktop restart retained the test Profile's selected Tob DM, Home draft, global layout and Session split. Model-ready Home has no redundant Configure button.

## Evidence boundaries

`before-wide.jpg` is the actual base Desktop before these changes (English, default identity, before the two test replies). After images are Chinese after name/icon editing and genuine model activity. They demonstrate the same entry and its replacement, but are not pixel-identical fixture pairs. Capture dimensions differ after native window resizing.

Empty usage was observed before generating usage. The final native pass additionally verified:

- Synthetic partial reporting: the native Refresh action shows the partial-data notice while retaining the daily chart (`partial-native.jpg`).
- Recoverable synthetic usage-storage failure: Refresh shows the unavailable/stale-data notice and retains the previous chart (`error-native.jpg`). Restoring the table and original rows restores normal data; all fault fixtures were removed.
- A valid but unavailable synthetic Tob model route replaces the input with Configure. Opening the native setup dialog and cancelling returns to Home without sending (`model-setup-native.jpg`). Restoring the route and restarting restores the original unsent draft and hides Configure.
- Home was customized to Option+Shift+Command+J through native settings. Activity's binding was explicitly disabled in the isolated Desktop shortcut document. After restart, J closes/reopens Home, the Activity tooltip has no shortcut, and its former shortcut does nothing. This tests retained custom/disabled settings, not a newly added unbind UI.
- The final source build `0e17b61285cabed80a865d6a87baf9ddd4a18652` was restarted in Desktop. Home draft, custom/disabled shortcuts, both recent Bot rows and normal usage were restored. Clicking Fresh install Bot reopens its existing conversation with the Session split still at 70%; closing Messages returns to Home. `list` read-back includes each Bot's canonical `lastActivityAt`.

The supplemental partial/error/model captures were taken on the same final UI build before the last Host-only slow-reader invalidation fix; the final wide-light capture and restart check include that fix. Earlier dark/narrow/name/layout captures remain valid for unchanged presentation. Source tests separately prove completed activity survives subsequent Human/other-Bot messages and restart, excludes inaccessible history, and remains correct when live frames coalesce. They also cover rollback after partial Dock restoration and quota failures during draft migration/write. These synthetic source checks are not claimed as native fault injection of browser storage or Dockview internals.

Focused corrective regression: 168 tests across nine files passed. Root/mobile typecheck, lint, format and build passed. The earlier bounded full local run had one React Native Flow parsing suite failure; the same suite ran and passed in GitHub CI at the earlier reviewed head. Final-head CI is tracked on the PR and must pass before merge.

Screenshots contain only synthetic names/prompts. No provider keys, login URLs, private conversations or raw Profile data are included. This evidence is not old/new DSH final-package installation proof, Human approval, merge permission or release qualification.
