# @botharness/links

`bh-links`: manage [go.tobs.app](https://go.tobs.app) Campaign short links from the command line ([ADR-0132](https://github.com/BotHarness/BotHarness/blob/main/docs/adr/0132-anonymous-posthog-telemetry-and-campaign-short-links.md), [#955](https://github.com/BotHarness/BotHarness/issues/955)). A **Campaign** owns many **Campaign Links**; each link is a short URL that redirects to the DeepSeekBot site with `utm_campaign`, `utm_source` (platform), `utm_medium` (media) and `utm_content` (link slug) and counts its clicks.

It is a thin client over the links Worker's `/v1` API, typed with the same zod schemas that publish [`/openapi.json`](https://go.tobs.app/openapi.json). Requires Node.js 22 or later and has no runtime dependencies.

```bash
npm install -g @botharness/links
bh-links login                      # paste the token at the prompt; or: export BH_LINKS_TOKEN=bhl_…
bh-links campaigns create ph-launch --name "Product Hunt launch"
bh-links links create --campaign ph-launch --platform x --media post --path /docs/overview/ --language en
bh-links list
```

```text
SLUG       SHORT URL                           CAMPAIGN   PLATFORM  MEDIA  CLICKS
ph-x-post  https://go.tobs.app/ph-x-post  ph-launch  x         post   1
```

## Commands

| Command                                                                                                                              | Result                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `bh-links list [--campaign <slug>] [--all]`                                                                                          | Links with slug, short URL, Campaign, platform, media, clicks; alias of `links list` |
| `bh-links links get <slug>`                                                                                                          | One link with its target URL                                                         |
| `bh-links links create [<slug>] --campaign <slug> --platform <label> --media <label> [--path /] [--language zh\|en] [--note <text>]` | The new link with its short URL and target URL                                       |
| `bh-links links update <slug> [--platform] [--media] [--path] [--language] [--note]`                                                 | The updated link; the slug and Campaign are fixed                                    |
| `bh-links links archive <slug>`                                                                                                      | The archived link                                                                    |
| `bh-links clicks <link> [--days 30]`                                                                                                 | Total and daily (UTC) clicks                                                         |
| `bh-links campaigns list [--all]`                                                                                                    | Campaigns                                                                            |
| `bh-links campaigns get <slug>`                                                                                                      | One Campaign                                                                         |
| `bh-links campaigns create <slug> --name <name> [--description <text>]`                                                              | The new Campaign                                                                     |
| `bh-links campaigns update <slug> [--name] [--description]`                                                                          | The updated Campaign                                                                 |
| `bh-links campaigns archive <slug>`                                                                                                  | The archived Campaign                                                                |
| `bh-links campaigns clicks <slug>`                                                                                                   | Clicks of the Campaign and each of its links                                         |
| `bh-links login [--token <bhl_…>] [--url <url>]`                                                                                     | Checks the token against the API and saves it                                        |
| `bh-links config`                                                                                                                    | The URL and where the token comes from                                               |

- `--json` prints the API response instead of a table; `--all` includes archived entries.
- An empty `--note ''` or `--description ''` clears the value.
- `path` is the Chinese site path; `--language en` opens it under `/en`. Slug, platform and media rules are in the [Worker README](https://github.com/BotHarness/BotHarness/blob/main/packages/links/README.md#redirect).
- Exit codes: `0` success, `1` API or network error (for example `link-not-found (HTTP 404)`), `2` usage error.

## Configuration

| Source                            | Token            | URL                   |
| --------------------------------- | ---------------- | --------------------- |
| Environment                       | `BH_LINKS_TOKEN` | `BH_LINKS_URL`        |
| `~/.config/botharness/links.json` | `token`          | `url`                 |
| Default                           | none             | `https://go.tobs.app` |

The environment wins over the file. `bh-links login` writes the file with mode `0600` (under `$XDG_CONFIG_HOME` when set); without `--token` it asks for the token at a hidden prompt (or reads it from stdin when piped: `pbpaste | bh-links login`), which keeps it out of shell history. A token is a Personal Access Token (`bhl_…`) from the admin page at `go.tobs.app/admin`; `read` tokens can list and read clicks, `write` tokens can also create, update and archive. `bh-links` never prints a token, only its 12-character prefix.

## MCP

Agents can use the same operations over MCP instead of this CLI:

```bash
claude mcp add --transport http botharness-links https://go.tobs.app/mcp --header "Authorization: Bearer $BH_LINKS_TOKEN"
```

## Development

Source lives in `packages/links-cli/src` of the BotHarness repository; `pnpm build` writes `dist/bh-links.mjs` and the workspace `pnpm test` runs the client against the Worker in process. To try it against a local Worker, start `pnpm dev` in `packages/links` and run `BH_LINKS_URL=http://127.0.0.1:8787 node packages/links-cli/dist/bh-links.mjs list`.

## Release

`@botharness/links` is versioned independently of DeepSeekBot and published by `.github/workflows/links-cli-release.yml`.

1. Bump `version` in `packages/links-cli/package.json` (SemVer; a prerelease such as `0.2.0-rc.1` goes to the `next` dist-tag, anything else to `latest`) and merge it to `main`.
2. Tag that commit on `main` and push the tag:

   ```bash
   git tag links-cli-v0.1.0 && git push origin links-cli-v0.1.0
   ```

3. The workflow checks that the tag is on `main` and matches the package version, runs `pnpm install --frozen-lockfile`, `pnpm build` and the links and CLI tests, then waits for approval in the `npm-release` environment.
4. After approval it runs `pnpm --filter @botharness/links publish --provenance --access public`. It authenticates with npm trusted publishing (GitHub OIDC) when a Trusted Publisher for this workflow is configured on npmjs.com for `@botharness/links`, and otherwise with the `NPM_TOKEN` secret, the same fallback as the DeepSeekBot release.

New links use `go.tobs.app` and target `tobs.app`. Existing `go.botharness.ai` and `go.deepseekbot.app` hosts keep serving the same API, MCP and short codes from the same D1 database; existing configured CLI URLs remain valid. The Worker and database keep their existing names.
