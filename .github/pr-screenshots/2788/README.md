# Desktop appearance preference evidence (#2788)

Captured 2026-10-26 with Playwright Chromium against an isolated `web-dev` Profile on the pinned DSH 0.2.1-rc.3 Host (`scripts/dev-instance.mjs`), Bundles `dsh-base`, `dsh-web-app` and the local `deepseekbot` build. No daily Profile was used.

- `before-dark-reverts.png`: main `571a4ca2`. Clicking Settings → General → Appearance → Dark flashes dark, then returns to System. The `settings/mutate` reply is `settings/rejected: Configuration for "ui-theme" is overridden by a home patch or command-line overlay`.
- `after-light.png`, `after-dark.png`: this branch. Light and Dark are both accepted (`ok: true`), the Profile Patch records `ui-theme.preference`, and Dark survives a page reload and a Host restart (the boot style is served as `color-scheme:dark`).

Native Desktop was not run in this environment; the failing write path is the same Host Settings service used by Desktop.
