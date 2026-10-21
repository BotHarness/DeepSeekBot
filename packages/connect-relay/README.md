# @botharness/connect-relay

The DeepSeekBot Connect relay Worker ([ADR-0241](../../docs/adr/0241-hosted-connect-reaches-the-host-through-a-managed-tunnel.md)). It links signed-in WorkOS accounts to Hosts and provisions one Cloudflare Tunnel per Host whose remote ingress admits only the device gateway (`^/botharness-device(/.*)?$`); everything else answers `404` at the Cloudflare edge. Application traffic never passes through this Worker.

## API

Every route except `/v1/config` takes `Authorization: Bearer <WorkOS access token>` from TOB's WorkOS environment. Refusals are `{ error: { code } }`.

| Route                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/config`                                          | `{ clientId, deviceAuthorizationEndpoint, tokenEndpoint, zone }`, the WorkOS client a Host signs in with (CLI Auth) and the tunnel zone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GET /v1/hosts`                                           | `{ hosts: [{ id, name, hostname, createdAt, tunnel }] }` for the signed-in account; `tunnel` is false after reclamation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /v1/hosts` `{ "name": "Studio" }`                   | `201 { host }` with a new `<id>.deepseekbot.dev` hostname. `400 invalid-host-name` (1–64 characters, no control characters), `409 host-limit` (`MAX_HOSTS`, default 5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `POST /v1/hosts/{id}/tunnel` `{ "originPort": n }`        | `{ hostname, token }`: creates the Host's tunnel and proxied CNAME if missing, points the gateway ingress at `http://127.0.0.1:<originPort>` and returns the connector token for `deepseekbot connect-enable`, plus `{ account, relayKey }` (the Host's offer-signing key) when `CONNECT_HOST_KEY` is set. `400 invalid-origin-port`, `404 host-not-found`, `502 upstream-unavailable`                                                                                                                                                                                                                                                                                                                                                                    |
| `POST /v1/hosts/{id}/offer` `{ "verifierHash", "name"? }` | `{ offer, expiresAt, hostname, host: { id, name } }`: a one-time pairing offer from the Host for a phone signed in to the same account; `host` is the Host's own pairing identity, which the phone saves. `verifierHash` is the base64url SHA-256 of a secret the phone keeps and sends with the offer to `/botharness-device/pair`, so only that phone can redeem it. The relay POSTs `{ hostId, account, verifierHash, name?, issuedAt }` to `https://<id>.deepseekbot.dev/botharness-device/connect/offer` with `x-botharness-relay-signature: base64url(HMAC-SHA256(relayKey, body))`; the Host accepts it only for its own id and account within 60 seconds. `400 invalid-verifier`, `409 host-offline`, `502 host-refused`, `503 offer-unavailable` |
| `DELETE /v1/hosts/{id}`                                   | `{ deleted: true }`; deletes the tunnel, its DNS record and the link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Every account signed in to TOB's WorkOS environment may use the relay, up to `MAX_HOSTS` Hosts each. Setting the optional `ALLOWED_USERS` secret (comma-separated WorkOS user IDs) restricts it to those accounts, and others answer `403 account-not-allowed`; a bad, expired or foreign token answers `401 unauthorized`.

Two limits keep open sign-up inside Cloudflare's quota. A Host whose tunnel would push the relay past `MAX_TUNNELS` live tunnels answers `503 relay-full`, and a `POST` beyond the `CONNECT_LIMIT` rate answers `429 rate-limited`. That rate (20 per account per minute) is approximate: Cloudflare counts it per location and its counters are eventually consistent, so it slows churn rather than enforcing an exact quota. `DELETE` is never limited, so a Host can always unlink.

## Reclamation

Cloudflare counts inactive tunnels toward the 1,000 free tunnels per account. A cron trigger runs every minute and deletes tunnels that are not `healthy` or `degraded` and have been inactive for `RECLAIM_AFTER_MINUTES` (default 5), or that never connected within that time. The link and hostname stay; the Host's next `POST /v1/hosts/{id}/tunnel` creates a new tunnel and repoints the same CNAME.

Each run lists the account's tunnels once (100 per page, at most 10 pages) and attempts at most 15 reclaims, including failed deletions or database updates, so a run stays under the Workers Free limits of 50 subrequests and 50 D1 queries and makes at most 40 Cloudflare API calls, about 200 of the 1,200 allowed per 5 minutes. A Host linked to a tunnel the listing no longer shows is unlinked only once the listing was complete and the tunnel is older than `RECLAIM_AFTER_MINUTES`, so a tunnel created moments ago is never orphaned.

## Configuration

| Name                    | Kind   | Meaning                                                                                                                                   |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `CONNECT_DB`            | D1     | Links and tunnel allocations (`migrations/`)                                                                                              |
| `WORKOS_CLIENT_ID`      | secret | TOB's WorkOS client; access tokens must be issued by `https://api.workos.com/user_management/<id>`                                        |
| `CLOUDFLARE_API_TOKEN`  | secret | Account › Cloudflare Tunnel › Edit and Zone › DNS › Edit, limited to the `deepseekbot.dev` zone                                           |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Account that owns the tunnels                                                                                                             |
| `CLOUDFLARE_ZONE_ID`    | secret | The `deepseekbot.dev` zone                                                                                                                |
| `ALLOWED_USERS`         | secret | Optional; restricts the relay to these WorkOS user IDs. Unset: every signed-in account                                                    |
| `CONNECT_HOST_KEY`      | secret | Derives each Host's `relayKey` as `HMAC(key, "host:<id>")`; `deploy.sh` creates it once. Without it offers answer `503 offer-unavailable` |
| `CONNECT_ZONE`          | var    | Tunnel zone, `deepseekbot.dev`                                                                                                            |
| `MAX_HOSTS`             | var    | Hosts per account, `5`                                                                                                                    |
| `MAX_TUNNELS`           | var    | Live tunnels across all accounts, `900` (Cloudflare allows 1,000)                                                                         |
| `CONNECT_LIMIT`         | limit  | Approximate per-location rate limit on `POST`, keyed by account; unbound: no limit                                                        |
| `RECLAIM_AFTER_MINUTES` | var    | Offline minutes before a tunnel is deleted, `5`                                                                                           |

Without the four secrets every route answers `503 relay-unconfigured`. The Worker is served at `connect.botharness.ai`, never on a subdomain of the tunnel zone.

## Development

```sh
pnpm vitest run packages/connect-relay
pnpm --filter @botharness/connect-relay db:migrate:local
pnpm --filter @botharness/connect-relay dev
```

## Deploy

Run `pnpm install --frozen-lockfile` at the repository root. The deployment script uses the
workspace's Wrangler and its existing OAuth login; `wrangler whoami` must include the account
configured in `wrangler.jsonc`.

Before deploying, confirm in the WorkOS environment used by TOB that CLI Auth is enabled, that
the sign-in methods phones and Hosts should offer (for example Google and Magic Auth) are on,
and that `ai.botharness.deepseekbot.dev:/oauth2redirect` is an allowed redirect URI for the
phone's sign-in. Obtain that environment's client ID.

Prepare the machine-local file `~/.config/deepseekbot-connect/cloudflare.env` with
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID`. The token needs
Cloudflare Tunnel Edit on the target account and DNS Edit on `deepseekbot.dev`.
Keep this file private and outside the repository. Supply `WORKOS_CLIENT_ID` through the
environment, then run:

```sh
bash packages/connect-relay/scripts/deploy.sh
```

The script creates or reuses `botharness-connect-relay`, replaces the placeholder D1 UUID,
applies remote migrations, deploys `connect.botharness.ai`, uploads the four secrets through
a private temporary file that it removes, creates `CONNECT_HOST_KEY` once and deletes any earlier
`ALLOWED_USERS` so every signed-in account is admitted. It uses Wrangler OAuth for deployment and stores the
restricted Cloudflare API token only as a Worker secret. Commit the real D1 UUID; never commit
credentials or local environment files.

The final checks require `/v1/config` to return the selected WorkOS client ID and unauthenticated
`/v1/hosts` to return `401`. Verify no migrations remain:

```sh
pnpm --filter @botharness/connect-relay exec wrangler d1 migrations list CONNECT_DB --remote
```

If the final checks fail after deployment, inspect DNS, TLS and the endpoint responses before
rerunning the script: a nonzero exit does not mean the remote deployment was rolled back.
A request using a publicly resolved address with `curl --resolve` retains TLS hostname
verification, but does not prove the machine's default DNS resolver works.

Finally, run `deepseekbot connect-sign-in --wait` against an isolated Host, approve the code in
the browser with an allowlisted application user, and check `deepseekbot connect-status`.
It must report a connected tunnel. The tunnel hostname must reach `/botharness-device/*`,
while `/` and `/api` return `404`. Sign out the disposable Host after verification.
