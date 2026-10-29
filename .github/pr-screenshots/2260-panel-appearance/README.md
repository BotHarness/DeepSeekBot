# T3 functional Panel appearance evidence

Baseline: T2 `a376b9f4d` (same product code as `1bcc93aa0`). After: the T3 commit containing this directory. Web viewport: 1440 × 1000, English; isolated Profiles use the same named Panel Alpha/Beta test Bots, with no real conversation content. Native: official macOS Desktop 0.2.1-rc.2 in a task-owned application directory.

## Verified

- Final focused source regressions: 66 tests in six files. Lint, format, root/mobile typecheck and build passed.
- Real Header context menu opens the named, opaque modal. UI Header opacity and targeted CLI six-field values share canonical local storage. Messages and Home paint distinct active Dock groups with full text/control opacity.
- Per-field Follow global, global changes and preset selection preserve unrelated overrides. Light/dark modes remain independent. Switching Alpha/Beta Channels, closing/reopening Messages and Web reload preserve functional identity and configuration.
- Reset this panel clears only Messages in the current light mode; Home and dark mode remain equal to their saved snapshots. Right-clicking inside the modal does not reopen the Header menu.
- Final-build Web journey passed with zero page errors. Native material setup passed; final-build native application restart restored the exact saved document, and the UI reset scope passed. Native DSH body theme attribute/style remain unchanged.

## Limits and Human QA

Human QA remains pending, including Header drag behavior, all content context-menu variants and visual preference. Existing layout regression tests pass; no new layout geometry is introduced. Nested appearance controls are T4. Windows, native forced quota failure and plugin unload were not run. Refused writes, stale/duplicate targets and revision conflicts are source-tested. Full local suite was not repeated; CI is a separate PR gate. No merge/deployment is authorized.

The first automation attempts selected a closed Messages surface incorrectly and encountered hidden/duplicate controls and first-run overlays. Failures were retained locally. The accepted script explicitly opens Messages from its Control Rail and scopes Channel row activation to the visible workspace. Observation/Host health did not count as feature evidence.

## Reproduce

Build, launch and doctor an isolated Host. Run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-panel-appearance.mjs`. It creates idempotent test Bots through the real CLI and requires no model reply. Native steps are in the Panel appearance feature map. Human QA: right-click Messages and Home, edit all six fields, restore individual fields, switch themes/modes/content, close/reopen, restart, then reset one target and check its sibling and dark mode.
