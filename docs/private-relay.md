# Docker private relay

Run the Tobs relay on a server you control. One deployment supports up to 16 computers with independent claims and admission. No official Tobs account or Cloudflare account is required. See [Choose a private connection](private-connect.md) for the other options.

**You need a public HTTPS endpoint reachable by both your phone and computer.** Use an existing public server, or a home/NAS endpoint with correctly configured public connectivity. A domain alone or Docker running only behind home NAT does not provide remote access. This setup does not purchase infrastructure, open router ports, configure DNS, or guarantee connectivity across every carrier.

## Prepare the server

Open the [Tobs release](https://github.com/BotHarness/DeepSeekBot/releases) matching your installed Host, download its source archive and copy the complete `deploy/private-relay` directory to your server. Record its tag/commit. Do not deploy an arbitrary moving branch or initialize over an existing deployment. This runs a relay, not a Docker image of the Bot Host.

Install Docker Compose and Node 24 on the server. Copy the released `deploy/private-relay` directory to an absolute directory you control. Point an existing DNS name to that server and make inbound TCP 80/443 reachable. Other applications must not already own these ports. Caddy obtains and renews the HTTPS certificate; certificate issuance and carrier reachability can fail independently.

For example, if you placed the files at `/opt/botharness-private`, run these commands in **Bash on that server**, substituting your actual full directory and domain:

```bash
node /opt/botharness-private/setup.mjs relay.example.com
docker compose --project-name botharness-private --project-directory /opt/botharness-private --file /opt/botharness-private/compose.yaml up --build --detach
```

Setup creates private `.env` and `bootstrap.secret` files without printing the key. Keep both out of git, screenshots and shared logs. Compose passes the key to its container environment, which machine administrators can inspect; this does not protect secrets from administrators of that server. The relay runs as an unprivileged user, persists only hashed admission credentials, and carries encrypted application frames rather than chat history.

## Claim and pair

First check public DNS/TLS and request `https://relay.example.com/health` from outside the server. It should advertise `botharness-private-v1` and `botharness-private-v2`. A health response proves relay reachability, not phone access. If 80/443 belong to another service, preserve it and deliberately adapt the existing HTTPS proxy instead of starting the unmodified Compose example.

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

## Copy to your agent

Copy this whole block. Provide public deployment inputs and authorized server access separately; keep bootstrap keys out of chat.

```text
Deploy a Tobs Docker private relay on my own server and connect my existing Host. Read https://tobs.app/en/docs/private-relay/ and https://tobs.app/en/docs/private-relay-standard/. If unavailable, read https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay.md and https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay-standard.md. Ask for the public hostname, authorized server access, deployment directory and target Host if missing.

1. Inspect the Host version/Profile/private mode and server DNS/inbound connectivity, Docker Compose, Node 24, existing projects and port ownership. A home-only container/domain does not create internet reachability. Preserve other stacks and Host data/pairings. Docker relay is exclusive: ask before changing an existing private mode.
2. Agree on concrete resources. Do not purchase infrastructure, activate paid services, replace unrelated DNS or stop another service on 80/443. Use the source release/tag matching the supported installed Host, record its immutable revision and copy the complete deploy/private-relay directory. Let me complete provider login/privileged confirmation when needed.
3. Only for a new deployment, run setup.mjs with the agreed hostname, then Compose with an explicit project name and directory. Keep .env, bootstrap.secret, extra Host keys and owner tokens private. Secrets enter through protected local input/files/stdin, never chat, process arguments or logs. Preserve existing setup files/volumes; do not reset or repeat initialization to force a claim.
4. Verify public trusted HTTPS and /health. Claim from the actual local Host using its UI or private-connect --hostname <https-origin> --token-stdin --confirm with the key from a private file. Never automatically replay an unknown-outcome claim; inspect the same Profile/status. Do not fall back to official Connect.
5. Let me scan locally, compare the Host fingerprint and approve the exact phone key. Keep the QR out of chat. Verify a real Bot reply on mobile data/outside Wi-Fi, then an authorized restart retaining persistent volumes and phone reconnect. Additional computers each need a separate add-host key and independent approval; never reuse bootstrap.secret.
6. Report service health, Host connection, actual phone reply and pending checks separately. Provide diagnostics without secrets and upgrade/rollback instructions retaining relay-data/Caddy volumes and the Host Profile. Shutdown uses the same project's down without --volumes. Revoke a test phone only when authorized; retiring the relay is not phone revocation.
```
