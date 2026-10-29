# Native Windows desktop zoom evidence

Captured 2026-10-25 on Windows with official DSH Desktop 0.2.1-rc.3.
All images are the same 1463 × 937 native window, Chinese, light appearance,
using one isolated QA Profile. No daily user Profile or phone was changed.
The visible content is the seeded Tob and empty QA conversations, with no private messages.

- `base.png`: unmodified main `2fb44727e14ba31d3eec93a09623cb2d6fd65ae8`, separately built and packed as internal `1.5.2-rc.2775-base`; General has no window zoom controls. Runtime compatibility marker is null and root zoom is empty.
- `100.png`: this PR's runtime/package changes, locally packed as internal `1.5.2-rc.2775`; General exposes current/default zoom without running the setup enable command.
- `120.png`: one real native click on Increase changes both the visible control and root zoom from 1 to 1.2.

Both `deepseekbot` and `@botharness/tobs` Bundle selections were cold-started from the same exact candidate package set; each exposed the Windows compatibility lease. Switching to Tobs retained the saved 120% current zoom. Installing the base package removed the controls on cold restart, then the candidate was restored.

These packages are local test artifacts, not npm releases. `artifacts.json` records their integrity values. Automated coverage: 169 related tests; native Loader coverage includes one active theme, later Profile preferences, disposal and upstream selection on cold removal. Build, lint and root TypeScript checks passed.

Not qualified in this run: macOS, legacy manual-link upgrade, iframe/webview focus matrix, extreme levels, native font-value preservation, hot Bundle replacement. CUA-injected Ctrl+=/Ctrl++ did not demonstrate a level change and is not recorded as passing keyboard acceptance. The change activates the existing zoom implementation; it does not change key bindings. See #2775 and #2269/#2270 for remaining native coverage.
