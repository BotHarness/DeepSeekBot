# Computer CLI SSH and browser Remote Host

## Sub-features

- `tunnel`: `deepseekbot ssh-tunnel` owns one foreground system OpenSSH forward to an existing Linux Host.
- `identity`: Noise authenticates the Host pin before readiness; SSH host-key trust and Device Pairing approval remain distinct.
- `pair`: a version 2 protected link uses the existing browser Add remote flow and exact device-key approval.
- `operations`: the paired browser and direct device CLI read the same remote Host through encrypted loopback; no raw credential/resource fallback.
- `lifecycle`: Ctrl+C closes only the owned tunnel; reopening the same local port restores the existing browser pairing. Revocation remains authoritative after reopening.

## How to get to it (user POV)

On the remote Host create a protected `device-offer --out` file using the authenticated Owner CLI. Transfer it to the computer through the established SSH connection. On that computer run `ssh-tunnel <alias> --remote-port <existing-host-port> --local-port <free-fixed-port> --pairing-file <private-input> --out <new-private-output>`. Keep it running. In the local Host browser open Messages → Add remote, paste the output file's link and compare the Host fingerprint. On the remote Host approve the pending exact device key using its offer receipt. Open a remote conversation. Use Ctrl+C to close the tunnel, and the same port to reconnect.

## Driving it with verify-app

Use a dedicated task-owned Linux SSH server and an isolated Profile launched with `scripts/dev-instance.mjs`. Its authorized key and known-hosts record must be task-created; never modify existing user keys or production servers. Launch a second local browser Host with `node scripts/verify-app.mjs launch --name <task-local>`, run `doctor`, and preserve its console/ARIA/screenshots.

Drive Add remote and fingerprint confirmation by accessible name. Read the remote pending key through `devices`, approve it with `device-approve-key`, and compare the rendered remote roster/conversation to the remote Host's canonical state. Exercise one harmless existing operation, such as marking a seeded conversation read, and verify that the local Host remains unchanged. Pair a separate CLI device through `device-pair --link-file ... --out ... --confirm` and use `device-probe` to prove the same encrypted Host Feed independently of the UI.

Stop the tunnel only, verify the remote Host remains healthy, then reopen at the same port and verify the browser reconnects without enrollment or duplicate Host rows. Revoke the browser's exact device on the remote Host and prove it fails both before and after reopening the tunnel. Test occupied local port, wrong Host pin, unknown SSH host key, missing SSH executable and unreachable remote port. Capture sanitized lifecycle diagnostics and check for unhandled browser errors. Preserve the first unexpected result and use `verify-app observe` before retrying.

## Gotchas

- A working SSH login is reachability evidence, not a completed Host/browser test.
- Version 2 links require an updated local browser client. Native mobile SSH and running the Node CLI inside a browser are unsupported.
- Keep pairing links, CLI device files and Host login URLs out of screenshot evidence and command arguments. Read them from private files within the test driver.
- An expired offer can identify an already paired Host for reopening, but cannot enroll another device.
- An SSH startup failure can leave an empty exclusive output file; use a new output path.
- A private loopback port is not device authority. The marked route remains encrypted when the port is reused by another process.
- Browser/Computer viewers unsupported by the encrypted Device Gateway remain unavailable; this slice does not claim remote desktop parity.
