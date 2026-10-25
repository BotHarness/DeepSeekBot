# Connect secret safety evidence

Captured 2026-10-22 for #2541; all names and credential values are synthetic.

- Before: `5210bf2a9` (includes the exact #2533 dependency `0f4b87633105`). The baseline copies of the three pictured components were checked byte-for-byte against that revision.
- After: Track A plus main `30f62e48c7d9`, integrated at `c2c21f80c`, with the routine Edit accessible label restored.
- Settings and routine pairs: Expo Web, 390 × 844 CSS pixels, scale 3, English, light/dark; real isolated DSH 0.2.1-rc.2 and Device Gateway. These are not native-device screenshots.
- Private-input pairs: cropped real Web Client remote card, 1280 × 800 browser viewport, English, light/dark. A synthetic Connect hostname maps to the actual local Connect origin; no real Cloudflare deployment or Tailscale connection is exercised. The pending card has one password field before, zero after; submit is disabled after.
- Routine capture waits for the empty history to settle. Daily edit, pause/resume, manual run/history, confirmed deletion, weekly creation and preview match were driven against the owning Host; no page errors were recorded.

## Verification

17 focused files / 173 tests passed after main integration: gateway, route provenance, refusal policy, HostClient preflight, remote cards/read state, Browser viewer registration and changed phone screens. Root/mobile type checks, lint, format and build passed.

A rebuilt native DSH Host refused all eight marked endpoints over unary and mux at the Connect origin, allowed roster reads/streams and loopback credential set/unset, and returned 404 for the removed full-client path. CLI `ask-secret-submit --values-stdin` accepted a synthetic value and the canonical card status became configured. The model-created card used `deepseek-official/deepseek-flash` (catalog: DeepSeek-V4.1-Flash); this is not a claim of a completed DM reply while the Bot awaited input.

The earlier broad local suite did not finish and is not green: source-policy timeout, docs public-surface build failure and a daylight assertion were observed. The daylight assertion also fails on the baseline. Focused tests do not replace the full CI plan.

## Pending acceptance

Native iOS/Android, old full-client deep links, chat/create/Activity entrances and native Browser/Computer regression captures remain pending. The shared Mac device queue is paused by the Human for combined acceptance. The runnable review path is Settings, chat overflow/private input, Activity private-input request, create menu, daily and advanced routines, followed by an old `/full-client` link. Use both themes. Actual Cloudflare/Tailscale, Human QA and the complete proposed ADR-0244 approval remain separate gates. No encryption, merge or release is claimed.
