# Bring your own proxy or tunnel

If you already run a reverse proxy or tunnel, Tobs can use it instead of the built-in Cloudflare options. Any proxy that meets the **ingress standard** below is accepted, the same way any S3-compatible service works with S3 clients.

Choose another method: [private connections](private-connect.md), [Named Tunnel](private-named-tunnel.md), [Docker relay](private-relay.md).

## Prepare the network path

Have a running Tobs Host and phone App, an unused HTTPS hostname, a trusted certificate, and access to the proxy configuration. Install Tobs first using the [installation guide](https://tobs.app/en/docs/installation/). A public proxy needs DNS and inbound reachability; it must also reach the Host's dedicated gateway. A VPS running nginx cannot directly forward to a home computer's `127.0.0.1`. Place the proxy on that computer, use an authorized LAN/private network path, or provide an outbound tunnel such as frp. Keep existing services, certificates and Host configuration.

## The ingress standard

Your proxy must:

1. Serve an HTTPS origin your phone can reach, such as `https://bot.example.com` or an internal `https://bot.corp.internal` whose certificate the phone already trusts. Self-signed certificates the phone does not trust are refused; Tobs never skips certificate checks.
2. Forward `GET /botharness-device/channel` to the port Tobs shows, unchanged, **including the WebSocket upgrade** (`Upgrade` and `Connection` headers) and the `X-BotHarness-Admission` header.
3. Forward `GET /.well-known/botharness-tunnel/<nonce>` the same way. Tobs uses it to check the address before it offers a pairing code.
4. Keep idle WebSocket connections open for at least 60 seconds (Tobs sends heartbeats).

Everything else may stay blocked; Tobs answers 404 to any other path on that port. A sign-in layer in front of the proxy (Cloudflare Access, OAuth2 Proxy) is fine if it lets the phone's WebSocket upgrade through; phone control still requires comparing fingerprints and approving the exact phone on the computer.

## Turn it on

Bot settings → Connections → Add connection → Connect your phone to this computer → App installed, start connecting → Advanced methods → **Your own proxy or tunnel**. Enter the HTTPS address and choose **Save and check**. The page shows the local port to forward to. By default that port listens on `127.0.0.1`, so the proxy must run on the same computer; turn on **Accept forwarding from other LAN machines** when the proxy runs elsewhere on your LAN.

CLI: `tobs private-ingress-enable --origin https://bot.example.com --confirm` (add `--lan` for a proxy on another machine), `tobs devices` for status (`privateTunnel.originPort` is the port to forward to), and `tobs private-ingress-disable --confirm`.

The port stays the same across restarts. If you move to a different address, enable the new one and scan a fresh pairing code on each phone; the phone moves to the new address only after this computer's pinned key admits it.

## Reference configs

Replace `PORT` with the port Tobs shows and `bot.example.com` with your address. Both examples assume the proxy runs on the Host. For a proxy on another LAN machine, enable the authorized LAN bind and replace **every** `127.0.0.1:PORT` upstream in both channel and readiness routes with the Host's reachable LAN address and port (for example `192.168.1.20:PORT`); loopback on the proxy is not the Host. The nginx and Caddy checks ran the routing rules below behind a Cloudflare Quick Tunnel that terminated HTTPS; certificate setup on your own server is up to you.

**nginx** (verified 2026-11-09: pairing, a real reply and revocation through this config)

```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
server {
  listen 443 ssl;
  server_name bot.example.com;
  # ssl_certificate / ssl_certificate_key for bot.example.com
  location /botharness-device/channel {
    proxy_pass http://127.0.0.1:PORT;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 300s;
  }
  location /.well-known/botharness-tunnel/ {
    proxy_pass http://127.0.0.1:PORT;
    proxy_set_header Host $host;
  }
  location / { return 404; }
}
```

**Caddy** (verified 2026-11-09: pairing, a real reply and revocation through this config)

```caddyfile
bot.example.com {
  handle /botharness-device/channel {
    reverse_proxy 127.0.0.1:PORT
  }
  handle /.well-known/botharness-tunnel/* {
    reverse_proxy 127.0.0.1:PORT
  }
  respond 404
}
```

**frp** (reference, not yet verified): the Host-side `frpc` initiates an outbound connection to your public `frps`. An `http` proxy with `customDomains = ["bot.example.com"]` and `localPort = PORT` can sit behind an HTTPS reverse proxy on the server. Forward the two paths above, including the WebSocket upgrade and admission header, and preserve the public `Host` header so frps can match `customDomains` (nginx: `proxy_set_header Host $host;`; Caddy preserves Host by default). Merely setting `vhostHTTPSPort` does not add certificate termination to an HTTP proxy; frp's HTTPS/https2http mode is a different configuration. Follow the [official HTTPS example](https://gofrp.org/en/docs/examples/https2http/). frp is a generic tunnel, not an implementation of Tobs's [private relay protocol](private-relay-standard.md).

**ngrok** (reference, not yet verified): `ngrok http PORT --url https://<your-ngrok-domain>`; enter that `https://` address in Tobs.

**Your own Cloudflare Named Tunnel**: prefer the built-in [Fixed address guide](private-named-tunnel.md), which runs cloudflared for you. To manage cloudflared yourself, point the public hostname's service at `http://127.0.0.1:PORT`.

## Copy to your agent

Copy this whole block and provide only public deployment inputs. The proxy may be on another machine; name that machine's role explicitly.

```text
Set up my existing Tobs Host through my own HTTPS proxy/tunnel. Read https://tobs.app/en/docs/private-ingress/; if unavailable, use https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-ingress.md. Ask for my public/internal HTTPS origin, proxy type/location and authorized access if missing.

1. Inspect the actual running Host/Profile/version, CLI help, existing routes, DNS/certificates, proxy and port ownership. Establish how the proxy reaches this Host. A reverse proxy alone cannot cross home NAT, and a remote server's loopback is not this computer. If the path is missing, present the needed tunnel/network option before changing anything.
2. Agree on concrete changes. Preserve existing services, DNS, TLS, routes and pairings. Do not buy infrastructure, overwrite a custom connection, enable LAN listening or alter shared firewall rules without the corresponding authorization. Let me complete provider login; credentials stay in protected local input/files, never chat, command arguments or logs.
3. Register my HTTPS origin in Tobs's own-proxy flow, obtain its stable gateway-only port and configure forwarding. Preserve GET /botharness-device/channel with WebSocket Upgrade/Connection and X-BotHarness-Admission, plus GET /.well-known/botharness-tunnel/<nonce>. Keep idle WebSockets for at least 60 seconds; block unrelated paths. Publish no Host web/admin port. LAN bind is needed only for an authorized proxy on another LAN machine.
4. Validate the proxy config before reload. Check DNS, OS-trusted TLS and Tobs's readiness probe over the chosen origin. A browser login challenge must not block the phone channel. Do not skip certificate checks, silently use official Connect or claim untested frp/ngrok references are qualified deployments.
5. Let me scan locally, compare Host fingerprints and approve the exact phone key; keep pairing material out of chat. Verify a real Bot reply over the intended outside network (or the intended intranet), reconnect, and revocation of an authorized test phone. Report any unavailable phone/model checks as pending.
6. Report resources changed, actual checks and the remaining steps. Provide restart and rollback limited to this configuration; preserve the Host Profile, other proxy routes, certificates and device grants.
```

## Verify and maintain

Complete [route verification](private-connect.md#verify-the-selected-route) through the chosen HTTPS origin, not a localhost shortcut. For an internal-only origin, test from the phone on the intended internal network with internal DNS and trusted certificates; external Wi-Fi/cellular is not a requirement. Bot model connectivity is a separate dependency. Record the configured upstream port so proxy reloads/restarts keep using it. Retain the previous proxy configuration for rollback. On versions with per-route controls, Stop preserves configuration; removing an ingress does not revoke the phone. Remove only its proxy rules/DNS after checking ownership; do not stop shared nginx/Caddy services to retire one route.

## Company network without internet

Use your own proxy with an internal name such as `https://bot.corp.internal`. Nothing in this mode needs the internet or official services: the phone, the proxy and this computer only talk on your network (the Bot's model provider is separate).

- **Internal DNS.** The name must resolve to the proxy for both the phone and this computer, for example through your company DNS or mDNS (`computer-name.local`).
- **Certificate trust.** Issue the proxy certificate from your company CA and install that CA as trusted on the phones and on this computer through device management (MDM). Tobs only accepts certificates the operating system already trusts. It never imports a CA itself and never skips certificate checks.
- **What you see if trust is missing.** This computer's check reports `tls` when the computer does not trust the certificate. The phone refuses pairing with "This phone does not trust the certificate…" and code `socket-tls`.
- **When to use same-Wi-Fi instead.** If the phones join the same Wi-Fi as this computer, the encrypted local network mode (Settings → Connections → Manage → local access) needs no certificate, DNS or proxy and is the simplest choice.

Verified 2026-11-09 on an iOS 27 Simulator with a test company CA: refusal without the CA, then pairing, a real reply and revocation over an mDNS `.local` name with the CA installed. Android is not yet verified.

## When something fails

The settings page and `tobs devices` show a coded reason: `dns` (the name does not resolve), `tls` (the certificate is not trusted), `http-404` or `http-502` (the proxy did not forward the check path), `timeout`. Tobs keeps rechecking and never falls back to the official relay.
