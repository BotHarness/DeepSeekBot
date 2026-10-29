# Return to Harness — #2289

Captured on 2026-10-19 in an isolated DSH 0.2.1-rc.2 Web Host on Windows, at 1440 × 900. No production Profile or receiver was used.

The before pair uses the original UI source from `33334b22cb7d9e79f667b171d089c71df2dc572a`, with the Windows-only vfile import normalization needed to boot it. The candidate UI is the implementation in `c4b3967e34fe3d8d51d08664f97f871212cd1344`; the subsequent inventory commit changes no UI. Light/English and dark/Chinese pairs share viewport, Home state, Tob fixture and resting pointer position. The new bottom icon is always visible beneath settings; the top Bot-logo exit remains.

## Verification

- Existing Client bundle contract: 2 baseline failures from Node-only imports on Windows; all 7 pass after path normalization.
- Existing last-view, workspace-shell, sidebar and panel-entry regressions: 19 pass. Typecheck, repository format check and lint pass.
- `scripts/e2e-bot-mode-exit.mjs`: English/light and Chinese/dark pass. Real pointer and Enter/Space exit, native Harness navigation, ordinary mode retained on refresh, explicit Bot-mode re-entry/restoration, same PersonaBot facts, moved-rail panel geometry (within 2px native rounding), short window, narrow/wide transitions and original top-logo exit. Both final runs checked a real unsent Home draft.
- Tooltip and keyboard focus: localized label, visible focus and tooltip geometry pass in both themes/languages. The published focus screenshot is actual keyboard focus.
- Full local suite was invoked once; it reports unrelated Host test failures/timeouts on Windows, including reproducible EPERM during telemetry fixture cleanup. Final totals and CI status are recorded in the PR.

The launcher used task-only instrumentation to omit the machine's unrelated OpenCode Go selection. All normal isolated Profile, authentication, pinned CLI and API checks remained active; no model call was needed. Browser results do not qualify native Desktop. The installed Desktop is 0.1.7-rc.2 and was not used to claim 0.2.1-rc.2 acceptance. Narrow fallback behavior was checked, but its interface was not redesigned.

Retained private evidence includes failed baseline boot attempts, the specific missing-bottom-button red runs, screenshots, accessibility snapshots, console logs and Client diagnostics. These are test evidence, not canonical product state.
