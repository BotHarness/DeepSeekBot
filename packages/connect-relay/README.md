# @botharness/connect-relay

The hosted Connect relay Worker ([ADR-0241](../../docs/adr/0241-hosted-connect-reaches-the-host-through-a-managed-tunnel.md)). It links signed-in WorkOS accounts to Hosts and provisions one Cloudflare Tunnel per Host whose remote ingress admits only the device gateway (`^/botharness-device(/.*)?$`); everything else answers `404` at the Cloudflare edge. Application traffic never passes through this Worker.

## API

Every route except `/v1/config` takes `Authorization: Bearer <WorkOS access token>` from TOB's WorkOS environment. Refusals are `{ error: { code } }`.

| Route                                              | Result                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/config`                                   | `{ clientId, deviceAuthorizationEndpoint, tokenEndpoint, zone }`, the WorkOS client a Host signs in with (CLI Auth) and the tunnel zone                                                                                                                                                    |
| `GET /v1/hosts`                                    | `{ hosts: [{ id, name, hostname, createdAt, tunnel }] }` for the signed-in account; `tunnel` is false after reclamation                                                                                                                                                                    |
| `POST /v1/hosts` `{ "name": "Studio" }`            | `201 { host }` with a new `<id>.deepseekbot.dev` hostname. `400 invalid-host-name` (1–64 characters, no control characters), `409 host-limit` (`MAX_HOSTS`, default 5)                                                                                                                     |
| `POST /v1/hosts/{id}/tunnel` `{ "originPort": n }` | `{ hostname, token }`: creates the Host's tunnel and proxied CNAME if missing, points the gateway ingress at `http://127.0.0.1:<originPort>` and returns the connector token for `deepseekbot connect-enable`. `400 invalid-origin-port`, `404 host-not-found`, `502 upstream-unavailable` |
| `DELETE /v1/hosts/{id}`                            | `{ deleted: true }`; deletes the tunnel, its DNS record and the link                                                                                                                                                                                                                       |

Without an allowlisted account (`ALLOWED_USERS`, comma-separated WorkOS user IDs, `*` for everyone) authenticated routes answer `403 account-not-allowed`; a bad, expired or foreign token answers `401 unauthorized`.

## Reclamation

Cloudflare counts inactive tunnels toward the 1,000 free tunnels per account. A cron trigger runs every minute and deletes tunnels that are not `healthy` or `degraded` and have been inactive for `RECLAIM_AFTER_MINUTES` (default 5), or that never connected within that time. The link and hostname stay; the Host's next `POST /v1/hosts/{id}/tunnel` creates a new tunnel and repoints the same CNAME.

## Configuration

| Name                    | Kind   | Meaning                                                                                            |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `CONNECT_DB`            | D1     | Links and tunnel allocations (`migrations/`)                                                       |
| `WORKOS_CLIENT_ID`      | secret | TOB's WorkOS client; access tokens must be issued by `https://api.workos.com/user_management/<id>` |
| `CLOUDFLARE_API_TOKEN`  | secret | Account › Cloudflare Tunnel › Edit and Zone › DNS › Edit, limited to the `deepseekbot.dev` zone    |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Account that owns the tunnels                                                                      |
| `CLOUDFLARE_ZONE_ID`    | secret | The `deepseekbot.dev` zone                                                                         |
| `ALLOWED_USERS`         | secret | Allowlisted WorkOS user IDs while testing                                                          |
| `CONNECT_ZONE`          | var    | Tunnel zone, `deepseekbot.dev`                                                                     |
| `MAX_HOSTS`             | var    | Hosts per account, `5`                                                                             |
| `RECLAIM_AFTER_MINUTES` | var    | Offline minutes before a tunnel is deleted, `5`                                                    |

Without the four secrets every route answers `503 relay-unconfigured`. The Worker is served at `connect.botharness.ai`, never on a subdomain of the tunnel zone.

## Development

```sh
pnpm vitest run packages/connect-relay
pnpm --filter @botharness/connect-relay db:migrate:local
pnpm --filter @botharness/connect-relay dev
```
