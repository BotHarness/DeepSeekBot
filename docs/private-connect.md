# Private connection

Private connection lets your phone reach this computer from mobile data or outside Wi-Fi without an official account, Docker or a VPN app. The desktop Host runs its bundled `cloudflared` and publishes **only the encrypted phone channel**; settings, files and APIs stay private. Phones still pair by QR, compare the Host fingerprint, and need you to approve the exact phone key on the desktop.

## Turn it on

Open **Mobile app → Start pairing → Quick Tunnel (no sign-in)** to create a temporary address. Bot Settings → Connections opens the same dialog. Opening it does not start a tunnel: review the temporary-address notice and choose **Create a free temporary address**. Other deployment methods expand separately:

- **Temporary address (Quick Tunnel).** Free, no Cloudflare account. The Host checks that a request through the public address reaches it before it offers a pairing code. The address changes whenever the tunnel restarts (Host restart, network loss, turning it off and on). The connection stays turned on across restarts, but phones paired to the old address then need to scan a new pairing code; the settings page says so. A scan updates the address of the same authenticated Host without duplicating it or repeating approval when its existing device authorization is still valid. Revoked devices need authorization again. Cloudflare documents Quick Tunnels as testing-only with no uptime guarantee.
- **Fixed address (your Cloudflare Tunnel).** Create a Tunnel in your own Cloudflare account, copy its connector token and add a public hostname on a domain in that account. After you save the hostname and token, point that hostname's service at the `http://127.0.0.1:<port>` address the page shows. The address survives restarts. A free account without a payment method could create a Tunnel in our test (2026-11-09); a fixed hostname still needs a domain on that account. Verified end to end on 2026-11-09 with a free-plan domain: pairing, a real reply, and after `cloudflared` restarted the same address kept working without a new pairing code.
- **Your own proxy or tunnel.** For nginx, Caddy, frp, ngrok or a company gateway that already serves HTTPS. See [Bring your own proxy or tunnel](private-ingress.md).

Wait for **The public address reaches this computer**, choose **Show phone pairing code**, scan it on the phone, compare fingerprints and approve the exact phone. Turning the connection off stops `cloudflared`, forgets the connector token and the phone admission token; paired phones then need a new code.

The Host never falls back to the official relay. When the public check fails, the page shows the coded reason (for example `dns` while a new Quick address propagates) and keeps retrying.

CLI: `deepseekbot private-tunnel-enable --quick --confirm`, `deepseekbot private-tunnel-enable --hostname <name> --token-stdin --confirm` (pipe the connector token) and `deepseekbot private-tunnel-disable --confirm`. `deepseekbot devices` shows `privateTunnel` status.

# Advanced: Docker private relay

Use this only if you already run a public server. It does not require an official account or Cloudflare account. This first slice connects one desktop Host to its phones. Multi-Host enrollment and upgrades have separate v2.0 acceptance gates.

**You need a public HTTPS endpoint reachable by both your phone and computer.** Use an existing public server, or a home/NAS endpoint with correctly configured public connectivity. A domain alone or Docker running only behind home NAT does not provide remote access. This setup does not purchase infrastructure, open router ports, configure DNS, or guarantee connectivity across every carrier.

## Prepare the server

Install Docker Compose and Node 24 on the server. Copy the candidate's `deploy/private-relay` directory to an absolute directory you control. Point an existing DNS name to that server and make inbound TCP 80/443 reachable. Other applications must not already own these ports. Caddy obtains and renews the HTTPS certificate; certificate issuance and carrier reachability can fail independently.

For example, if you placed the files at `/opt/botharness-private`, run these commands in **Bash on that server**, substituting your actual full directory and domain:

```bash
node /opt/botharness-private/setup.mjs relay.example.com
docker compose --project-name botharness-private --project-directory /opt/botharness-private --file /opt/botharness-private/compose.yaml up --build --detach
```

Setup creates private `.env` and `bootstrap.secret` files without printing the key. Keep both out of git, screenshots and shared logs. Compose passes the key to its container environment, which machine administrators can inspect; this does not protect secrets from administrators of that server. The relay runs as an unprivileged user, persists only hashed admission credentials, and carries encrypted application frames rather than chat history.

## Claim and pair

1. On your trusted desktop, open **Settings → Connections → Add connection → Connect a device to this Host → Private connection (recommended) → Your own relay server (Docker, advanced)**.
2. Enter the HTTPS origin and privately copy the initial setup key from the server's `bootstrap.secret` file. Do not send it to another person or put it into command arguments.
3. Choose **Claim and connect**. Wait for **Connected**. A successful local setup, container start or health response alone is not proof that your phone can reach it.
4. Choose **Show phone pairing code**. On the native phone, scan it and verify the full Host fingerprint against the trusted desktop. On the desktop, compare and approve the exact phone key.
5. Send a Bot message from the phone and check the actual reply. For external-access acceptance use mobile data, not only home Wi-Fi.

The first successful claim wins. A repeated or competing claim is refused. Relay admission is not Host authorization: the pinned Host key and per-Host device approval remain mandatory. The QR includes sensitive relay admission material; treat it like a pairing invitation. Revoking a phone denies Host access and closes its active encrypted channels, even though the relay admission token shared by the phones of that computer is not rotated.

## More computers on one relay

One deployment serves up to 16 computers. Each computer gets its own one-time claim key, its own owner credential and its own phone admission, so a phone paired with one computer cannot reach another through the relay, and releasing or revoking one computer never affects the others.

On the server, create a key for each extra computer:

```bash
node /opt/botharness-private/setup.mjs add-host office-mac
```

This writes `host-office-mac.secret` (the key, private to the server) and appends only its hash to `hosts/keys`, which the relay reads on every claim, so no restart is needed. On that computer, claim with the same steps as above but paste the contents of `host-office-mac.secret` instead of `bootstrap.secret`. The first computer keeps using `bootstrap.secret`.

Upgrading a single-computer deployment: pull the new `deploy/private-relay` files, then `docker compose up -d --build` with the same project directory. The existing claim, phones and volumes keep working unchanged; add more computers with `add-host` afterwards. The wire protocol is documented in [the relay standard](private-relay-standard.md), with a conformance script for third-party relays.

## Failures and recovery

- **Cannot reach the service:** check public DNS, inbound ports, HTTPS certificate and Docker status. Do not disable certificate validation. The app does not silently use the official relay.
- **Already claimed:** continue from the original desktop/Profile. Do not delete the relay data volume to make the error disappear.
- **Connection interrupted during claim:** the desktop saves private owner credentials before claiming. Keep its Profile and restart the same Host; it reconnects without replaying the claim. An unknown result is not reported as success.
- **Server restart:** retain the `relay-data` and Caddy volumes and the desktop credential store. The same owner and phone pairing should reconnect. Removing a volume is destructive recovery, not an upgrade step.
- **Phone lost:** use the Host's existing paired-device revoke control. If all trusted Host credentials are lost, rebuild and re-pair; a server account cannot recover the original Host identity.

Stop only this deployment with the same absolute Compose path and project name, using `down` **without** `--volumes`. Do not touch unrelated stacks. This candidate has no cloud offline queue, no remote wake, no new media promise, and no guaranteed free hosting allowance. Mainland ordinary-network qualification remains an explicit release gate.

CLI operators can use [the private connection commands](bot-cli.md#docker-private-connectivity). Native acceptance evidence is tracked in [#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746); this guide does not claim that acceptance has passed.
