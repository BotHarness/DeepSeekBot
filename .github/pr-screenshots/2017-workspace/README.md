# Workspace Control Rail — #2017

- Base: `0fbb4505c3339f28b5c92196e0276c952c631b1f`; `before-web.png` is the real baseline Client, not a mockup.
- Web: isolated DSH 0.2.0-rc.2 Host, Chromium, English, dark, 1440 × 900. `after-web.png` shows the same default Bot welcome view; `settings.png` shows the new section in Bot Settings. Supplemental group fixtures are synthetic and contain no sent messages. The baseline model/session projections were still loading at capture; these are not layout evidence.
- `after-macos.png`: actual rc.2 Desktop `dsh-app:` content, Chinese, dark, 1280 × 820 at 2×. CDP captures web content, not macOS traffic-light pixels. Native keyboard, fullscreen, exit hit-testing and window movement were separately exercised in the actual app.
- The baseline Desktop recapture could not complete: swapping the built baseline into the task profile caused a native boot failure/target closure. No comparable native before image is claimed. Review the current native content and repeat entering/exiting Bot mode in rc.2; Web before/after is the comparable pair.
- `group-members.png`: new internal Messages split, resized to approximately 40%, retained after refresh. This surface has no equivalent baseline panel arrangement; the prior standalone panel is represented by the baseline rail's Members switch.

Runtime checks: native sidebar allocation and restoration; rail left/middle/right; switch drag ordering; panel drag node identity; continuous 0/16/12px spacing; Messages close/reopen and refresh; Web proportional resize; narrow fallback; all panels closed with a 56px rail; companion drag retaining the message node; group-member split persistence; native custom shortcut after reload/reset; native fullscreen clearance and window drag. Light-theme Web was also inspected.

The complete platform matrix, Windows/Linux Desktop, embedded Browser/Computer state during movement, and final Human QA remain separate. Deployment is outside this PR.

## Empty-state refinement

`empty-before.png` is the real Web Client at parent `d27982b7df9e4ee40fad4247a5bccf199bac5fa4`, before this feedback. The refreshed `after-web.png` shows the same default welcome and empty Sessions/Inbox after the change: 40px panel glyph above a description, centered in the body. Channels has 2px outer insets on all sides. `empty-group.png` uses the synthetic, zero-message “Panel empty-state QA” group to show Messages and Work empty states. No model calls or real messages were sent. Native `after-macos.png` closes Inbox so the capture excludes private runtime events; the full-height Sessions empty state is visible. This refresh was also inspected in light Web and at 1100 × 700.

## Expanded Channel search alignment

`search-before.png` captures parent `1aacd52fbb1e2639ce42badb086f1f344277136f`; `search-after.png` captures this refinement in the same real Web Client (1440 × 900, English, dark, default Bot welcome). The former search extends 2px past its clipping ancestor and ends 6px short of the Channel row; the latter matches both row edges. A 1000 × 800 Web check also matches both edges. Actual macOS fullscreen matches both edges; windowed top-left headers retain the existing traffic-light clearance (27px in the tested layout) while aligning the right edge. No native before/after pair is claimed for this CSS refinement.

## Direct profile details

`profile-before.png` captures parent `b75f3963aa0c24a9b52509fd3df28f451acac44c`; `profile-after.png` captures the direct detail view in the same isolated Web Client, 1440 × 900, English, dark, default Bot. The full workspace journey verifies header navigation, absence of preview/pin controls, and opening a DM profile after Messages was closed and the page refreshed. Actual macOS rc.2 Chinese native menus also verified both header navigation and Channel context-menu navigation with Messages closed; the rail becomes active and the correct full profile appears. No messages were sent.
