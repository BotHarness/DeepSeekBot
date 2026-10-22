---
Status: Accepted direction; implementation and runtime qualification in progress
Date: 2026-10-23
Issues: [#2607](https://github.com/BotHarness/DeepSeekBot/issues/2607)
---

# SSH tunnels preserve paired Host authority

The Human selected a computer CLI establishing an SSH tunnel, with the browser on that computer operating an already running Linux Host. Bot-to-server SSH/MCP operations, native phone SSH, remote bootstrap and remote desktop video are separate capabilities.

The application-defined CLI connection owner launches system OpenSSH in the foreground and owns only that child process. It uses an explicit alias, local port and remote loopback port; normal SSH configuration and key/agent authentication remain with OpenSSH. Batch mode and strict host-key checking refuse unattended prompts and unknown or changed keys. The Human establishes SSH trust through their normal terminal first. The CLI never imports a private key into Host settings, starts a remote Host or stops an externally owned process. Ctrl+C, termination and failed startup close only its tunnel.

SSH provides reachability. Existing Device Pairing remains the authority for Host identity, exact device-key approval and revocation. The CLI takes a protected pairing file from the intended Host, verifies its pinned Host key through the existing Noise channel before reporting readiness, and writes a new protected link with only the forwarded loopback route. It does not redeem the offer or approve a device. The existing browser Add remote flow performs enrollment and keeps the device credential in its existing origin-local store. A trusted local Host serves the browser client; the SSH command does not serve executable browser code.

The original pairing offer, Host ID, Host key and expiry are retained. The tunnel link uses version 2 so older clients reject it rather than ignoring the required encrypted-loopback contract. The saved encryption record carries `loopback: encrypted`; its HTTP requests and logical streams continue through the pinned Noise channel even after reconnect. No credential or private content may fall back to raw loopback HTTP when that contract exists. Existing unmarked loopback and Tailscale pairings retain their prior route contracts. Persisted SSH records put their address in `encryptedLoopbackRoutes` and leave legacy `routes` empty. New readers validate and restore it with the encryption contract; old readers see no address and cannot send a device credential in plaintext. Upgrade the local Host client before enrollment. Older clients cannot operate SSH pairings; downgrade/re-upgrade route retention is not promised.

The SSH destination is the existing Host listener. The browser-facing loopback carrier exposes only the existing Noise WebSocket path; ordinary HTTP, other upgrade paths, Authorization and WebSocket subprotocol headers are refused. It rebuilds that upgrade from an allowlist, discarding ambient browser cookies because cookies ignore port boundaries and would otherwise carry the local Host login to the remote Host. It does not decrypt frames or hold device credentials. The remote Gateway keeps its existing cookie refusal and all Device Pairing checks. No second DSH API interceptor or remote credential store is created. The existing Noise protocol/prologue is carried unchanged through SSH to the same endpoint; SSH is not advertised as a LAN or Connect route. The local forwarding socket listens only on `127.0.0.1`. A local process can probe that port, but still needs Host/device authority; reaching forwarded loopback never implies Owner access.

The CLI emits one sanitized readiness JSON document and bounded lifecycle JSON on stderr. SSH diagnostics are classified into codes; raw stderr, keys, passwords and pairing links are not echoed. The output file uses exclusive creation. An expired pairing file may still identify the same Host when reopening a tunnel for an already paired browser, but never extends or revives the original offer.

The first slice uses a stable explicitly chosen local port. Reopening the command at that port preserves the saved logical Host and device; disconnect never revokes or deletes them. Automatic reconnect supervision, remote install/start, password/MFA UI, shared SSH inventories and importing HexHub assets are deferred.

## Qualification

Source and focused tests do not establish real SSH or browser operation. Qualification requires a task-owned Linux SSH server and isolated Host, the computer CLI, a real browser pairing and harmless Host operation, then disconnect/reconnect, changed Host key and exact device revocation. Record tested platforms explicitly. No existing production server, SSH key, known-hosts file or Tailscale service is a test fixture without its own authorization.
