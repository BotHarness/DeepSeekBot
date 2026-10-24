# Phone connection recovery evidence

- Source baseline: 6e87297f849531346fc8ec4e4640d1993f134028. The candidate patch was subsequently rebased onto 34d0e216d without conflicts; no connection/settings behavior changed in that rebase.
- Runtime: task-owned isolated DSH 0.2.1-rc.2, the supported compatibility floor. RC3 validation is recorded separately in the PR, not inferred from these captures.
- Browser viewport: 1280 × 900, English, light and dark. `b-` is the exact main UI module; `a-` is this PR's recovery UI. `scripts/e2e-phone-recovery.mjs` performs the same journey for each pair.
- `status`: browser-scoped status HTTP 503 after a real successful read. Before retains stale preparation as current; After shows unknown status/Retry and disables actions based on old state.
- `offer`: browser-scoped offer HTTP 503. Before leaves Loading with the error; After exposes Retry. The crop retains only the error and action, excluding the temporary Host fingerprint.
- `routes`: a real task-owned LAN offer is visible before browser-scoped route removal. Before still offers the old copy link; After hides the QR/link and offers New code, disabled until a route is available. The crop excludes the QR, fingerprint and private addresses.
- The journey temporarily enables only its task-owned Host's LAN listener, restores its initial LAN setting, verifies no new paired devices and records zero page errors. It never changes Tailscale Serve, accounts or physical-phone networking.
- These are real-shell browser fault-injection captures. They do not qualify Android/iOS VPN switches, cellular handover, native larger text or Human acceptance; those remain in the shared-device QA lane.
