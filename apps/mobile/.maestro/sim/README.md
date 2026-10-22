# Simulator flows with a live Host

These flows need values from a running Host, so `maestro test .maestro` (which only runs the top-level flows) skips them. `node scripts/e2e-mobile-sim.mjs` runs them in order against two isolated Hosts. Each flow names the `-e` variables it reads.

`pairing-return.yaml` is a separate post-approval regression flow. On the assigned existing Simulator, pair through a fresh Connect invitation, independently compare the Host fingerprint and approve the exact device key on the trusted Host, then run this flow immediately. Do not restart or reload the app between approval and the flow. It checks that Settings and Activity remain operable after dismissal, including reopening Settings; the old native form-sheet error blocked these taps. The caller owns the real tunnel, approval and redacted evidence. Repeat in both themes and supported text sizes; this flow never erases app state or starts a device.
