# @botharness/market

The Bot Marketplace Worker ([ADR-0131](../../docs/adr/0131-bot-marketplace-starts-as-a-github-indexed-catalog.md)). It indexes public GitHub repositories that carry the `botharness-bot` topic into its own D1 database and serves the catalog to the BotHarness Host.

## API

| Route                                                                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/bots?limit=&cursor=&sort=&q=&topic=&lang=`                                                                  | Listed entries; `lang` (see [Localization](#localization)) localizes `displayName` and `bio`. `sort=updated` (default, newest push first) or `stars`, keyset paged by an opaque `nextCursor`. `q` (≤ 100 characters) ranks name > description, topics and descriptor tags > README with FTS5 trigram (terms under 3 characters fall back to substring match ordered by stars), first 200 matches only. `topic` filters by one GitHub topic or descriptor tag. `400` `invalid-sort`, `invalid-query`, `invalid-cursor` |
| `GET /v1/topics`                                                                                                     | `{ topics: [{ topic, count }] }`, the 30 most used GitHub topics and descriptor tags among listed entries, counted once per repository and excluding `botharness-bot`                                                                                                                                                                                                                                                                                                                                                 |
| `GET /v1/bots/{id}?lang=`                                                                                            | `{ bot, readme, readmeLanguage, readmeLanguages, commitSha }` for a listed entry, `readme` being `README.<lang>.md` when it exists (`id` is the GitHub node ID), else `404 bot-not-found`. `readme` is Markdown with relative images rewritten to `raw.githubusercontent.com` and links to `github.com/…/blob` at `commitSha` (or the default branch), common README HTML (`img`, `a`, `br`) turned into Markdown, other tags, comments, scripts and non-`http(s)`/`mailto` URLs removed                              |
| `GET /v1/challenge`                                                                                                  | An HMAC-signed ALTCHA challenge (`no-store`). Its cost (`maxnumber` 50,000 / 250,000 / 1,000,000) rises with the challenges the same source requested in the last 10 minutes. `503 challenge-unavailable` without `ALTCHA_HMAC_KEY`                                                                                                                                                                                                                                                                                   |
| `POST /v1/submissions` `{ "url": "https://github.com/owner/repo", "altcha": "<solution>" }`                          | `201 { bot }`, or `{ error: { code } }` with `challenge-required`, `challenge-invalid`, `challenge-expired`, `challenge-replayed`, `rate-limited` (10 per source per hour), `repository-rate-limited` (one crawl per repository per 5 minutes, with `Retry-After`), `invalid-repository-url`, `repository-not-found`, `repository-private`, `repository-archived`, `repository-missing-topic`, `repository-blocked` or `upstream-unavailable`                                                                         |
| `POST /v1/bots/{id}/reports` `{ "altcha": "<solution>", "reason"?: "…" }`                                            | `202 { received: true }`. Same challenge refusals, `rate-limited` (20 per source per hour), `invalid-report` (reason over 500 characters), `bot-not-found`. Reports from `REPORT_THRESHOLD` (default 3) distinct sources hide the entry as `hidden_reported`; a second report from one source does not count                                                                                                                                                                                                          |
| `POST /v1/admin/blocklist` `Authorization: Bearer <ADMIN_TOKEN>` `{ "id" \| "url", "action": "block" \| "restore" }` | `200 { bot: { id, fullName, visibility } }`. `block` keeps the repository out through paste and discovery (a URL not yet indexed is looked up and blocked); `restore` clears its reports and re-checks it on GitHub. `401 unauthorized`, `400 invalid-admin-request`, `404 bot-not-found`                                                                                                                                                                                                                             |

## Public read API (v1)

The product site ([deepseekbot.app](https://deepseekbot.app) `/market` and `/en/market`, repository `BotHarness/deepseekbot-site`) reads the same `/v1` routes the Host uses. They need no authentication. The `v1` contract only grows: new fields may be added, existing fields keep their names and types, and a breaking change gets a new `/v2` path.

| Route                                                   | Response                                              |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `GET /v1/bots?sort=updated\|stars&limit=&cursor=&lang=` | `MarketplacePage`, browse order                       |
| `GET /v1/bots?q=<search>&topic=&limit=&cursor=&lang=`   | `MarketplacePage`, relevance order, first 200 matches |
| `GET /v1/topics`                                        | `{ topics: { topic: string; count: number }[] }`      |
| `GET /v1/bots/{id}?lang=`                               | `MarketplaceDetail`, or `404 bot-not-found`           |

```ts
interface MarketplaceEntry {
  id: string; // GitHub node ID, stable across renames
  owner: string;
  name: string;
  fullName: string; // "owner/name"
  displayName: string | null; // from .botharness/bot.json
  tags: string[]; // from .botharness/bot.json `tags`, or legacy `roles`
  roles: string[]; // same as tags, kept for older readers
  bio: string | null; // .botharness/bot.json `bio`, else the GitHub description; localized with `lang`
  bioGenerated: boolean; // true when `bio` is the generated summary for `lang` (since 2026-10)
  banner: { recipe: { scene: string; seed: number } } | { image: string } | null; // .botharness/bot.json `banner`; an image is a raw.githubusercontent.com URL at the indexed commit
  description: string | null; // GitHub repository description
  topics: string[]; // without botharness-bot
  stars: number;
  pushedAt: string; // ISO 8601
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  headCommit: { sha: string; committedAt: string } | null;
}

interface MarketplacePage {
  bots: MarketplaceEntry[];
  nextCursor?: string; // opaque; pass back unchanged with the same sort, q and topic
}

interface MarketplaceDetail {
  bot: MarketplaceEntry;
  readme: string | null; // prepared Markdown (see GET /v1/bots/{id} above)
  readmeLanguage: 'zh' | 'en' | null; // the README.<lang>.md `readme` is; null for README.md (since 2026-10)
  readmeLanguages: ('zh' | 'en')[]; // localized README variants the repository has (since 2026-10)
  commitSha: string | null;
}

interface MarketplaceError {
  error: { code: string }; // invalid-sort, invalid-query, invalid-cursor, invalid-limit, bot-not-found
}
```

- **CORS**: responses carry `Access-Control-Allow-Origin` only for the product site (`https://deepseekbot.app`, `https://deepseekbot.dev` and `https://deepseekbot.botharness.ai`) and the site's Vite dev and preview origins (`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, `http://127.0.0.1:4173`), with `Vary: Origin`. `OPTIONS` preflight answers `204` with `GET`, the `accept` header and a one-day max age for those origins and no grant for any other.
- **Caching**: `200` responses send `Cache-Control: public, max-age=60`; errors send `no-store`. Hidden (`hidden_missing`, `hidden_reported`) and blocked entries are never listed, searched or served as detail, so they disappear from the site within a minute.
- Paste, report, challenge and admin routes are not part of this contract and get no CORS grant.

## Abuse protection

Paste and report need a solved [ALTCHA](https://altcha.org/) proof-of-work challenge; the Client solves it with WebCrypto and the Host forwards it, so nothing depends on a CAPTCHA service. A solution is valid once and for 5 minutes. A source is `sha256(ALTCHA_HMAC_KEY + "\n" + CF-Connecting-IP)`; raw IP addresses are never stored, and request events older than an hour are pruned.

| Secret / variable  | Use                                                                                |
| ------------------ | ---------------------------------------------------------------------------------- |
| `ALTCHA_HMAC_KEY`  | Signs challenges and salts source hashes; paste and report are off without it      |
| `ADMIN_TOKEN`      | Bearer token for `/v1/admin/blocklist`; the endpoint refuses everything without it |
| `REPORT_THRESHOLD` | Distinct reporting sources that hide an entry (default 3)                          |

Set the secrets with `wrangler secret put ALTCHA_HMAC_KEY` and `wrangler secret put ADMIN_TOKEN`, and locally in `packages/market/.dev.vars`.

## Sharing presentation: `.botharness/bot.json`

For Bot authors, the user guide is [Share a Bot](https://deepseekbot.botharness.ai/en/docs/share-bot).

An optional descriptor in the Bot repository. Every field is optional; an invalid file (bad JSON, a wrong type, more than 8 tags, a tag over 32 characters, a bio over 160 characters, a name over 60 characters, an image path that is absolute, has `..` or a scheme, or is not `.png`/`.jpg`/`.jpeg`/`.webp`) is ignored as a whole and the defaults stay (repository name, no tags, the GitHub description as bio, generated avatar).

```json
{
  "name": "BotPixel 像素画师",
  "tags": ["像素画", "头像设计"],
  "bio": "把一句话描述画成像素头像。",
  "avatar": { "image": "assets/avatar.png" }
}
```

`avatar` is either `{ "image": "<path in the repository>" }` (PNG, JPEG or WebP, at most 128 KiB) or `{ "recipe": { … } }` (the generated-avatar recipe a PersonaBot stores in `appearance.recipe`). The Worker reads the descriptor together with the README after each push and shows `name`, `tags`, `bio` and `banner` in the Marketplace. `banner` is either `{ "recipe": { "scene", "seed" } }`, which readers draw with `@botharness/pixel-banner`, or `{ "image": ".botharness/banner.png" }`, which the API turns into a `raw.githubusercontent.com` URL pinned to the indexed commit. Without it, readers show a neutral header. Older descriptors that write `roles` instead of `tags` are still read as tags. The Host reads it again from the cloned tree when installing and applies the avatar, never from the catalog; a symlink that leaves the clone is refused.

## Localization

`lang` takes a language tag (`zh`, `zh-CN`, `en`, `en-US`, …); tags that are not Chinese or English are ignored, as is a missing `lang`, and then responses are exactly as before.

- **README**: after each push the crawler lists the repository root and stores one localized README per language next to `README.md`: `README.zh-CN.md`, then `README.zh.md`, then other spellings such as `README_CN.md` or `README-zh.md` for Chinese, and `README.en.md` for English. With `lang`, detail serves that variant, else `README.md`.
- **Name and bio**: in order, the descriptor's `i18n[lang]` (`{ "i18n": { "zh": { "name", "bio" } } }`, same limits as the top level, unknown language keys skipped), the author's `bio` (or GitHub description) when it is already in that language by a Han/Latin character count, the generated summary for that language (`bioGenerated: true`), and finally the author's `bio` in whatever language it is.
- **Generated summaries**: after each refresh run, listings pushed to or whose GitHub description changed since they were last checked and that lack an author bio in a language get a one-sentence `zh`/`en` summary from an OpenAI-compatible chat model, most-starred first, at most 25 model calls per run and stopping after 3 failures in a row. A listing that fails 3 times is skipped until its next push, and listings with fewer failures go first. The prompt treats the listing as untrusted data; output that is not one sentence in the right language is dropped. A summary is regenerated only when `SUMMARY_MODEL` or its input (name, description, bio, tags, the first 6,000 README characters) changes. Summaries are off without `SUMMARY_API_KEY`.
- **Search** also matches the localized READMEs, `i18n` names and bios, and generated summaries.

| Secret / variable  | Use                                                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUMMARY_API_KEY`  | OpenCode Go API key; generated summaries are off without it. Requests send `user-agent: botharness-market/1.0` and one `x-opencode-session` per listing, as Go asks                                                                                                     |
| `SUMMARY_API_BASE` | OpenAI-compatible base URL serving `/models` and `/chat/completions` (default OpenCode Go, `https://opencode.ai/inference/go/v1`)                                                                                                                                       |
| `SUMMARY_MODEL`    | Comma-separated models tried in order (default `free,deepseek-v4.1-flash`). `free` expands to every model id ending in `-free` that `/models` lists at the start of the run, so free models that come and go need no change; the last model that worked is tried first. |

## Scheduled crawl

| Cron         | Job                                                                                                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0 3 * * *`  | Discovery: full `topic:botharness-bot` search sliced by creation date (every slice under the 1,000-result cap), adds new repositories and hides listed ones that no longer match after a complete scan                                                                                   |
| `17 * * * *` | Refresh: GraphQL `nodes` in batches of 100 for stars, push time, topics, description, visibility, archived state and head commit; README, localized READMEs and bot.json are refetched only after a push, then summaries are brought up to date; a failed batch keeps the last good rows |

Each run logs one JSON line (`module: marketplace-worker`, `phase`, counts, `durationMs`), and a refresh with summaries on logs a second one (`phase: summaries`, `model`, `checked`, `generated`, `failed`). GraphQL refresh needs `GITHUB_TOKEN`. Trigger a run locally with `wrangler dev --test-scheduled` and `curl "http://127.0.0.1:8787/__scheduled?cron=0+3+*+*+*"`.

## Local development

```bash
pnpm --filter @botharness/market db:migrate:local
pnpm --filter @botharness/market dev
```

Set `GITHUB_TOKEN` in `packages/market/.dev.vars` for authenticated GitHub requests. Point a local Host at the Worker with the `botharness-core` plugin config `marketplaceUrl` (default `https://market.botharness.ai`), for example in the Profile `cordis.patch.yml`:

```yaml
- id: botharness-core
  config:
    marketplaceUrl: http://127.0.0.1:8787
```

Production deployment is a separate, explicitly authorized step.
