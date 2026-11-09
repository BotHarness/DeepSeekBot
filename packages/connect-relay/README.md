# @botharness/connect-relay

The DeepSeekBot Connect relay Worker ([ADR-0241](../../docs/adr/0241-hosted-connect-reaches-the-host-through-a-managed-tunnel.md)). It links signed-in WorkOS accounts to Hosts and provisions one Cloudflare Tunnel per Host whose remote ingress admits only the device gateway (`^/botharness-device(/.*)?$`); everything else answers `404` at the Cloudflare edge. Application traffic never passes through this Worker.

## API

Every route except `/v1/config` takes `Authorization: Bearer <WorkOS access token>` from TOB's WorkOS environment. Refusals are `{ error: { code } }`.

| Route                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/config`                                          | `{ clientId, deviceAuthorizationEndpoint, tokenEndpoint, zone }`, the WorkOS client a Host signs in with (CLI Auth) and the tunnel zone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GET /v1/hosts`                                           | `{ hosts: [{ id, name, hostname, createdAt, tunnel, connected?, evicted? }] }` for the signed-in account; `tunnel` is false after reclamation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /v1/hosts` `{ "name": "Studio" }`                   | `201 { host }` with a new `<id>.deepseekbot.dev` hostname. `400 invalid-host-name` (1–64 characters, no control characters), `409 host-limit` (`MAX_HOSTS`, default 5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `POST /v1/hosts/{id}/tunnel` `{ "originPort": n }`        | `{ hostname, token }`: creates the Host's tunnel and proxied CNAME if missing, points the gateway ingress at `http://127.0.0.1:<originPort>` and returns the connector token for `deepseekbot connect-enable`, plus `{ account, relayKey }` (the Host's offer-signing key) when `CONNECT_HOST_KEY` is set. `400 invalid-origin-port`, `404 host-not-found`, `502 upstream-unavailable`                                                                                                                                                                                                                                                                                                                                                                    |
| `POST /v1/hosts/{id}/offer` `{ "verifierHash", "name"? }` | `{ offer, expiresAt, hostname, host: { id, name } }`: a one-time pairing offer from the Host for a phone signed in to the same account; `host` is the Host's own pairing identity, which the phone saves. `verifierHash` is the base64url SHA-256 of a secret the phone keeps and sends with the offer to `/botharness-device/pair`, so only that phone can redeem it. The relay POSTs `{ hostId, account, verifierHash, name?, issuedAt }` to `https://<id>.deepseekbot.dev/botharness-device/connect/offer` with `x-botharness-relay-signature: base64url(HMAC-SHA256(relayKey, body))`; the Host accepts it only for its own id and account within 60 seconds. `400 invalid-verifier`, `409 host-offline`, `502 host-refused`, `503 offer-unavailable` |
| `DELETE /v1/hosts/{id}`                                   | `{ deleted: true }`; deletes the tunnel, its DNS record and the link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `DELETE /v1/account`                                      | `{ deleted: true }`; deletes every Host link of the signed-in account with its tunnel and DNS record, then deletes the WorkOS user (`WORKOS_API_KEY`), so the phone can offer account deletion. The account is marked deleted first, so it can no longer link Hosts and its remaining access tokens answer `401`. Repeating it is safe. `502 upstream-unavailable`, `503 account-deletion-unavailable` when `WORKOS_API_KEY` is not set                                                                                                                                                                                                                                                                                                                   |

Every account signed in to TOB's WorkOS environment may use the relay, up to `MAX_HOSTS` Hosts each. Setting the optional `ALLOWED_USERS` secret (comma-separated WorkOS user IDs) restricts it to those accounts, and others answer `403 account-not-allowed`; a bad, expired or foreign token answers `401 unauthorized`.

Two limits keep open sign-up inside Cloudflare's quota. A Host whose tunnel would push the relay past `MAX_TUNNELS` live tunnels, or its zone past `ZONE_RECORDS` records, first evicts the cheapest tunnel and answers `503 relay-full` only when none qualifies, and a `POST` beyond the `CONNECT_LIMIT` rate answers `429 rate-limited`. Human operations use an account key; Bot identity/grant operations use a separate account-and-owned-Host key after the ownership check. Both keys have a configured rate of 20 per minute. The rate is approximate: Cloudflare counts it per location and its counters are eventually consistent, so it slows churn rather than enforcing an exact quota. `DELETE` is never limited, so a Host can always unlink.

## Linked computer sign-out

| Route                        | Result                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/hosts/{id}/revoke` | `{ deleted: true, sessionRevoked, sessionKnown }`; account-owned target only. `404 host-not-found`, `409 current-host`, `409 session-unknown` when the caller has no validated `sid`. A repeated removal returns `404 host-not-found` without further side effects. |

`GET /v1/hosts` and registration responses also include `sessionKnown`. No route returns the
session ID. Migration `0005_host_sessions.sql` adds `hosts.session_id` and the indexed composite
key on `revoked_sessions(account, session_id)`. Registration binds the caller's validated WorkOS
`sid`; an account-owned tunnel refresh binds its current `sid` using `COALESCE(?, session_id)`.
This both backfills online legacy Hosts and rebinds the existing Host ID after a new sign-in.
A token without `sid` cannot overwrite an existing binding. A backfill-only expression would
incorrectly keep the old session after registration reuse.

Authorization rejects a tombstoned `(account, session_id)` with `401 session-revoked` before route
dispatch, including registration and tunnel refresh. Revoke writes that tombstone before removing
the tunnel, DNS, live activities and Host row. If cleanup fails, it fails closed and retains the
tombstone; the caller may retry cleanup. An optional `WORKOS_API_KEY` additionally revokes that
one WorkOS session, with a bounded request; provider failure reports `sessionRevoked: false`
without undoing the relay-local refusal. This is Connect access revocation, not a guarantee that
other WorkOS-consuming services discard existing access tokens immediately.

Legacy rows with no bound session return `sessionKnown: false`: unlink only, with no sign-out
promise. `DELETE /v1/hosts/{id}` remains the existing self-service unlink and never tombstones a
session. Apply the D1 migration before deploying the Worker; both remote actions remain Human/AX
gates. The Host/CLI/Desktop changes can be reviewed and tested before that rollout, but must not
be reported as production-qualified.

Performance: each authenticated request with `sid` adds one composite-primary-key D1 lookup.
Management lists are on-demand, not part of the Host's three-second Devices snapshot; the UI
regression checks repeated snapshots do not re-fetch. Account rows remain bounded by `MAX_HOSTS`.
Relay tests guard the five-link limit, self/ownership refusal, tombstone enforcement, slot reuse,
re-login binding and legacy behavior; they do not measure Cloudflare latency.

## Bot collaboration control plane

`POST /v1/hosts/{id}/bot-network` registers `{ hostId, publicKey, issuedAt, proof }` for a Host already owned by the authenticated account. `hostId` is the existing stable Bot Host identity, not the Connect registration ID. The proof is base64url HMAC-SHA256 with that registration's `relayKey` over the exact JSON object `{ purpose: "bot-network-registration-v1", connectHostId: id, hostId, publicKey, issuedAt }` in that property order. The request is limited to 4096 bytes and the timestamp must be within 60 seconds. The identity/key pair is immutable for a registration; another registration in the same account cannot claim the same identity. A successful repeat is idempotent. The response is `{ host }`; `GET /v1/hosts` adds `botNetwork: { hostId, publicKey }` only for registered identities.

`POST /v1/hosts/{id}/bot-network/grant` takes `{ recipientId, issuedAt, nonce, proof }`. The sender proves its registration key over `{ purpose: "bot-network-grant-v1", connectHostId: id, recipientId, issuedAt, nonce }`. Both registrations must currently exist in the verified account and have Bot identities. The reply is `{ grant: { payload, signature } }`, where `payload` is the JSON string `{ purpose: "bot-network-peer-v1", account, sender: { id, hostId, publicKey }, recipient: { id, hostId, publicKey }, issuedAt, nonce }`; `signature` is HMAC-SHA256 with the recipient registration's key. The nonce is 32–128 safe identifier characters. These are Bot capability proofs, never Human pairing offers or management credentials.

Receivers must verify the signature, purpose, intended recipient, account and freshness, recheck current account registrations before admission, and require the sender's Noise key proof. A signed grant alone is not proof of current membership after unlink. This control plane stores only Host identity metadata alongside existing Host links, not Bot directories, message bodies, transcripts or pending sends. No production transport qualification is implied by control-plane unit tests.

Refusals include `invalid-bot-identity` / `invalid-bot-peer` (400), `bot-host-proof-invalid` (403), `host-not-found` (404), `bot-host-unregistered` / `bot-host-identity-conflict` (409), and `bot-network-unavailable` (503). Existing account authorization applies. Bot identity/grant POSTs use the owned Host rate budget, preserving the Human account budget. Grant caching on the Host reduces control-plane traffic; cached grants still require current registration membership and Noise proof for each message.

## Reclamation, reconciliation and eviction

[ADR-0312](../../docs/adr/0312-connect-tunnels-share-a-multi-zone-pool-with-eviction.md) defines the lifecycle. A tunnel's CNAME lives exactly as long as the tunnel: reclamation, eviction, unlink and a vanished tunnel all delete both, and the next `POST /v1/hosts/{id}/tunnel` recreates the same `<id>.<zone>` name. If creating the record fails, the request deletes the tunnel it just created, so no tunnel is left without a hostname. A full zone (Cloudflare error 81045) answers `503 relay-full`. A record of the same name that already exists is adopted.

A cron trigger reconciles the D1 rows with Cloudflare every minute. It lists the account's tunnels once (`per_page=1000`) and each Connect zone's tunnel CNAMEs once, then, within `RECLAIM_BUDGET` Cloudflare calls (default 30, under the Workers Free limit of 50 subrequests):

1. caches each tunnel's status in its row (`GET /v1/hosts` and eviction read the cache, never Cloudflare);
2. forgets tunnels missing from a complete listing, with their records;
3. recreates or repoints the record of an online Host and deletes duplicates of its name;
4. deletes tunnels offline or never connected for `RECLAIM_AFTER_MINUTES` (default 5), with their records, and removes Hosts of deleted accounts;
5. deletes `h<id>.<zone>` records that no live row holds, once they are older than the window;
6. deletes `TUNNEL_PREFIX` tunnels (default `dsb-`) that no row references, once they are older than the window.

A failed step stamps `cleanup_at` and the next run starts with the rows least recently attempted, so one failing row never blocks the rest. Each run that changes anything logs one `connect-reconcile` line with its counts.

When provisioning finds `MAX_TUNNELS` live tunnels, or `ZONE_RECORDS` records in the Host's zone, it evicts the cheapest tunnel: gone, then offline longest (beyond 2 minutes), then the least recently used online Host outside `EVICT_PROTECT_MINUTES` (default 30) that is older in use than the requester. It logs `connect-evicted`; with no candidate it answers `503 relay-full` and logs `connect-full`. Last use comes from pairing offers, Live Activity registrations and the Host's own report on its once-a-minute `GET /v1/hosts?host=<id>&idle=<seconds>`.

### Live end-to-end check

`scripts/e2e-lifecycle.ts` drives the real relay code against Cloudflare: a local D1, real tunnels with the pinned `cloudflared`, and a dedicated test zone. It covers provisioning, reaching the gateway through the edge, record repair, eviction, reclamation after the window and orphan sweeps, then deletes everything it created. It refuses `deepseekbot.dev` and uses the `dsbe2e-` tunnel prefix, so it never touches production tunnels or records. The env file holds `CLOUDFLARE_API_TOKEN` (Tunnel Edit and DNS Edit on the test zone), `CLOUDFLARE_ACCOUNT_ID`, `E2E_ZONE_NAME` and `E2E_ZONE_ID`.

```sh
pnpm --filter @botharness/connect-relay exec unrun scripts/e2e-lifecycle.ts ~/.config/deepseekbot-connect/e2e.env report.json
```

## Configuration

| Name                    | Kind   | Meaning                                                                                                                                                          |
| ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONNECT_DB`            | D1     | Links and tunnel allocations (`migrations/`)                                                                                                                     |
| `WORKOS_CLIENT_ID`      | secret | TOB's WorkOS client; access tokens must be issued by `https://api.workos.com/user_management/<id>`                                                               |
| `CLOUDFLARE_API_TOKEN`  | secret | Account › Cloudflare Tunnel › Edit and Zone › DNS › Edit, limited to the Connect zones                                                                           |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Account that owns the tunnels                                                                                                                                    |
| `CLOUDFLARE_ZONE_ID`    | secret | The `deepseekbot.dev` zone                                                                                                                                       |
| `ALLOWED_USERS`         | secret | Optional; restricts the relay to these WorkOS user IDs. Unset: every signed-in account                                                                           |
| `CONNECT_HOST_KEY`      | secret | Derives each Host's `relayKey` as `HMAC(key, "host:<id>")`; `deploy.sh` creates it once. Without it offers answer `503 offer-unavailable`                        |
| `WORKOS_API_KEY`        | secret | API key of the same WorkOS environment; lets `DELETE /v1/account` delete the WorkOS user. Without it account deletion answers `503 account-deletion-unavailable` |
| `CONNECT_ZONE`          | var    | Default tunnel zone, `deepseekbot.dev`; its id is `CLOUDFLARE_ZONE_ID`                                                                                           |
| `CONNECT_ZONES`         | var    | Optional extra zones as `name=zone-id,…`. A Host is placed there only when it lists the zone; each must be dedicated to Connect and in the clients' zone list    |
| `ZONE_RECORDS`          | var    | Tunnel records per zone, `195` (free zones hold 200 records)                                                                                                     |
| `RECLAIM_BUDGET`        | var    | Cloudflare calls per reconciliation run, `30`                                                                                                                    |
| `EVICT_PROTECT_MINUTES` | var    | Minutes after its last use an online Host cannot be evicted, `30`                                                                                                |
| `TUNNEL_PREFIX`         | var    | Tunnel name prefix the reconciler owns, `dsb-`. A test relay on the same account must use another prefix and its own zone                                        |
| `MAX_HOSTS`             | var    | Hosts per account, `5`                                                                                                                                           |
| `MAX_TUNNELS`           | var    | Live tunnels across all accounts, `900` (Cloudflare allows 1,000)                                                                                                |
| `CONNECT_LIMIT`         | limit  | Approximate per-location rate limit on `POST`, keyed by account for Human operations, and account + owned Host for Bot credentials; unbound: no limit            |
| `RECLAIM_AFTER_MINUTES` | var    | Offline minutes before a tunnel is deleted, `5`                                                                                                                  |

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
and that `ai.botharness.deepseekbot.dev:/oauth2redirect` (development builds) and
`app.deepseekbot.mobile:/oauth2redirect` (store builds) are allowed redirect URIs for the phone's
sign-in. Obtain that environment's client ID.

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

Account deletion needs the WorkOS API key of the environment whose client ID the relay uses. Store
it once from an interactive prompt, which neither echoes nor logs it:

```sh
pnpm --filter @botharness/connect-relay exec wrangler secret put WORKOS_API_KEY
```

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
