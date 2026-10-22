# SSH T1 runtime evidence

Date: 2026-10-23 (Asia/Tokyo). Issue: #2607.

The tested path was Windows Node 24.14.0 and OpenSSH 9.5p2, a real Chromium browser served by a separate isolated local Host, and a task-owned Linux container running Node 24.21.0, OpenSSH and DSH 0.2.1-rc.2. Both Hosts used this PR's candidate source. The Linux runtime build omitted declaration generation after its initial bounded-memory build was killed; the complete Windows build and root/mobile typechecks passed. This is a real cross-OS SSH test on one development machine, not a WAN, production-server or physical-device test.

## Observed results

- The foreground CLI authenticated the intended Host's Noise key through real OpenSSH before reporting ready. Readiness stdout contained one JSON document without the pairing link or credentials.
- A separate direct `device-pair` required exact public-key approval; `device-probe` then read the real Host Feed and reported `encrypted: true`.
- Browser Add remote displayed the expected Host fingerprint. The complete pending browser fingerprint matched the remote Owner's `devices` output before approval. The offer became redeemed for exactly one browser device.
- The browser rendered the remote test Bot. A unique browser message was found in the remote owner's canonical `channel-messages` response. The Linux fixture had no model credential: its subsequent model failure is visible in `paired.png` and is not counted as a model-reply pass. An earlier attempt against a paused Bot was correctly refused and is not counted as a successful write.
- Ctrl+C released the browser carrier and its SSH child; the browser showed offline. An independently paired CLI device continued reading the remote Host through a different tunnel, proving that stopping the browser tunnel did not stop the remote Host.
- Reopening the same browser port restored the saved pairing, with two total devices (one CLI and one browser), no pending enrollment and no duplicate browser device. Reload also retained the remote roster.
- Revoking the exact browser device closed two streams. The browser displayed that it had been removed. Reopening the SSH tunnel and reloading did not restore access (`revoked.png`).
- After the compatibility hardening, a fresh real browser pairing stored zero legacy routes and one encrypted-only loopback route. Reload retained the same device identity and displayed the canonical remote message, with zero browser page errors. The 97 focused shared-client, Web persistence and CLI-device tests also passed.
- Real refusal cases passed: occupied local port (`ssh-local-port-unavailable`), unknown SSH host key (`ssh-host-key-refused`), wrong pinned application Host key (`ssh-host-unready`), unreachable remote Host port (`ssh-host-unready`) and missing SSH executable (`ssh-missing`).

## Boundary discovered during verification

The first browser attempt failed because a browser sends loopback login cookies across ports, and the existing encrypted Gateway rejects cookies. The local carrier now exposes only the exact Noise upgrade path, rebuilds its headers from an allowlist, and discards ambient cookies. Ordinary HTTP, other upgrade paths, query variants, Authorization and WebSocket subprotocols are refused. It never decrypts frames. The remote Gateway's rejection and device authority remain unchanged. Regression coverage verifies cookie removal, the path/header refusals, Host-key authentication and no plaintext credential fallback after a local port is replaced.

## Images

- `before.png` / `after.png`: English light theme, 1440 × 900, same empty Add remote dialog. The updated guidance includes the SSH CLI and removes the Tailscale-only failure assumption. Both captures reported zero browser console issues.
- `paired.png` / `revoked.png`: English dark theme, 1440 × 1000, the task's real remote roster before and after exact device revocation. These are lifecycle evidence, not a theme comparison.
- Images were inspected unchanged; they contain synthetic task content and no pairing link, login URL, private key or device credential.

## Qualification limits

340 related automated tests passed, with two pre-existing skips across 33 files; the focused carrier boundary suite also passed after the final assertions. Lint, formatting, root/mobile typechecks and the complete Windows build passed. Full-repository tests, CI, Human QA and independent security review are separate gates. Linux/macOS initiating CLI, packaged Desktop, WAN loss/latency, password/MFA flows, native mobile SSH, remote desktop viewers, automatic bootstrap and external production services were not qualified here. Older browser clients reject version 2 links; persisted SSH routes are withheld from old readers to prevent plaintext fallback. Downgrade/re-upgrade route retention is not qualified.
