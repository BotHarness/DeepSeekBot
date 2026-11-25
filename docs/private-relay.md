# Docker private relay

Run the Tobs relay on a server you control. One deployment supports up to 16 computers with independent claims and admission. No official Tobs account or Cloudflare account is required. See [Choose a private connection](private-connect.md) for the other options.

**You need a public HTTPS endpoint reachable by both your phone and computer.** Use an existing public server, or a home/NAS endpoint with correctly configured public connectivity. A domain alone or Docker running only behind home NAT does not provide remote access. This setup does not purchase infrastructure, open router ports, configure DNS, or guarantee connectivity across every carrier.

## Prepare the server

Install Docker with the Compose plugin. Copy the complete `deploy/private-relay` directory from a [Tobs release](https://github.com/BotHarness/DeepSeekBot/releases) that includes `tobs-relay` to a directory you control. Record the release tag. Multi-Host claims require Tobs 1.7.0 or later on the computer.

Use a public DNS name pointing at the VPS, or the server's bare public IPv4 or IPv6 address. Open **inbound TCP 80 and 443 in your cloud firewall or security group** and in the server firewall. The relay uses Let's Encrypt HTTP-01 on port 80 by default and serves HTTPS on port 443. It automatically renews both DNS and short-lived IP certificates. Use the bare address for setup and bracket an IPv6 address in an HTTPS URL.

### Docker Compose

In Bash on the VPS, replace the directory and address with yours. Run setup once on a fresh deployment.

```bash
cd /opt/botharness-private
docker build -t tobs-relay:local .
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/config" \
  tobs-relay:local setup --config-dir /config relay.example.com
docker compose --project-name botharness-private --project-directory /opt/botharness-private \
  --file /opt/botharness-private/compose.yaml up --build --detach --remove-orphans
```

Setup writes `.env` and `bootstrap.secret` with mode 0600 and prints the key file location and the HTTPS origin. Keep the files private. Compose loads its bootstrap key from `.env` into the container environment, which server administrators can inspect. The relay runs as an unprivileged user and saves only hashes in its claim records.

If `tailscale serve` already listens on its interface at 443, set `RELAY_BIND_ADDRESS` in `.env` to the VPS ingress interface address, for example `RELAY_BIND_ADDRESS=10.0.0.4` when the cloud provider maps the public IP to that interface. The published ports then bind to that address. Use brackets for an IPv6 bind address.

### Docker without Compose

Build the same image, then initialize a named volume and start one relay container. Fetch the setup key privately from the container's `/data/bootstrap.secret` for claim.

```bash
docker build -t tobs-relay:local .
docker run --rm -v botharness-private-data:/data tobs-relay:local setup relay.example.com
docker run -d --name botharness-private --restart unless-stopped --read-only --cap-drop ALL --security-opt no-new-privileges:true --sysctl net.ipv4.ip_unprivileged_port_start=0 -p 80:80 -p 443:443 -v botharness-private-data:/data tobs-relay:local
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
2. Enter the HTTPS origin and privately copy the initial setup key from the server's `bootstrap.secret` file. Do not send it to another person or put it into command arguments.
3. Choose **Claim and connect**. Wait for **Connected**. A successful local setup, container start or health response alone is not proof that your phone can reach it.
4. Choose **Show phone pairing code**. On the native phone, scan it and verify the full Host fingerprint against the trusted desktop. On the desktop, compare and approve the exact phone key.
5. Send a Bot message from the phone and check the actual reply. For external-access acceptance use mobile data, not only home Wi-Fi.

The first successful claim wins. A repeated or competing claim is refused. Relay admission is not Host authorization: the pinned Host key and per-Host device approval remain mandatory. The QR includes sensitive relay admission material; treat it like a pairing invitation. Revoking a phone denies Host access and closes its active encrypted channels, even though the relay admission token shared by the phones of that computer is not rotated.

## More computers on one relay

One deployment serves up to 16 computers. Each computer gets its own one-time claim key, its own owner credential and its own phone admission, so a phone paired with one computer cannot reach another through the relay, and releasing or revoking one computer never affects the others.

On the server, create a key for each extra computer:

```bash
cd /opt/botharness-private
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/config" \
  tobs-relay:local add-host --config-dir /config office-mac
```

This writes `host-office-mac.secret` (the key, private to the server) and appends only its hash to `hosts/keys`, which the relay reads on every claim, so no restart is needed. On that computer, claim with the same steps as above but paste the contents of `host-office-mac.secret` instead of `bootstrap.secret`. The first computer keeps using `bootstrap.secret`.

For standalone Docker, run `docker run --rm -v botharness-private-data:/data tobs-relay:local add-host office-mac`. For the binary, run `./tobs-relay add-host office-mac` in the setup directory.

To upgrade a Node and Caddy deployment, keep `.env`, `hosts/keys`, the setup key files, and the `relay-data` volume. Replace the deployment files in the same directory and run only the Compose `up --build --detach --remove-orphans` command above with the same project name. This releases Caddy's ports and starts the Go relay with the existing claims and pairings. Preserve the old Caddy volumes if you may roll back. For an older setup with no `hosts` directory, create it with `mkdir -p hosts` before starting Compose. The wire protocol is documented in [the relay standard](private-relay-standard.md), with a conformance script for third-party relays.

## Failures and recovery

- **Cannot reach the service:** check public DNS, inbound ports, HTTPS certificate and Docker status. Do not disable certificate validation. The app does not silently use the official relay.
- **Already claimed:** continue from the original desktop/Profile. Do not delete the relay data volume to make the error disappear.
- **Connection interrupted during claim:** the desktop saves private owner credentials before claiming. Restart reconnects only if the relay accepted that claim. If the claim never reached the relay, the Host keeps retrying its control connection with `private-relay-unreachable`; an authenticated `GET /status` with that owner credential returns `404`. Repeating the in-app claim can report `private-relay-already-configured`. Preserve the Profile and relay state for diagnosis; do not repeat the claim, delete credentials or reset volumes to force recovery. No repeat-claim recovery procedure is currently defined.
- **Server restart:** retain the relay data directory or volume and the desktop credential store. The same owner and phone pairing should reconnect. Removing a volume is destructive recovery, not an upgrade step.
- **Phone lost:** use the Host's existing paired-device revoke control. If all trusted Host credentials are lost, rebuild and re-pair; a server account cannot recover the original Host identity.

Stop only this deployment with the same absolute Compose path and project name, using `down` **without** `--volumes`. Do not touch unrelated stacks. This candidate has no cloud offline queue, no remote wake, no new media promise, and no guaranteed free hosting allowance. Mainland ordinary-network qualification remains an explicit release gate.

CLI operators can use [the private connection commands](bot-cli.md#docker-private-connectivity). Native acceptance evidence is tracked in [#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746); this guide does not claim that acceptance has passed.

## Copy to your agent

Copy this whole block. Provide public deployment inputs and authorized server access separately; keep bootstrap keys out of chat.

```text
Deploy a Tobs Docker private relay on my own server and connect my existing Host. Read https://tobs.app/en/docs/private-relay/ and https://tobs.app/en/docs/private-relay-standard/. If unavailable, read https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay.md and https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay-standard.md. Ask for the public DNS name or IP address, authorized server access, deployment directory and target Host if missing.

1. Inspect the Host version/Profile/private mode and server DNS/inbound connectivity, Docker Compose and existing projects and port ownership. A home-only container/domain does not create internet reachability. Preserve other stacks and Host data/pairings. Docker relay is exclusive: ask before changing an existing private mode.
2. Agree on concrete resources. Do not purchase infrastructure, activate paid services, replace unrelated DNS or stop another service on 80/443. Use the source release/tag matching the supported installed Host, record its immutable revision and copy the complete deploy/private-relay directory. Let me complete provider login/privileged confirmation when needed.
3. Only for a new deployment, run tobs-relay setup with the agreed DNS name or IP address, then Compose with an explicit project name and directory. Keep .env, bootstrap.secret, extra Host keys and owner tokens private. Secrets enter through protected local input/files/stdin, never chat, process arguments or logs. Preserve existing setup files/volumes; do not reset or repeat initialization to force a claim.
4. Verify public trusted HTTPS and /health. Claim from the actual local Host using its UI or private-connect --hostname <https-origin> --token-stdin --confirm with the key from a private file. Never automatically replay an unknown-outcome claim; inspect the same Profile/status. Do not fall back to official Connect.
5. Let me scan locally, compare the Host fingerprint and approve the exact phone key. Keep the QR out of chat. Verify a real Bot reply on mobile data/outside Wi-Fi, then an authorized restart retaining persistent volumes and phone reconnect. Additional computers each need a separate add-host key and independent approval; never reuse bootstrap.secret.
6. Report service health, Host connection, actual phone reply and pending checks separately. Provide diagnostics without secrets and upgrade/rollback instructions retaining relay data, any legacy Caddy volumes and the Host Profile. Shutdown uses the same project's down without --volumes. Revoke a test phone only when authorized; retiring the relay is not phone revocation.
```
