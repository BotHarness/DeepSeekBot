# S2 settings recovery — first formal implementation

Implementation source: `12bd9a597497af96a85101b441c10d168296d3a5`; stacked base: `06b4ef1262103b305fc9f03fc2c46e9aa35dd38f` (S1 #2273 with latest-main appearance). Same macOS arm64 DSH 0.2.1-rc.2 Profile/window, 1261×820 CSS viewport / 2522×1640 native pixels, Chinese locale and light classic-blue theme. No upstream/ASAR edits or PR merge.

## Observed change

Before source `74e491db496b4329eba5402af71d161f5cfb0b0c`: at +8 (430%), the wide Settings sidebar remained, and scaled native overlay padding left a 235px-high card. The complete native Before shows the Interface section clipped. After: the card is 1213×684 at (24,68), the section picker replaces wide navigation, rows use their available container width, uploads stay bounded, and the body scrolls. Before/After use the same viewport, theme, locale and Interface entry, without scrolling; the computer-use badge/pointer is visible in both.

## Runtime checks

- All 17 levels: Settings card and Close stay inside the viewport, navigation matches local body width, the Interface body has no horizontal overflow and has a positive scroll area. Manual font tokens remain 14/11/13px. Structured measurements are in `settings-matrix.json`. This is native Client DOM geometry, not a 17-level visual acceptance claim.
- At 430%, native UI clicks opened the picker and switched sections. Native Down/Return selected Interface; native Escape closed only the menu and returned focus to the section picker while Settings remained open. The viewport menu stays in its owning Modal so the native keyboard owner admits it.
- At 430%, native content scrolling made Reset fully visible (309.58×120.39 viewport pixels, same visible dimensions); a native click restored the saved default 0. At 23%, a native Reset click also restored 0. Fresh exact-target CLI readbacks confirmed both. The extra Reset screenshot shows the scrolled recovery state, not a matched unscrolled comparison.
- Unit/DOM checks cover local-width breakpoint changes, retained unsaved input/focus, disposal, menu ownership and menu state after widening. 35 tests in 6 focused files passed; the actual Client bundle execution test added 7 passing checks. Lint, formatting, typecheck, change-ledger checks and the Client build passed. CI is separate.

## Remaining issue scope

This is not full S2 acceptance: other anchored dropdowns/portals, real IME and shortcut recording/custom bindings, wider real embedded-page and compatibility lifecycle matrices remain open. Basic hidden-created/resized webview recovery has separate pre-main positive evidence under S1; this run does not repeat it. Windows/Linux remain disabled and unqualified in S3. Human acceptance of earlier panel/header/webview scenes is not automatically acceptance of this new settings scene.
