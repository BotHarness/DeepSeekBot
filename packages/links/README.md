# @botharness/links-worker

`go.tobs.app`: the Campaign short link Worker ([ADR-0132](../../docs/adr/0132-anonymous-posthog-telemetry-and-campaign-short-links.md), [#953](https://github.com/BotHarness/BotHarness/issues/953)). A **Campaign** owns many **Campaign Links** (see `CONTEXT.md`). Resolving a link redirects to the product site with UTM parameters, counts the click in D1 and sends a server-side `campaign:short_link_click` event to PostHog. It is a Hono app built with `@hono/zod-openapi`; the API is defined once and published as `/openapi.json`.

## Redirect

`GET /{slug}` answers `302` with `Cache-Control: no-store`:

| Case                                                   | Location                                                                                                       | Counted |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------- |
| Active link in an active Campaign                      | `https://tobs.app<target>?utm_campaign=<campaign>&utm_source=<platform>&utm_medium=<media>&utm_content=<link>` | yes     |
| Unknown slug, reserved slug, archived link or Campaign | `https://tobs.app/` without UTMs                                                                               | no      |
| `HEAD` request                                         | same as `GET`                                                                                                  | no      |
| Link previewer or crawler `User-Agent`                 | same as `GET`, with UTMs                                                                                       | no      |
| `GET /`                                                | `https://tobs.app/`                                                                                            | no      |

- **Language.** A link stores the Chinese (default) site path and a `language`. `zh` opens the path as is; `en` opens it under `/en`: path `/docs/overview/` with `en` goes to `/en/docs/overview/`, path `/` with `en` goes to `/en/`. Paths that already start with `/en` are refused so the prefix is never doubled.
- **Not an open redirect.** The origin is fixed in code. A path must start with a single `/` and use only `A-Z a-z 0-9 - . _ ~ / %` (no query, fragment, `..` segment or `//` prefix), and the built URL is checked to stay on `tobs.app`.
- **Slugs** of Campaigns and links: lowercase letters, digits and hyphens, 1–64 characters, not starting or ending with a hyphen, unique, fixed after creation. `v1`, `v2`, `mcp`, `admin`, `api`, `health` and `openapi` are reserved. Request slugs are matched case-insensitively.
- **Generated slugs.** A link created without a `slug` gets `<platform>-<media>` (`_` becomes `-`), or the first free `-2`, `-3`… up to `-100` when that is taken, so `utm_content` stays readable. The admin page prefills a Campaign's slug from its name.
- **Platform** and **media** are free labels (lowercase letters, digits, `-`, `_`, 1–32 characters) so new channels need no deploy. Suggested values: platforms `bilibili`, `x`, `youtube`, `producthunt`, `xiaohongshu`, `zhihu`, `wechat`, `github`, `hackernews`, `reddit`; media `video`, `post`, `launch`, `article`, `thread`, `comment`.
- **Archived** links and Campaigns keep their rows and counts but no longer carry UTMs, so an old post still lands on the site without crediting a closed Campaign.

## Click capture

Counting and the PostHog event run in `waitUntil` after the response, so a D1 write failure or a PostHog outage never blocks or breaks the redirect. D1 keeps a total and a per-UTC-day counter per link; no IP address, user agent or referrer is stored.

Link previewers and crawlers (Twitterbot, facebookexternalhit, Slackbot, Discordbot, TelegramBot, WhatsApp, LinkedInBot, Googlebot, bingbot, Applebot, Embedly, redditbot, Bytespider and any `User-Agent` with a `bot` word, `bot/`, `crawler`, `spider` or `preview`) get the same redirect with UTMs but are neither counted nor sent as `campaign:short_link_click`. In-app browsers such as WeChat (`MicroMessenger`) count as people. The `User-Agent` is only matched in memory; it is never stored or sent.

The event goes to `POST {POSTHOG_HOST}/i/v0/e/`:

```json
{
  "api_key": "<POSTHOG_KEY>",
  "event": "campaign:short_link_click",
  "distinct_id": "<random UUID per click>",
  "properties": {
    "source": "links",
    "campaign": "ph-launch",
    "link": "ph-x-post",
    "platform": "x",
    "media": "post",
    "language": "en",
    "$process_person_profile": false,
    "$geoip_disable": true
  }
}
```

`$process_person_profile: false` keeps clicks out of person profiles; `$geoip_disable` stops PostHog from geolocating the Worker's own egress address. The click is recorded even when the visitor blocks the site's script; the site's pageview then carries the same UTMs for funnels.

## API (`/v1`)

Every `/v1` route needs `Authorization: Bearer <token>`. `GET` routes need a `read` or `write` token; every other route needs `write`. Errors are `{ "error": { "code": "…" } }` (`unauthorized` 401, `insufficient-scope` 403, `invalid-request` 400 with `issues`, `*-not-found` 404, `*-slug-taken` and `campaign-archived` 409). The full contract is `GET /openapi.json`.

| Route                                                                                       | Result                                                                                                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POST /v1/campaigns` `{ slug, name, description? }`                                         | `201` Campaign                                                                                                   |
| `GET /v1/campaigns?includeArchived=true`                                                    | `{ campaigns }`, newest first, active only unless `includeArchived`                                              |
| `GET /v1/campaigns/{slug}`                                                                  | Campaign                                                                                                         |
| `PATCH /v1/campaigns/{slug}` `{ name?, description? }`                                      | Campaign                                                                                                         |
| `POST /v1/campaigns/{slug}/archive`                                                         | Campaign with `archivedAt`                                                                                       |
| `GET /v1/campaigns/{slug}/clicks`                                                           | `{ campaign, total, links: [{ slug, platform, media, clicks, lastClickedAt, archivedAt }] }`                     |
| `POST /v1/links` `{ slug?, campaign, platform, media, path = "/", language = "zh", note? }` | `201` Link with `shortUrl` and the full `target` URL; `409 campaign-archived` for an archived Campaign           |
| `GET /v1/links?campaign=&includeArchived=true`                                              | `{ links }`, newest first                                                                                        |
| `GET /v1/links/{slug}`                                                                      | Link                                                                                                             |
| `PATCH /v1/links/{slug}` `{ platform?, media?, path?, language?, note? }`                   | Link                                                                                                             |
| `POST /v1/links/{slug}/archive`                                                             | Link with `archivedAt`                                                                                           |
| `GET /v1/links/{slug}/clicks?days=30`                                                       | `{ link, total, lastClickedAt, daily: [{ day, clicks }] }`, days with clicks in the last `days` (1–366) UTC days |
| `POST /v1/tokens` `{ name, scope: "read" \| "write", expiresInDays = 90 \| null }`          | `201` token metadata plus `token`, the plaintext shown only in this response                                     |
| `GET /v1/tokens`                                                                            | `{ tokens }` with `id`, `name`, `prefix`, `scope`, `createdAt`, `expiresAt`, `revokedAt`, `lastUsedAt`           |
| `POST /v1/tokens/{id}/revoke`                                                               | The revoked token                                                                                                |

## Personal Access Tokens

- A token is `bhl_` followed by 43 base64url characters (32 random bytes). The first 12 characters are stored as `prefix` so a leaked token can be recognized in the list and in secret scanners.
- Only the SHA-256 hash is stored. The plaintext appears once, in the `POST /v1/tokens` response.
- `read` tokens can call every `GET` route. `write` tokens can do everything, including token management.
- `expiresInDays` defaults to 90; `null` creates a token that never expires. Expired and revoked tokens get `401`. `lastUsedAt` is updated at most once an hour.
- **Bootstrap.** The `LINKS_BOOTSTRAP_TOKEN` secret works as a bearer token for `/v1/tokens` routes only (create, list, revoke), and gets `403 bootstrap-token-only-manages-tokens` elsewhere. It must be at least 32 characters and is compared in constant time. It exists only to get started before the admin page is reachable. Delete it with `npx wrangler secret delete LINKS_BOOTSTRAP_TOKEN` after the first successful admin login; from then on tokens are created and revoked on the admin page.

## MCP (`/mcp`)

The Worker serves a Streamable HTTP MCP server at `POST /mcp` ([#955](https://github.com/BotHarness/BotHarness/issues/955)) for agents such as Claude Code. It is stateless and answers with JSON (a fresh `McpServer` and the SDK's `WebStandardStreamableHTTPServerTransport` per request); `GET` and `DELETE` get `405`.

- **Auth.** `Authorization: Bearer <PAT>` with the same token check as `/v1`; a missing, unknown, expired or revoked token gets `401` with `WWW-Authenticate: Bearer`. The bootstrap secret does not work here.
- **Tools.** Read tools work with a `read` or `write` token; the others need `write` and answer a `read` token with a tool error `{ "status": 403, "error": { "code": "insufficient-scope" } }`. Tools take the same zod schemas as `/v1` and call the same `src/operations.ts`, so validation and errors match the API (`{ status, error: { code } }` as a tool error).

| Tool                                                                          | Scope | Same as                             |
| ----------------------------------------------------------------------------- | ----- | ----------------------------------- |
| `campaigns_list` `{ includeArchived? }`                                       | read  | `GET /v1/campaigns`                 |
| `campaign_create` `{ slug, name, description? }`                              | write | `POST /v1/campaigns`                |
| `campaign_update` `{ slug, name?, description? }`                             | write | `PATCH /v1/campaigns/{slug}`        |
| `campaign_archive` `{ slug }`                                                 | write | `POST /v1/campaigns/{slug}/archive` |
| `campaign_clicks` `{ slug }`                                                  | read  | `GET /v1/campaigns/{slug}/clicks`   |
| `links_list` `{ campaign?, includeArchived? }`                                | read  | `GET /v1/links`                     |
| `link_create` `{ slug?, campaign, platform, media, path?, language?, note? }` | write | `POST /v1/links`                    |
| `link_update` `{ slug, platform?, media?, path?, language?, note? }`          | write | `PATCH /v1/links/{slug}`            |
| `link_archive` `{ slug }`                                                     | write | `POST /v1/links/{slug}/archive`     |
| `link_clicks` `{ slug, days? }`                                               | read  | `GET /v1/links/{slug}/clicks`       |

Link results carry `shortUrl` (`https://go.tobs.app/<slug>`) and `target`, the site URL with the four UTMs. Add the server to Claude Code with a PAT from the admin page:

```bash
claude mcp add --transport http botharness-links https://go.tobs.app/mcp --header "Authorization: Bearer $BH_LINKS_TOKEN"
```

claude.ai web connectors need OAuth, which is the second phase (ADR-0132). For the command line, use [`bh-links`](../links-cli/README.md).

## Admin page (`/admin`)

A server-rendered page (Hono `html` templates, no frontend build) for Humans, behind Cloudflare Access. It calls the same operations as `/v1` (`src/operations.ts`), so validation and rules are identical.

- `/admin`: Campaigns with link and click totals (archived ones on request), a New campaign form, the Personal Access Token list (prefix, scope, expiry, last use, status) with Revoke, and a Create token form. A new token is shown once, with a Copy button, on the response to the create form (`Cache-Control: no-store`); afterwards only its prefix is visible.
- `/admin/campaigns/{slug}`: once the Campaign has clicks, two [TanStack Charts](https://tanstack.com/charts) with tooltips, mounted in the browser from `/admin/assets/admin-charts.js` (built by `pnpm build:assets`, which `pnpm dev` and `pnpm run deploy` run first, and served by the Worker behind Access) (clicks per day over the last 30 UTC days stacked by platform, and total clicks by link), then the Campaign's links with the short URL and a Copy button, platform, media, target, total clicks, the last 7 UTC days as small bars, last click, inline Edit and Archive; a New link form; and the Campaign's name, description and Archive.
- Form posts redirect back with a message (`303`). Cross-site posts are refused with `403` by Hono's `csrf` middleware (`Sec-Fetch-Site: same-origin` or an `Origin` of `https://go.tobs.app`). Pages send `Cache-Control: no-store`, `X-Frame-Options: DENY` and a CSP that allows only the page's own `/admin/admin.js` (copy buttons and confirmations).

### Access verification

Cloudflare Access puts a signed JWT in the `Cf-Access-Jwt-Assertion` header of every request it lets through. The Worker verifies it with Hono's JWT helper (`Jwt.verifyWithJwks`, RS256 only) against `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`, which it caches for an hour per isolate and refetches once when a token does not verify against keys older than a minute (key rotation). The issuer must be `https://<ACCESS_TEAM_DOMAIN>`, the audience must contain `ACCESS_AUD`, `exp`/`nbf`/`iat` must hold and the payload must carry an `email`, which the page shows as the signed-in user. No header gives `401`, an invalid token `403`, and missing `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` `503`. PATs and the bootstrap secret are never accepted here, and the `/v1` API never accepts an Access JWT.

Local development has no Access. Set `ADMIN_DEV_EMAIL=you@example.com` in `.dev.vars` to open the page as that e-mail. The bypass is honored only while `ACCESS_AUD` is empty, so it cannot apply to a deployment where Access is configured; never set it in `wrangler.jsonc` or as a production secret.

### Cloudflare Access setup

1. In the Cloudflare dashboard open **Zero Trust**. Its **Settings** page shows the **team domain**, `<team>.cloudflareaccess.com`.
2. **Access → Applications → Add an application → Self-hosted**. Name it `BotHarness links admin`, session duration 24 hours, and add the public hostname `go.tobs.app` with path `admin*` (this covers `/admin` and `/admin/...`; leave the redirect `/<slug>`, `/v1` and `/openapi.json` unprotected).
3. Add a policy: action **Allow**, include **Emails** with the maintainers' addresses (or an **Emails ending in** rule for the team domain). Use the default identity provider (one-time PIN by e-mail) or the team's GitHub/Google login.
4. Save, then open the application's **Overview** (or **Basic information**) and copy the **Application Audience (AUD) Tag**.
5. Put both values in `wrangler.jsonc` and deploy:

   ```jsonc
   "ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com",
   "ACCESS_AUD": "<application AUD tag>",
   ```

6. Open `https://go.tobs.app/admin`, sign in, create a write token, and delete the bootstrap secret (`npx wrangler secret delete LINKS_BOOTSTRAP_TOKEN`).

## Known limits

- Campaign and link slugs, and a link's Campaign, cannot change after creation; create a new link instead.
- Archiving cannot be undone through the API (there is no restore route).
- List routes return everything in one response, without pagination; fine for the expected tens to hundreds of links.
- Previewer filtering is a `User-Agent` match, so a previewer that pretends to be a browser is still counted.

## Configuration

| Name                    | Kind             | Use                                                                                            |
| ----------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `LINKS_DB`              | D1               | Campaigns, links, daily click counters and token hashes (`migrations/`)                        |
| `LINKS_BOOTSTRAP_TOKEN` | secret           | Bootstrap bearer for `/v1/tokens`; unset or shorter than 32 characters disables it             |
| `POSTHOG_HOST`          | var              | Capture host, default `https://us.i.posthog.com`; empty disables the event                     |
| `POSTHOG_KEY`           | var              | PostHog project API key (public by design); empty disables the event                           |
| `ACCESS_TEAM_DOMAIN`    | var              | Zero Trust team domain, `<team>.cloudflareaccess.com`; the admin page answers `503` without it |
| `ACCESS_AUD`            | var              | Audience tag of the Access application protecting `/admin*`                                    |
| `ADMIN_DEV_EMAIL`       | `.dev.vars` only | Local admin without Access; ignored whenever `ACCESS_AUD` is set                               |

The event goes straight to PostHog US rather than through `t.botharness.ai`: a server-side call is not affected by ad blockers, and a Worker fetching another Worker's custom domain on the same zone is not routed through that Worker without extra configuration.

## Local development

```bash
cd packages/links
printf 'LINKS_BOOTSTRAP_TOKEN=%s\n' "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" > .dev.vars
pnpm db:migrate:local
pnpm dev
curl -s -X POST http://127.0.0.1:8787/v1/tokens \
  -H "authorization: Bearer $(grep LINKS_BOOTSTRAP_TOKEN .dev.vars | cut -d= -f2)" \
  -H 'content-type: application/json' -d '{"name":"local","scope":"write"}'
```

Add `ADMIN_DEV_EMAIL=you@example.com` to `.dev.vars` and open `http://127.0.0.1:8787/admin` for the admin page. Add `POSTHOG_HOST=http://127.0.0.1:<port>` to `.dev.vars` to capture events locally instead of sending them to PostHog. Tests run with the workspace `pnpm test` against an in-memory SQLite D1.

## Deploy

Production deployment is a separate, explicitly authorized step. With `wrangler login` on the botharness.ai account, from `packages/links`:

The D1 database `botharness-links` (APAC) was created on 2026-10-06 and its `database_id` is in `wrangler.jsonc`. To recreate it elsewhere, run `npx wrangler d1 create botharness-links` and put the printed `database_id` into `wrangler.jsonc`.

1. Apply the schema and deploy; the `routes` entry attaches the custom domain `go.tobs.app` (the `botharness.ai` zone is on the same account):

   ```bash
   npx wrangler d1 migrations apply LINKS_DB --remote
   pnpm --filter @botharness/links-worker run deploy
   ```

2. Set the bootstrap secret and keep the generated value in the team password manager:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put LINKS_BOOTSTRAP_TOKEN
   ```

3. Set up Cloudflare Access for `/admin*` and fill `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` (see [Cloudflare Access setup](#cloudflare-access-setup)), then deploy again.
4. Sign in at `https://go.tobs.app/admin`, create a Campaign with two links and a `write` PAT, and delete the bootstrap secret. Use the PAT against the API (for example `curl -H "authorization: Bearer $PAT" https://go.tobs.app/v1/campaigns`), then create a link with it, and open `https://go.tobs.app/<slug>`. Check that the site's `$pageview` in PostHog carries the four UTMs and that `campaign:short_link_click` arrives with the site script blocked.

New links use `go.tobs.app` and target `tobs.app`. Existing `go.botharness.ai` and `go.deepseekbot.app` hosts keep serving the same API, MCP and short codes from the same D1 database; existing configured CLI URLs remain valid. The Worker and database keep their existing names.

`ADMIN_ORIGIN` keeps administration on the existing Cloudflare Access host, `https://go.deepseekbot.app`. GET/HEAD admin requests on the other hosts redirect there without caching; mutations on those hosts are refused. The destination retains its Access JWT verification and CSRF checks. Public redirects and token-authenticated API/MCP calls are not redirected between hosts. A future admin-domain move must configure and verify equivalent Access protection first.
