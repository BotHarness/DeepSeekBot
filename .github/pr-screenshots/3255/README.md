# S5 LAN Bot admission evidence

Captured 2026-11-01 with the repository verifier against isolated DSH Profiles.

- Before source: `106db9c633b694239215f19beb494361a8fbd9c3` (S4).
- After and DM source: `22cf7315e039b1213ef62aa1ac0e84db3d811020` (S5).
- Settings pairs: 1440 × 900, English, corresponding light/dark themes. Bot settings → Connections → Manage, mouse wheel to bottom of the content pane. Both snapshots use the same interaction; the added section changes scroll extent.
- `after.png` / `after-dark.png`: retained LAN approval with local access disabled and peer unreachable. This is not evidence that the peer is online.
- `dm.png`: recipient's existing read-only Bot DM containing the original marked PING and real model ACK. Sender is offline at capture. Both canonical timelines retained exactly those two messages; membership provenance is LAN.
- All five captures were visually inspected; each captured journey reported zero console issues. Original ARIA trees, console logs and canonical CLI records remain in private task evidence.
- No screenshot was synthesized or altered. Profiles contain only task test data. Images expose no credentials, connection addresses or login URLs.

## Verification limits

Two isolated Hosts on one Windows machine exercised real UDP, HTTP, Noise, CLI, Client and model/Inbox behavior. They do not prove multicast discovery across two physical LAN devices. The Human declined Mac/SSH testing. Earlier Windows/Linux Tailnet and Connect results do not substitute for this missing LAN qualification.

Full suite: 1246 passed / 58 failed / 19 skipped files; 11104 passed / 130 failed / 61 skipped tests. No baseline attribution has been established for the remaining failures. The three failing network files passed a focused single-worker recheck: 7 tests, 164.56 seconds, without changing source or timeouts.

Screenshots explain the actual state; they do not establish full-suite success, physical LAN acceptance, Human approval, merge readiness or release.
