# Create Bots from the command line

`deepseekbot create` makes a new PersonaBot without clicking: blank, from a bot bundle (a directory or a zip with the same shape as the [bot-zip export](docs/bot-zip.md)), or from GitHub. It is built for external coding agents driving a DSH install, so its output is machine-first.

## Usage

```bash
deepseekbot create --name <name> [--persona <text> | --persona-stdin]
                   [--description <text>] [--role <tag> ...]
                   [--preset <model-preset-id>] [--home <dsh-home>]
deepseekbot create --name <name> --from-git <url | owner/repo> [...]
deepseekbot create [--name <name>] --from-zip <file> [...]
deepseekbot create [--name <name>] --from-dir <directory> [...]
deepseekbot list [--home <dsh-home>]
deepseekbot show <id> [--home <dsh-home>]
deepseekbot model-presets [--home <dsh-home>]
deepseekbot model-preset-create --name <preset> --orchestrator-provider <p> --orchestrator-model <m>
                                [--orchestrator-effort <e>] --assignment-provider <p>
                                --assignment-model <m> [--assignment-effort <e>] [--home <dsh-home>]
deepseekbot model-preset-apply <id> --preset <preset-id> [--home <dsh-home>]
deepseekbot model-plan <id> [--home <dsh-home>]
deepseekbot pause <id> [--home <dsh-home>]
deepseekbot resume <id> [--home <dsh-home>]
deepseekbot update <id> [--name <name>] [--description <text>] [--role <tag> ...] [--home <dsh-home>]
deepseekbot human-name-set (--name <text> | --clear) [--home <dsh-home>]
deepseekbot channel-human-name-set <channel> (--nickname <text> | --clear) [--home <dsh-home>]
deepseekbot channels [--home <dsh-home>]
deepseekbot channel-messages <channel> [--limit <n>] [--before <id>] [--home <dsh-home>]
deepseekbot grants <id> [--home <dsh-home>]
deepseekbot grant-revoke <id> --grant <grant> [--home <dsh-home>]
deepseekbot grant-write-set <id> --grant <grant> (--enabled | --disabled) [--home <dsh-home>]
deepseekbot schedules <id> [--home <dsh-home>]
deepseekbot schedule-create <id> --title <t> --prompt <p> (--every <s> | --daily <HH:MM> |
                                --weekly <HH:MM> --weekdays <0-6,..> | --once-date <d> --once-time <t> |
                                --cron <expr>) [--timezone <tz>] [--enabled|--disabled] [--locked] [--home <dsh-home>]
deepseekbot schedule-update <id> --sid <schedule> [--title ...] [--prompt ...] [trigger ...] [--home <dsh-home>]
deepseekbot schedule-delete <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-history <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-run-now <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-preview (--every <s> | --daily ... | ...) [--home <dsh-home>]
deepseekbot pairings <id> [--home <dsh-home>]
deepseekbot search <words>
```

Exactly one source per create. `--name` is required for blank and GitHub bots; for bundle imports it overrides the name from `.botharness/bot.json` (or the file name). A `--from-git` value accepts a full Git URL (`https://`, `ssh://`, `git@host:path`) or an `owner/repo` shorthand for `https://github.com/owner/repo.git`, which also covers Bot Marketplace entries through their clone URL. A `--from-dir` bundle skips `.git` as files but packs it as history when present.

`--home` points at the target `DSH_HOME`; a fresh directory works with zero clicks. Without it, `DSH_HOME` from the environment is used. Stop the Host before offline database commands: the profile writer lease is exclusive (`lease-unavailable`). Secret file commands can run online; live commands below use authenticated Host RPC.

## Live Host commands

Set `DEEPSEEKBOT_HOST` to the running Host's loopback origin, or a tailnet HTTPS origin. Supply its current launch token through `DEEPSEEKBOT_HOST_TOKEN` or `--token-file <private-file>`, never a token argument. `--host <origin>` overrides the environment. Login happens per invocation, cookies remain in memory, and restarting the Host requires its new token. Live commands never open the profile database. See [ADR-0159](adr/0159-live-cli-verbs-ride-the-dsh-http-carrier.md).

### Online creation and headless debugging

With that Host selection, `create`, `list`, `show`, `model-presets`, `model-preset-create`, `model-preset-apply`, `model-plan` and `channels` call the existing Host owners. Blank, GitHub/Git, Zip and directory creation use the same source/metadata flags above. Zip/directory inputs are packed/read on the caller and uploaded to the existing Bot Zip import endpoint; Git cloning uses the Host's Git environment and credentials. Do not combine explicit `--home` and an online target. Failed Host calls never fall back to local data; database commands without an online adapter refuse a selected Host instead of silently opening an offline owner. Secret file commands and pure search/schedule preview remain independent.

```bash
deepseekbot create --name QA --preset <preset-id>
deepseekbot create --from-zip ./shared.zip --name Imported --preset <preset-id>
deepseekbot create --name GitBot --from-git owner/repo --preset <preset-id>
deepseekbot model-plan <bot-id>
deepseekbot channels
deepseekbot bot-attention <bot-id> --limit 20 --state handled
deepseekbot bot-sessions <bot-id> --limit 20
deepseekbot bot-activity <bot-id> --limit 20
```

Creation returns `bot`, `dm`, the Host's Memory `dataDir`, completed/deferred `steps` and `next`. The model preset is applied through its owner, never forwarded as a native Agent preset. A missing specified preset is rejected before creation; other model failures after creation preserve the Bot and return its known identity and steps with `outcome: created`. A lost creation/import response can return `outcome: unknown`: inspect the Host before creating again; no automatic mutation retry is provided. A created Bot alone does not prove model usability: use `send` and its exact correlated committed reply.

`bot-attention` supports `--cursor` and the Host's pending/processing/observed/deferred/needs-repair/handled states; it limits pages to 1–100. Session summaries are newest-first and limited to 1–100 (default 50), with `total`; activity limits its session details and reports `sessionCount`. These are bounded summaries, not full tool-call logs or streaming drafts.

For explicit cleanup, `bot-delete-preview <bot-id>` returns the owner's current scope and `preview.token`. Review it, then pipe `{"token":"<preview.token>"}` to `bot-delete-confirm <bot-id> --confirmation-stdin`. This command always retains Memory. Inspect `deletion.phase`; an incomplete cleanup can be continued with `bot-delete-retry <bot-id>`. Scope changes remain owner refusals; deletion is not content purge or complete data erasure.

From a built checkout, `node scripts/cli-smoke.mjs --preset <id> [--zip ./shared.zip] [--git owner/repo] [--cleanup]` drives the business CLI against the selected Host, checks a real reply for each source and returns owned IDs. Without an existing preset, provide `--provider <id> --model <id>`. Successful `--cleanup` deletes only that run's Bot identities through preview/confirmation, retaining Memory and any created preset; failed runs retain their resources for diagnosis. Use a disposable isolated Profile. The script does not authorize external messaging or verify UI rendering. See [ADR-0162](adr/0162-online-cli-management-keeps-explicit-host-authority.md).

```bash
deepseekbot send <bot-id> --body "Reply with QA_OK" --timeout 60
deepseekbot send <bot-id> --body-stdin --message-id human-<UUID>
deepseekbot send-status <bot-id> --message-id <receipt-message-id>
deepseekbot channel-messages <channel-id> --host http://127.0.0.1:31917 --limit 20
deepseekbot tool-approval-status <channel-id> --message-id <card-id>
deepseekbot tool-approval-decide <channel-id> --message-id <card-id> --outcome allowed-once
deepseekbot tool-approval-decide <channel-id> --message-id <card-id> --outcome rejected
deepseekbot user-question-status <channel-id> --message-id <card-id>
deepseekbot user-question-answer <channel-id> --message-id <card-id> --answer-stdin
deepseekbot ask-secret-status <channel-id> --message-id <card-id>
deepseekbot ask-secret-submit <channel-id> --message-id <card-id> --values-stdin
deepseekbot ask-secret-cancel <channel-id> --message-id <card-id>
deepseekbot ask-secret-account-status <channel-id> --message-id <configured-card-id>
deepseekbot ask-secret-replace <channel-id> --message-id <configured-card-id>
deepseekbot ask-secret-revoke <channel-id> --message-id <configured-card-id>
deepseekbot release-info [--since <version>]
deepseekbot workspace-options
deepseekbot grant-create <bot-id> --workspace <workspace-id>
```

`send` establishes the registered Bot's DM and returns `receipt`, the committed Human `message`, `sourceEventId`, processing `state`, and `replies` associated with that exact request and Bot-owned Session. Other requests, approval/question cards, notices and failures do not count as replies. A real reply verifies the selected model and key together. The deadline defaults to 120 seconds and accepts up to 600. No send is automatically retried. Failures after starting the send include its receipt: inspect `send-status` before resubmitting. A supplied `human-<UUID>` ID with the same body lets the Host deduplicate; a changed body fails coded. Handled-without-reply returns `reply-not-produced`; repair-needed processing returns `send-needs-repair`.

Question answer stdin is `{"answers":[{"id":"question-id","selected":["Blue"],"custom":"optional text"}]}`; read IDs and options from live channel history. Host owners apply decisions once and return coded refusals for repeated or competing decisions. Tool approval exposes allow-once and reject. Question status preserves pending/submitted/answered/expired distinctions. Release commands only read lifecycle information. Workspace grants take IDs from `workspace-options`.

Private input uses the authenticated Owner and the same inline cards as Web Chat. Read `privateInputRequest.fields` and the card ID from `channel-messages`, then feed a JSON object of those field IDs and confidential strings to `ask-secret-submit --values-stdin` from a trusted source. Keep values out of arguments, shell history and ordinary messages. Submission and cancellation return only `{accepted:true}`; no command reads original values back. `ask-secret-status` returns request settlement, while `ask-secret-account-status` reports current access, including revoked or superseded. Replacement returns a new blank card's `{messageId}` for a separate stdin submission; revocation returns `{accepted:true,stopped,completed,uncertain}` and withdraws local access, without undoing remote effects. Private-operation refusals use the static `private-input-not-accepted` error instead of forwarding Host payloads. Mutations never retry automatically; inspect status and history after an uncertain transport outcome. See the [private input guide](dev/guides/private-input-cli.md) for the opt-in execution boundary and runnable qualification.

Host-down commands fail `host-unreachable` without submitting a message. Expired tokens fail `host-unauthorized`; malformed responses fail `host-protocol-error`. Bridge and gateway codes pass through unchanged. Stdout remains one JSON document (`--compact` is available); authentication values are never printed or saved.

Credential writes validate actual YAML before and after disk writes and restore exact previous bytes on failure (or remove a failed new file). Empty `refs: {}` becomes a block map while comments and records remain. Multiline values, including blank and trailing lines, round-trip. Null refs, empty stores and nonempty inline refs maps fail `bad-credentials` unchanged; use a block refs mapping for edits.

## IM application authorization

Use the same live Host authentication described above. `im-apps` discovers compatible Feishu and WeChat flows; it does not expose account credentials. The isolated development launcher can install the qualified Provider with `--im-provider`.

```bash
deepseekbot im-apps
deepseekbot im-authorize weixin
deepseekbot pairing-status <attempt-id>
deepseekbot pairing-status <attempt-id> --wait --timeout 120
deepseekbot im-authorize feishu
deepseekbot im-credentials <attempt-id> --credentials-stdin < /private/app-credentials.json
deepseekbot im-verify <attempt-id> --verification-stdin < /private/phone-code.txt
deepseekbot im-cancel <attempt-id>
```

Feishu credential stdin is JSON with exactly `appId`, `appSecret` and `domain` (`feishu` or `lark`); app IDs start with `cli_`. Keep input files private, or feed stdin directly from a secret manager. WeChat returns a nonsecret `authorization.qrDataUrl` PNG and `next` prompts: display the data URL, scan and confirm it on a phone, then poll the returned `attemptId`. If the state is `needs_verification`, submit the 4–8 digit phone code through stdin. Neither secret belongs in a command argument or chat transcript.

The Provider owns attempts and native accounts. Attempts last at most ten minutes and do not survive Host restart; the Provider QR can expire sooner, so use the returned state and expiresAt. `--wait` stops at `ready`, `credentials` or `needs_verification`; on `authorization-timeout`, poll the same attempt again. Completed output includes the native account reference, fingerprint and actual connection status. `setup-expired` requires a new attempt; terminal states fail `authorization-expired`, `authorization-failed` or `authorization-cancelled`. Cancellation acknowledges the attempt and does not revoke an already authorized account. A failed start without an attempt ID has an unknown outcome: inspect Provider status before retrying.

IM application authorization does not choose a PersonaBot or create a conversation Grant. `pairing-status` polls this Provider attempt; `pairings <bot-id>` lists the Bot's administrator pairing requests. Provider locality checks can be stricter than the CLI's tailnet carrier. See [ADR-0161](adr/0161-cli-im-authorization-keeps-provider-attempt-authority.md).

## Machine contract

`send` waits until the request is handled before returning its committed replies, so sequential commands do not steer a still-running previous turn. Concurrent same-Bot sends retain the Host's DM delivery policy; a handled request with no attributable reply fails honestly. To repeat the live soak on an isolated, model-authorized QA Bot, run `node scripts/e2e-cli-live.mjs --launch <private-launch.json> --bot <id> --rounds 8 --interval-seconds 30 --output <private-report.json>` after `pnpm build`. Use interval `0` to verify immediate sequential sends.

Stdout carries exactly one JSON document. Success exits 0:

```json
{
  "bot": { "id": "bot-…", "name": "…" },
  "dm": { "channelId": "dm-bot-…" },
  "dataDir": "<dsh-home>/botharness/bots/bot-…/memory",
  "steps": [{ "name": "create-bot", "status": "ok" }],
  "next": ["Open DM dm-bot-… in the DSH web client …"]
}
```

Failure exits non-zero with `{"error": {"code", "message"}}` using a stable code (`usage`, `secret-in-argv`, `bad-zip`, `bad-bundle`, `bad-ref`, `bad-credentials`, `unknown-preset`, `unknown-bot`, `unknown-channel`, `unknown-schedule`, `duplicate-preset`, `git-not-found`, `git-clone-failed`, `git-clone-timeout`, `memory-unavailable`, `memory-conflict`, `memory-unknown-commit`, `not-found`, `invalid-grant`, `locked`, `inactive`, `limit-reached`, `lease-unavailable`, `invalid-input`). Human-readable lines go to stderr only, so stdout stays parseable in both cases. Stdout JSON is pretty-printed by default; `--compact` condenses it to one line. `search` finds commands by words against the same verb table the CLI dispatches.

## Identity

The bot name is a label; identity is the id. Every create mints a new bot, so reusing a name returns a second bot and still exits 0.

## Secrets

Never pass secrets as arguments: any `--api-key` / `--token` / `--secret` / `--password` style flag is a hard error (`secret-in-argv`). Model keys and tokens travel in the environment (for example `DEEPSEEK_API_KEY`, `GITHUB_TOKEN`) or a stdin pipe (`--persona-stdin`); result JSON never contains secret values.

`secret-put <NAME>` reads the value from stdin only and writes that entry under top-level `refs:` in `$DSH_HOME/.credentials.yaml`, keeping every other byte intact; a backup is taken first and the write is re-read before it counts. `secret-list` reports names, sources, and writability, never values. `secret-unset <NAME>` deletes the entry. Malformed stores and wide-open file modes fail coded (`bad-credentials`). See ADR-0158.

## Models

Without `--preset`, creation still succeeds and the `model` step reports `no-model-yet`: authorize a model in Bot-mode Settings, then message the Bot to verify a live reply. With `--preset <model-preset-id>`, that preset is applied at creation; an unknown id fails with `unknown-preset` before any bot is minted.

The model verbs manage the same records afterwards: `model-presets` lists the profile presets, `model-preset-create` mints one from explicit provider/model routes, `model-preset-apply` puts it on a Bot, and `model-plan` shows the active plan. Routes are shape-checked plus provider-existence-checked offline (unknown providers fail fast); catalog liveness and readiness inspection stay Host-side, so `model-plan` reports readiness deferred. See ADR-0157.

## Lifecycle and human naming

`pause` and `resume` gate a Bot's execution; `update` relabels it (`--name`, `--description`, `--role`, within the profile tag/bio limits). `human-name-set` writes the Human display name (`--clear` resets it) and `channel-human-name-set` writes the per-channel Human nickname, using the CONTEXT.md terms. Unknown bots and channels fail coded (`unknown-bot`, `unknown-channel`).

## Channels, grants, schedules, pairings

`channels` lists channels and `channel-messages` reads one page newest-first (`--limit`, `--before`). `grants` lists a Bot's workspace grants while `grant-revoke` and `grant-write-set` manage them; creating a grant needs the Host workspace registry and stays a Host-side action. `schedules` lists a Bot's schedules; `schedule-create` takes `--title`, `--prompt`, and exactly one trigger (`--every` seconds, `--daily`/`--weekly` time plus `--weekdays`, `--once-date` plus `--once-time`, or `--cron`), with `--timezone` required for calendar triggers; `schedule-update`/`schedule-delete`/`schedule-history` address a schedule by `--sid`; `schedule-run-now` records a manual firing that the Host executes on start; `schedule-preview` renders upcoming occurrences for a trigger without a bot. `pairings` lists a Bot's IM pairing requests. Missing schedules fail `unknown-schedule`; deleting one reports `removed`.

## Memory

`memory-snapshot`, `memory-file --path`, `memory-history [--limit]`, and `memory-diff --sha` read the Bot memory store; `memory-save --path (--body | --body-stdin)` writes one file and commits it. `--expected-head` defaults to the current HEAD (pass it explicitly for compare-and-swap); `--edit-id` defaults to a fresh UUID and makes repeat submissions idempotent. A stale head or a no-change write fails with `memory-conflict`, a missing file reads back `null`, and malformed shas fail `invalid-input`.
