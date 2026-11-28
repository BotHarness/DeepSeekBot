# Docker private relay

Run the Tobs relay on a server you control. One deployment supports up to 16 computers with independent claims and admission. No official Tobs account or Cloudflare account is required. See [Choose a private connection](private-connect.md) for the other options.

**You need a public HTTPS endpoint reachable by both your phone and computer.** Use an existing public server, or a home/NAS endpoint with correctly configured public connectivity. A domain alone or Docker running only behind home NAT does not provide remote access. This setup does not purchase infrastructure, open router ports, configure DNS, or guarantee connectivity across every carrier.

## Prepare the server

Install Docker with the Compose plugin. Copy the complete `deploy/private-relay` directory from a [Tobs release](https://github.com/BotHarness/DeepSeekBot/releases) that includes `tobs-relay` to a directory you control. Record the release tag. Multi-Host claims require Tobs 1.7.0 or later on the computer.

Use a public DNS name pointing at the VPS, or the server's bare public IPv4 or IPv6 address. Open **inbound TCP 80 and 443 in your cloud firewall or security group** and in the server firewall. By default the relay handles Let's Encrypt HTTP-01 on port 80, redirects other requests to HTTPS on port 443, and renews DNS and short-lived IP certificates automatically. When it registers an ACME account, it accepts the certificate authority's terms. Review the [Let's Encrypt Subscriber Agreement](https://letsencrypt.org/repository/) before starting the relay. Use the bare address for setup and bracket an IPv6 address in an HTTPS URL.

### Docker Compose

In Bash on the VPS, replace the directory and address with yours. Run setup once on a fresh deployment.

```bash
cd /opt/botharness-private
docker build -t tobs-relay:local .
docker run --rm -it --log-driver=none --user "$(id -u):$(id -g)" -v "$PWD:/config" \
  tobs-relay:local setup --config-dir /config relay.example.com
docker compose --project-name botharness-private --project-directory /opt/botharness-private \
  --file /opt/botharness-private/compose.yaml up --build --detach --remove-orphans
```

Setup prints a single-line connect code and a QR in an interactive terminal. The code includes the HTTPS origin and expires after 15 minutes or after one successful claim. Keep both private. The relay runs as an unprivileged user and stores only the credential hash and expiry. Use `setup --ttl 30m relay.example.com` if deployment takes longer.

Use a filesystem that supports hard links for the setup files and relay data. The relay uses them to ensure each claim key can be used only once.

On Linux, `tailscale serve` can already own port 443 on a Tailscale address such as `100.x.x.x` or `fd7a:…`. In that case the wildcard bind can fail. In `.env`, set `RELAY_BIND_ADDRESS` to the local address of the interface that receives public traffic. For example, if cloud NAT forwards the public IP to `10.0.0.4` on `eth0`, use `RELAY_BIND_ADDRESS=10.0.0.4`. Use brackets for an IPv6 bind address.

`RELAY_BIND_ADDRESS` selects one address. For a DNS name with an AAAA record, Let's Encrypt can validate over IPv6. If you bind only IPv4, remove the AAAA record or add separate IPv6 port mappings for the same relay and ensure they are publicly reachable.

### Docker without Compose

Build the same image, then initialize a named volume and start one relay container. Keep the connect code printed during setup for the desktop claim.

```bash
docker build -t tobs-relay:local .
docker run --rm -it --log-driver=none -v botharness-private-data:/data tobs-relay:local setup relay.example.com
docker run -d --name botharness-private --restart unless-stopped --read-only --cap-drop ALL --security-opt no-new-privileges:true -p 80:8080 -p 443:8443 -v botharness-private-data:/data tobs-relay:local
```

### Static binary

To run on a VPS with neither Docker nor Node, extract `/tobs-relay` from the image built for that VPS's architecture. Run `container=$(docker create tobs-relay:local)`, `docker cp "$container:/tobs-relay" ./tobs-relay` and `docker rm -v "$container"` on the build machine. Copy the binary to the VPS and keep its working directory private. On Linux, grant access to privileged ports with `sudo setcap cap_net_bind_service=+ep ./tobs-relay`, then run as your regular user.

```bash
./tobs-relay setup relay.example.com
./tobs-relay serve
```

This keeps claims and ACME state in `./relay-data`. If `tailscale serve` owns 443 on its interface, run `./tobs-relay serve --http-listen 10.0.0.4:80 --https-listen 10.0.0.4:443` with the VPS ingress interface address. To validate solely over port 443, pass `--acme-challenge tls-alpn-01`. If an existing HTTPS proxy owns both ports, run `./tobs-relay serve --tls=off --listen 127.0.0.1:8080` and have the proxy forward HTTP requests and WebSocket upgrades to that loopback address. Use the proxy's public HTTPS origin when pairing.

## Claim and pair

From outside the server, open `/health` at the public HTTPS origin. Expect `botharness-private-v1` and `botharness-private-v2`. Verify phone access in the pairing steps.

1. On your trusted desktop, open **Bot settings → Connections → Add connection → Connect your phone to this computer → App installed, start connecting → Advanced methods → Docker relay**.
2. Paste the entire line starting with `tobs-relay-v1:` into **Connect code**. Keep it out of chats, logs and command arguments. For an existing `bootstrap.secret` or `host-*.secret`, choose **Use a legacy setup key** and enter the HTTPS origin and key.
3. Choose **Claim and connect**. Wait for **Connected**. A successful local setup, container start or health response alone is not proof that your phone can reach it.
4. Choose **Show phone pairing code**. On the native phone, scan it and verify the full Host fingerprint against the trusted desktop. On the desktop, compare and approve the exact phone key.
5. Send a Bot message from the phone and check the actual reply. For external-access acceptance use mobile data, not only home Wi-Fi.

The first successful claim wins. A repeated or competing claim is refused. Relay admission is not Host authorization: the pinned Host key and per-Host device approval remain mandatory. The QR includes sensitive relay admission material; treat it like a pairing invitation. Revoking a phone denies Host access and closes its active encrypted channels, even though the relay admission token shared by the phones of that computer is not rotated.

## More computers on one relay

One deployment serves up to 16 computers. Each computer can hold one control socket and 32 phone channels, for up to 528 upgraded WebSockets. Each listener separately allows 128 pending TCP and HTTP connections, with up to 32 per peer IP. A successful upgrade frees the pending slot. With a reverse proxy, pending connections are counted against the proxy's peer IP.

Each computer gets its own one-time claim key, owner credential and phone admission. A phone paired with one computer can only reach that computer through the relay. Releasing a claim affects only that computer.

On the server, issue a connect code for each extra computer. Pass `--ttl` before the name to change its lifetime. If you use a different Compose project name, substitute that project’s relay data volume.

```bash
cd /opt/botharness-private
docker run --rm -it --log-driver=none --user "$(id -u):$(id -g)" \
  -v "$PWD:/config" -v botharness-private_relay-data:/data \
  tobs-relay:local add-host --config-dir /config office-mac
```

Paste the printed code on the new computer. The relay reads newly issued codes without a restart.

If a code expires, repeat the command with `--reissue` before the name. For the first computer, use `tobs-relay add-host --reissue default`. Reissuing invalidates the previous code and preserves all existing claims and pairings. If a code was already used, continue on the original computer or run `add-host` with a new name for another computer.

For standalone Docker, run `docker run --rm -it --log-driver=none -v botharness-private-data:/data tobs-relay:local add-host office-mac`. For the binary, run `./tobs-relay add-host office-mac` in the setup directory.

To upgrade a Node and Caddy deployment, keep `.env`, `hosts/keys`, the setup key files, and the `relay-data` volume. Replace the deployment files in the same directory and run only the Compose `up --build --detach --remove-orphans` command above with the same project name. This releases Caddy's ports and starts the Go relay with the existing claims and pairings. Preserve the old Caddy volumes if you may roll back. For an older setup with no `hosts` directory, create it with `mkdir -p hosts` before starting Compose. The wire protocol is documented in [the relay standard](private-relay-standard.md), with a conformance script for third-party relays.

The Node deployment files (`server.mjs`, `setup.mjs`, `Caddyfile`, and the Node entry points in `package.json`) and `scripts/test/private-relay.test.mjs` are legacy rollback material until [real-device acceptance #3746](https://github.com/BotHarness/DeepSeekBot/issues/3746) passes. For a rollback, use the deployment files from the previous release. The conformance client uses the Node dependencies and checks the Go relay over the same wire protocol.

## Failures and recovery

- **Cannot reach the service:** check public DNS, inbound ports, HTTPS certificate and Docker status. Do not disable certificate validation. The app does not silently use the official relay.
- **Already claimed:** continue from the original desktop/Profile. Do not delete the relay data volume to make the error disappear.
- **Connection interrupted during claim:** the desktop saves private owner credentials before claiming. Restart reconnects only if the relay accepted that claim. If the claim never reached the relay, the Host keeps retrying its control connection with `private-relay-unreachable`; an authenticated `GET /status` with that owner credential returns `404`. Repeating the in-app claim can report `private-relay-already-configured`. Preserve the Profile and relay state for diagnosis; do not repeat the claim, delete credentials or reset volumes to force recovery. No repeat-claim recovery procedure is currently defined.
- **Server restart:** retain the relay data directory or volume and the desktop credential store. The same owner and phone pairing should reconnect. Removing a volume is destructive recovery, not an upgrade step.
- **Phone lost:** use the Host's existing paired-device revoke control. If all trusted Host credentials are lost, rebuild and re-pair; a server account cannot recover the original Host identity.

Stop only this deployment with the same absolute Compose path and project name, using `down` **without** `--volumes`. Do not touch unrelated stacks. This candidate has no cloud offline queue, no remote wake, no new media promise, and no guaranteed free hosting allowance. Mainland ordinary-network qualification remains an explicit release gate.

CLI operators can use [the private connection commands](bot-cli.md#docker-private-connectivity). Native acceptance evidence is tracked in [#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746); this guide does not claim that acceptance has passed.

## Copy to your agent

Copy this whole block. Provide public deployment inputs and authorized server access separately; keep connect codes and legacy keys out of chat.

```text
Deploy a Tobs Docker private relay on my own server and connect my existing Host. Read https://tobs.app/en/docs/private-relay/ and https://tobs.app/en/docs/private-relay-standard/. If unavailable, read https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay.md and https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay-standard.md. Ask for the public DNS name or IP address, authorized server access, deployment directory and target Host if missing.

1. Inspect the Host version/Profile/private mode and server DNS/inbound connectivity, Docker Compose and existing projects and port ownership. A home-only container/domain does not create internet reachability. Preserve other stacks and Host data/pairings. Docker relay is exclusive: ask before changing an existing private mode.
2. Agree on concrete resources. Do not purchase infrastructure, activate paid services, replace unrelated DNS or stop another service on 80/443. Use the source release/tag matching the supported installed Host, record its immutable revision and copy the complete deploy/private-relay directory. Let me complete provider login/privileged confirmation when needed.
3. Only for a new deployment, run tobs-relay setup with the agreed DNS name or IP address, then Compose with an explicit project name and directory. Keep .env, connect codes, legacy keys and owner tokens private. Secrets enter through protected local input/files/stdin, never chat, process arguments or logs. Preserve existing setup files/volumes; do not reset or repeat initialization to force a claim.
4. Verify public trusted HTTPS and /health. Claim from the actual local Host using its UI or private-connect --code-stdin --confirm with the code from a private file. Never automatically replay an unknown-outcome claim; inspect the same Profile/status. Do not fall back to official Connect.
5. Let me scan locally, compare the Host fingerprint and approve the exact phone key. Keep the QR out of chat. Verify a real Bot reply on mobile data/outside Wi-Fi, then an authorized restart retaining persistent volumes and phone reconnect. Additional computers each need a separate add-host code and independent approval.
6. Report service health, Host connection, actual phone reply and pending checks separately. Provide diagnostics without secrets and upgrade/rollback instructions retaining relay data, any legacy Caddy volumes and the Host Profile. Shutdown uses the same project's down without --volumes. Revoke a test phone only when authorized; retiring the relay is not phone revocation.
```
