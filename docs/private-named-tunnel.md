# Cloudflare Named Tunnel

Use a fixed hostname under your own Cloudflare account. Tobs runs bundled cloudflared on your computer and opens an outbound tunnel to Cloudflare. Your phone reaches that HTTPS hostname and the tunnel forwards the encrypted device channel to the Host. Your home computer needs no public inbound port. This uses Cloudflare infrastructure, independently of official Tobs Connect.

Other choices: [private connections](private-connect.md), [HTTPS ingress](private-ingress.md), [Docker relay](private-relay.md).

## Prepare

- Install Tobs and the phone App using the [installation guide](https://tobs.app/en/docs/installation/). Keep your existing Host Profile.
- Have a Cloudflare account, a domain on that account, an unused hostname such as `bot.example.com`, and permission to create its Tunnel/DNS route.
- The computer must reach Cloudflare outbound. Domain registration/provider charges are separate; do not assume every account or network is free or supported.

Use the current [Cloudflare dashboard guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/). Do not execute its connector install command: Tobs runs its own connector.

## Configure the fixed address

1. In Cloudflare One, open **Networks → Connectors → Cloudflare Tunnels** (dashboard labels can change). Create a Cloudflared Tunnel. Keep its connector token private.
2. Open **Bot settings → Connections → Add connection → Connect your phone to this computer → App installed, start connecting → Advanced methods → Fixed Cloudflare Tunnel**. Older versions show **Private connection → Fixed address**.
3. Enter only the hostname, for example `bot.example.com`, and enter the connector token in the protected field. Save and note Tobs's gateway-only port. The public check may fail until the next step.
4. In that Tunnel's **Published application routes** (formerly Public Hostname), route the hostname to HTTP service `http://127.0.0.1:PORT`, replacing `PORT` with Tobs's exact port. The connector runs on the Host, so loopback refers to the Host. Never forward the DSH web/admin port.
5. Wait for Tobs's public check to pass, show the phone pairing code, and complete [route verification](private-connect.md#verify-the-selected-route).

An interactive Cloudflare Access login challenge can block the phone's WebSocket; use only a path explicitly compatible with the phone. The hostname or provider account alone never grants Host control.

## CLI alternative

New installations provide `tobs`; existing `deepseekbot` users may keep their command.

Use the existing local Host and its usual connection/token-file arguments. Read the connector token from a private file readable only by you:

```bash
tobs private-tunnel-enable --hostname bot.example.com --token-stdin --confirm < /absolute/private/connector-token.txt
tobs devices
```

Inspect existing routes first. Do not overwrite an occupied custom slot. Newer Hosts also expose [independent route commands](bot-cli.md#independently-managed-private-routes).

## Copy to your agent

Copy the whole block; replace the public hostname or let the agent ask for it.

```text
Configure my existing Tobs Host with my own Cloudflare Named Tunnel. Read https://tobs.app/en/docs/private-named-tunnel/ first; if unavailable, use https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-named-tunnel.md. My intended hostname: bot.example.com (replace with mine).

1. Inspect the installed Tobs version, actual running Host/Profile, CLI help, existing private routes and my Cloudflare account/domain access. Preserve data, pairings, DNS and other tunnels. If you cannot operate the computer/account, give exact manual steps and mark them pending.
2. Agree on an unused hostname and the concrete resources/network publication. Do not buy a domain or activate paid services. Let me complete provider login. Handle connector tokens only through protected local input or private files/stdin, never chat, command arguments or logs.
3. Create the agreed Tunnel, configure Tobs Fixed address and forward its hostname only to the gateway-only loopback port Tobs reports. Use bundled cloudflared; do not start a second connector or publish Host administration. If a private route already occupies the custom slot, ask what to keep rather than replacing it automatically.
4. Check DNS, trusted HTTPS, WebSocket forwarding and Tobs public readiness. Fix the reported cause without skipping certificate validation or falling back to official Connect. Do not offer a pairing code until ready.
5. Let me scan locally, compare the Host fingerprint and approve the exact phone key. Keep pairing material out of chat. Verify a real Bot reply on mobile data/outside Wi-Fi and, when authorized, a connector restart on the same hostname. A health check/process alone is not completion.
6. Report changed resources, actual results and pending phone/network steps. Provide recovery and removal instructions limited to this Tunnel/DNS route. Preserve the Profile and unrelated resources; phone revocation is separate from tunnel removal.
```

## Recovery and removal

An enabled Named Tunnel restores with the Host and keeps its hostname. A sleeping/stopped computer is unavailable. For `dns`, check the hostname/DNS route; for an origin failure, check the exact HTTP loopback port; for a connector refusal, check the private token/account. Keep TLS validation enabled.

On versions with Stop/Resume, Stop retains configuration. Remove forgets that route; revoke a lost phone separately. When retiring the deployment, confirm no other service depends on the Tunnel, then remove only its Tunnel and matching DNS route. Preserve other connectors and DNS records.

## Qualification

[PR #3780](https://github.com/BotHarness/DeepSeekBot/pull/3780) records iOS Simulator pairing, real replies, same-address connector recovery and revocation through a Named Tunnel on a free-plan domain. Physical phones, mainland carriers and media features remain separately qualified.
