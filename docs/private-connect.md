# Docker private connection

Docker private deployment is the recommended remote connection for this candidate. It does not require an official account or Cloudflare account. This first slice connects one desktop Host to its phones. Multi-Host enrollment and upgrades have separate v2.0 acceptance gates.

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

1. On your trusted desktop, open **Settings → Connections → Add connection → Connect a device to this Host → Docker private connection (recommended)**.
2. Enter the HTTPS origin and privately copy the initial setup key from the server's `bootstrap.secret` file. Do not send it to another person or put it into command arguments.
3. Choose **Claim and connect**. Wait for **Connected**. A successful local setup, container start or health response alone is not proof that your phone can reach it.
4. Choose **Show phone pairing code**. On the native phone, scan it and verify the full Host fingerprint against the trusted desktop. On the desktop, compare and approve the exact phone key.
5. Send a Bot message from the phone and check the actual reply. For external-access acceptance use mobile data, not only home Wi-Fi.

The first successful claim wins. A repeated or competing claim is refused. Relay admission is not Host authorization: the pinned Host key and per-Host device approval remain mandatory. The QR includes sensitive relay admission material; treat it like a pairing invitation. Revoking a phone denies Host access and closes its active encrypted channels, even though this first slice does not rotate the shared relay admission token for all other phones.

## Failures and recovery

- **Cannot reach the service:** check public DNS, inbound ports, HTTPS certificate and Docker status. Do not disable certificate validation. The app does not silently use the official relay.
- **Already claimed:** continue from the original desktop/Profile. Do not delete the relay data volume to make the error disappear.
- **Connection interrupted during claim:** the desktop saves private owner credentials before claiming. Keep its Profile and restart the same Host; it reconnects without replaying the claim. An unknown result is not reported as success.
- **Server restart:** retain the `relay-data` and Caddy volumes and the desktop credential store. The same owner and phone pairing should reconnect. Removing a volume is destructive recovery, not an upgrade step.
- **Phone lost:** use the Host's existing paired-device revoke control. If all trusted Host credentials are lost, rebuild and re-pair; a server account cannot recover the original Host identity.

Stop only this deployment with the same absolute Compose path and project name, using `down` **without** `--volumes`. Do not touch unrelated stacks. This candidate has no cloud offline queue, no remote wake, no new media promise, and no guaranteed free hosting allowance. Mainland ordinary-network qualification remains an explicit release gate.

CLI operators can use [the private connection commands](bot-cli.md#docker-private-connectivity). Native acceptance evidence is tracked in [#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746); this guide does not claim that acceptance has passed.
