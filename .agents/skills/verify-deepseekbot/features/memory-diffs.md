# Memory diffs

## Sub-features

- Working changes and historical commits share the Memory diff renderer.
- Auto wrap starts on; its header button switches every file in the current view between wrapping and horizontal scrolling.
- Old/new line numbers and change markers stay compact at the left, including five-digit line numbers; whitespace and diff text survive switching modes.

## How to get to it (user POV)

Enter Bot mode, select a PersonaBot in the Channel list, open Messages if it is hidden, then choose Memory evolution in the Messages header. Select a working file for its uncommitted diff, or a Git graph row for a commit diff. Use Auto wrap in the diff header to switch modes.

## Driving it with verify-app

Build and launch a fresh isolated instance, then run:

```bash
node scripts/verify-app.mjs launch --name memory-diff-wrap
BH_E2E_INSTANCE=.humanlayer/verify/memory-diff-wrap/instance.json node scripts/e2e-memory-diff-wrap.mjs
```

The journey creates its own synthetic Bot, seeds only that Bot's Memory Repository through Git, and reads working/commit diffs through the public Host API. It drives both Client entry points, asserts gutter geometry and wrapping at 1440px and 1100px viewport widths, switches wrapping off and on, and captures light/dark screenshots, accessibility snapshots, console errors, layout measurements and canonical diff metadata. No model is needed.

## Gotchas

- The current journey uses Chinese Client labels and macOS Messages shortcut text; use the matching Client environment when rerunning it.
- The native first-run preview dialog can block the general `verify-app shot` helper's readiness check before overlay dismissal. The journey waits for the Bot mode entry, dismisses first-run overlays, and opens the Messages panel explicitly.
- Hidden sidebar copies share Channel identifiers. Select the visible Channel row.
- `BH_DIFF_BASELINE=1` captures an unchanged base Client for comparison and asserts the wrap button is absent; it does not certify the fix. The normal run is the regression verdict.
