# Choose a private connection

Private connection lets your phone reach this computer from mobile data or outside Wi-Fi without an official Tobs account. Choose a built-in tunnel, an HTTPS ingress or your own relay below. The built-in tunnel uses bundled `cloudflared`; the other methods use your selected proxy or relay. They publish **only the encrypted phone channel**; Host administration stays private. Phones still pair by QR, compare the Host fingerprint, and need you to approve the exact phone key on the desktop.

## Choose a deployment

| What you already have                       | Guide with manual steps and an agent prompt                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A Cloudflare account and a domain on it     | [Cloudflare Named Tunnel](private-named-tunnel.md): fixed address; Tobs runs cloudflared |
| An HTTPS proxy, tunnel or company gateway   | [Your own HTTPS ingress](private-ingress.md): nginx/Caddy, frp/ngrok or internal HTTPS   |
| A public server for your relay              | [Docker private relay](private-relay.md): your server, up to 16 computers                |
| Tobs Host already on Linux with a public IP | [Public direct connection](#public-direct-connection): automatic HTTPS on TCP 443        |
| Nothing yet; a temporary trial is enough    | Quick Tunnel below: no account, changing address                                         |

Named/Quick use Cloudflare's network; a self-hosted relay uses your server. HTTPS ingress depends on your chosen provider and a working path from the proxy to the Host. A proxy alone does not traverse home NAT. None of these private modes requires official Tobs Connect.

Each deployment guide has a complete copyable prompt. Copying does not run it. Start with the [installation guide](https://tobs.app/en/docs/installation/) if Tobs is not installed.

Private connection options shipped in 1.7.0. The shared Connections dialog and independent Quick/custom controls described below were added later; inspect the installed version and available controls before configuring them. Keep the current Host Profile and device grants.

## Advanced methods in Connections

The same Connections dialog opens from the Control Rail, Bot settings and optional first-run phone step. Confirm that the mobile App is installed before preparing a route. Quick Tunnel and Tobs Connect remain the short setup choices; **Advanced methods** directly exposes LAN, Tailscale, a fixed Cloudflare Tunnel, your own HTTPS ingress and Docker relay. Deployment-guide buttons open the existing [ingress standard](private-ingress.md) and this Docker guide, whose [relay standard](private-relay-standard.md) remains the protocol authority.

Back navigation keeps prepared Host routes running. Quick Tunnel can coexist with one custom connection: a Named Cloudflare Tunnel or your existing private HTTPS ingress. Each row has its own status, Stop and Resume controls. Stop retains settings; Host restart restores only enabled connections. Add never replaces an occupied configuration. Replacing the custom connection requires an explicit replacement action; Quick Tunnel stays unchanged. Remove forgets that connection's configuration after confirmation, but does not revoke paired phones. Revoke a phone separately to deny it on every route.

Updated phones save both explicitly admitted private addresses under one Host identity. Older phones use the invitation's primary address. A Quick Tunnel restart can change its address: rescan to replace the saved addresses without adding a second Host. A stopped or failed route does not prevent the other verified route from pairing. Private connections do not learn official-service fallback addresses.

Docker relay remains a separate, exclusive private deployment mode. Its owner credentials and volumes must be retained during migration; there is no generic UI reset. Before upgrading an existing Host, take a protected complete Profile/credentials backup: the two-route credentials format is not readable by older packages, and rollback requires restoring the matching backup. See [migration and rollback](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/decisions/connections.md#adr-0333) and the [CLI route commands](bot-cli.md#independently-managed-private-routes).

Tailscale needs the phone and computer in the same permitted tailnet. iOS and Android normally run only one VPN at a time, so enabling Tailscale can interrupt another VPN; see [Tailscale's platform guidance](https://tailscale.com/docs/reference/faq/other-vpns). LAN needs a reachable local network. HTTPS ingress needs DNS, a certificate trusted by both endpoints, WebSocket forwarding and a successful Host check before a QR is offered. Failure guidance names DNS, TLS or forwarding actions; it never disables certificate validation or silently switches to the official service.

## Turn it on

Open **Mobile app → Start pairing → Quick Tunnel (no sign-in)** to create a temporary address. Bot Settings → Connections opens the same dialog. Opening it does not start a tunnel: review the temporary-address notice and choose **Create a free temporary address**. Other deployment methods expand separately:

- **Temporary address (Quick Tunnel).** Free, no Cloudflare account. The Host checks that a request through the public address reaches it before it offers a pairing code. The address changes whenever the tunnel restarts (Host restart, network loss, turning it off and on). The connection stays turned on across restarts, but phones paired to the old address then need to scan a new pairing code; the settings page says so. A scan updates the address of the same authenticated Host without duplicating it or repeating approval when its existing device authorization is still valid. Revoked devices need authorization again. Cloudflare documents Quick Tunnels as testing-only with no uptime guarantee.
- **Fixed address (your Cloudflare Tunnel).** Create a Tunnel in your own Cloudflare account, copy its connector token and add a public hostname on a domain in that account. After you save the hostname and token, point that hostname's service at the `http://127.0.0.1:<port>` address the page shows. The address survives restarts. A free account without a payment method could create a Tunnel in our test (2026-11-09); a fixed hostname still needs a domain on that account. Verified end to end on 2026-11-09 with a free-plan domain: pairing, a real reply, and after `cloudflared` restarted the same address kept working without a new pairing code.
- **Your own proxy or tunnel.** For nginx, Caddy, frp, ngrok or a company gateway that already serves HTTPS. See [Bring your own proxy or tunnel](private-ingress.md).

Wait for **The public address reaches this computer**, choose **Show phone pairing code**, scan it on the phone, compare fingerprints and approve the exact phone. **Stop** stops that route and retains its settings and connector token. **Remove** forgets the selected route and its connector token; it does not revoke the phone. Older releases expose a disable action that removes the private configuration, so enabling it again requires a new pairing code.

The Host never falls back to the official relay. When the public check fails, the page shows the coded reason (for example `dns` while a new Quick address propagates) and keeps retrying.

CLI: `tobs private-tunnel-enable --quick --confirm`, `tobs private-tunnel-enable --hostname <name> --token-stdin --confirm` (pipe the connector token) and `tobs private-tunnel-disable --confirm`. `tobs devices` shows `privateTunnel` status.

## Public direct connection

On a Linux Host with a public IP, open **Connections**. Under **Advanced methods**, choose **Public direct connection**, then select **Enable public direct connection**. Use a Host whose TCP 443 is free and reachable from the internet. The route uses TLS-ALPN-01 on 443, so TCP 80 can stay closed. The Host discovers one public IP and obtains a short-lived trusted certificate. A container or NAT-backed Host can discover its outbound public IPv4 through AWS Check IP. Its public address still needs to forward TCP 443 to the Host.

- On a VPS, allow inbound TCP 443 in the cloud security group and the OS firewall. If the Host runs unprivileged, grant `CAP_NET_BIND_SERVICE` to the installed `tobs-relay` binary, for example with `sudo setcap cap_net_bind_service=+ep /absolute/path/to/tobs-relay`, or configure the capability in the Host service. Reapply file capabilities if an upgrade replaces the binary. The Host reports when another listener owns the port.
- For a Docker-deployed Host, publish `443:443/tcp`. Run the container with an unprivileged port floor of 443 or lower, or give the child bind permission through the container's capability configuration. Persist the Host Profile to preserve device grants and ACME state. Keep the Host administration port private.
- To use a DNS name instead, point its public DNS records at the VPS and run `tobs private-direct-enable --hostname <name> --confirm`. Use DNS-only records so ACME reaches TCP 443 on the edge.

When the check passes, choose **Show phone pairing code**, compare the Host fingerprint and approve the exact phone. **Stop** pauses this route, **Resume** checks it again, and **Remove** forgets its settings. Enabled routes resume after a Host restart. If the IP changes, scan a fresh code. Revoke the phone separately to remove its access over every route.

For a direct-only check, leave other routes stopped or create the offer with `tobs device-offer --route-id direct --out /absolute/private/path`. With Wi-Fi off, verify a Bot reply on Android and iOS, restart the same Host Profile, verify another reply without a rescan, then revoke the test phone and check that reconnect is refused. From an external machine, also check `https://<public-address>/api/botharness/devices` returns 404.

## Advanced: Docker private relay

The server deployment, independent multi-Host claims, verification, recovery and agent prompt are in [Docker private relay](private-relay.md). The [relay standard](private-relay-standard.md) describes compatible implementations.

## Verify the selected route

After Tobs confirms public readiness, pair locally, compare the Host fingerprint and approve the exact phone key. For a public endpoint, use mobile data/outside Wi-Fi. For an internal-only HTTPS origin, keep the phone on its intended company network and verify internal DNS, system-trusted TLS and reachability from that phone; do not require public internet access. Send a uniquely identifiable Bot message and check the real reply. Verify reconnect and, when authorized, revocation. Keep QR codes and tokens out of agent chat and screenshots. A health response or running process alone does not prove phone access.

[PR #3780](https://github.com/BotHarness/DeepSeekBot/pull/3780) records iOS Simulator pairing, real replies and revocation for Quick/Named, nginx/Caddy routing and multi-Host relay. frp/ngrok remain reference configurations. Physical cellular, mainland carrier, Android and media-feature qualification is separate.
