# Simulator flows with a live Host

These flows need values from a running Host, so `maestro test .maestro` (which only runs the top-level flows) skips them. `node scripts/e2e-mobile-sim.mjs` runs them in order against two isolated Hosts. Each flow names the `-e` variables it reads.

`pairing-return.yaml` is a separate post-approval regression flow. On the assigned existing Simulator, pair through a fresh Connect invitation, independently compare the Host fingerprint and approve the exact device key on the trusted Host, then run this flow immediately. Do not restart or reload the app between approval and the flow. It checks that Settings and Activity remain operable after dismissal, including reopening Settings; the old native form-sheet error blocked these taps. The caller owns the real tunnel, approval and redacted evidence. Repeat in both themes and supported text sizes; this flow never erases app state or starts a device.

`computer-video-recovery.yaml` is a separate Chinese-locale Simulator regression. It
requires an assigned device, an existing disposable pairing and a running local Computer.
Pass `-e COMPUTER_LINK=deepseekbot-dev://computer/<bot-slug>`; the link contains no pairing
credential. Dismiss notification permission and first-use anonymous-statistics notices
before running it. Check the full-screen screenshot when an app-scoped accessibility tree
misses a native sheet. The More control may be exposed as a `popupbutton`, so locate its
label rather than hard-coding a `button` role. This flow checks the native menu, a fresh
reconnect waiting state and actual return to Chats. It does not grant control or claim
physical presentation, input, FPS, or Tailscale cross-network acceptance. Simulator video
intentionally lacks presentation receipts and reaches the unavailable state. The caller
must verify the Computer owner has no viewer/controller after exit and release its own
Host/Metro/device resources. Screenshots of the desktop can contain private data; inspect
and redact before sharing. This flow never erases an app or starts a device.
