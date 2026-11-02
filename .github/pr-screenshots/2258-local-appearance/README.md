# T1 local appearance evidence

Issue: [#2258](https://github.com/BotHarness/DeepSeekBot/issues/2258). Spec: [#2256](https://github.com/BotHarness/DeepSeekBot/issues/2256). Captured 2026-10-19 on macOS with pinned DSH 0.2.1-rc.2.

## Captures

- `before.png`: base `da1112c34ac21c6238a62d2a29f843f2d2eb7eeb`, English, 1440 × 1000, Bot settings → Appearance. The prior entry point writes the native theme.
- `after-dark.png` / `after-light.png`: same viewport, locale and seeded empty workspace; separate per-mode palettes/Primary and scoped dark Classic Blue/light Mist Purple. These show the candidate source included in this commit.
- `native-restored.png`: official macOS Desktop, Chinese, task-owned app data. The saved local appearance survives app restart into a second isolated Host Profile using the same application directory.
- `web-results.json` / `native-proof.json`: sanitized accepted local configuration, computed mode and native-body state; no credentials or login URLs.

The Web journey exercised actual theme/palette controls, owned modal/menu styles, refresh persistence, one explicit CLI target, a separate browser context, revision conflict/stale-target refusals, exit/re-entry, system changes and reapplying a preset after a custom Primary. Page errors were empty. The same Desktop preference was reread after Web changes without being overwritten.

The native journey used the visible settings controls and the actual CLI executable, then restarted the official task-owned app. A second isolated Host Profile with the same application directory restored the same document. This is a **different-Host restart**, not a test of the interactive Host-switch UI. Task-owned Desktop was closed after verification.

## Source and runtime checks

- Focused appearance owner, scope lifecycle, CLI and delivery tests passed (23 tests). Additional existing Client regressions passed (52 tests).
- Final lint, root/mobile typecheck, formatting and package build passed.
- Real isolated Web journey and doctor passed. Native UI/CLI and restart restoration passed. No model call was required.
- Full-suite attempts and any follow-up results are reported in the exact-head PR verification comment; a focused pass is not a full-suite pass.
- Storage refusal, unknown fields, lease expiry and Plugin-scope disposal were source-tested. Native forced storage failure and runtime Plugin unload were not exercised.
- Windows, interactive Host-switch UI and Human QA remain unverified. Generic upstream tooltip/toast primitives retain their native rendering; this slice explicitly scopes owned roots, modals, menus and marked custom floating surfaces.

## Reproduce / Human QA

Use the [feature guide](../../../.agents/skills/verify-deepseekbot/features/local-appearance.md) with a task-owned instance and run `scripts/e2e-local-appearance.mjs`. It saves each attempt separately, including failures. Earlier automation selector/entrypoint failures remain in local task evidence and were corrected before the passing run.

In Bot settings → Appearance, choose Light + Mist Purple and Dark + Classic Blue, edit each Primary, and switch modes. Exit/reenter Bot mode and restart. Compare DSH's native theme and its settings. Reapply the selected palette to clear that mode's custom Primary. Judge colors, readability and interaction before accepting T1.

**Human QA is pending. No merge, release, or completion of the parent feature is claimed.**
