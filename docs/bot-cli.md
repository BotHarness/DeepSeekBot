# Create Bots from the command line

`deepseekbot create` makes a new PersonaBot without clicking: blank, from a bot bundle (a directory or a zip with the same shape as the [bot-zip export](docs/bot-zip.md)), or from GitHub. It is built for external coding agents driving a DSH install, so its output is machine-first.

## Usage

```bash
deepseekbot create --name <name> [--persona <text> | --persona-stdin]
                   [--core-memory <text> | --core-memory-stdin]
                   [--description <text>] [--role <tag> ...] [--avatar-file <image>]
                   [--preset <model-preset-id>] [--memory-location <absolute-dir>]
                   [--home <dsh-home>]
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
deepseekbot schedule-delete <id> --sid <schedule> [--confirm] [--home <dsh-home>]
deepseekbot schedule-history <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-run-now <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-preview (--every <s> | --daily ... | ...) [--home <dsh-home>]
deepseekbot pairings <id> [--home <dsh-home>]
deepseekbot search <words>
deepseekbot skills list
deepseekbot skills show <skill-id>
```

Exactly one source per create. `--name` is required for blank and GitHub bots; for bundle imports it overrides the name from `.botharness/bot.json` (or the file name). A `--from-git` value accepts a full Git URL (`https://`, `ssh://`, `git@host:path`) or an `owner/repo` shorthand for `https://github.com/owner/repo.git`, which also covers Bot Marketplace entries through their clone URL. A `--from-dir` bundle skips `.git` as files but packs it as history when present.

`--memory-location <absolute-dir>` keeps a blank bot's Memory outside the DSH data folder (for example on another drive): the Bot's Memory repository is created in a new `<dir>/<bot-id>` folder, and `dataDir` reports that path. The path must be an existing absolute folder and the per-Bot folder must not exist yet (`invalid-memory-dir`); imports keep the default location. The create dialog offers the same choice under **Advanced settings → Memory location**.

For a blank bot, `--core-memory <text>` or `--core-memory-stdin` writes the root `MEMORY.md` (Core Memory) instead of the usual template, and `--avatar-file <image>` sets the Avatar from a PNG, JPEG or WebP source of at most 5 MB (5,000,000 bytes). The CLI normalizes it to WebP within 1024 × 1024 pixels and 128 KiB, applying orientation and reducing quality/dimensions as needed (`invalid-avatar` for a refused image, `file-unreadable` when the file can't be read). Only one of `--persona-stdin` and `--core-memory-stdin` can read stdin. A Bot can create the same blank Bot from chat with the `bot_create` Bot tool; see [Harness Bot tools without the model](#harness-bot-tools-without-the-model).

`--home` points at the target `DSH_HOME`; a fresh directory works with zero clicks. Without it, `DSH_HOME` from the environment is used. Stop the Host before offline database commands: the profile writer lease is exclusive (`lease-unavailable`). Secret file commands can run online; live commands below use authenticated Host RPC.

## Installed workflow skills

```bash
deepseekbot skills list
deepseekbot skills show bot-management
deepseekbot skills show avatar-management
```

These read-only commands return one JSON document without a model, a running Host, a source checkout or a separately installed skill. They work in both Human and scoped Tob execution. `skills list` returns curated IDs, descriptions and related commands; `skills show <skill-id>` returns the complete Markdown in `skill.body`. Both return `schemaVersion`, `packageName` and `packageVersion` read from the package that runs this CLI. They support `--compact`; target/authentication and mutation flags are not accepted. An unknown ID returns `unknown-skill`; missing installed metadata or content returns `skills-unavailable`.

Tob first discovers current operations through `capabilities`, then reads the relevant packaged skill before preparing a proposal. For avatar work, use `avatar-management`: it describes source-image preparation, automatic normalization, Bot/Group commands, fingerprints, review and readback. Packaged guidance grants no additional capability or file access; live capabilities and existing owners still decide whether a command is available and authorized. The direct `bot_create` Harness tool retains its existing 128 KiB source-file contract; this larger source allowance belongs to the CLI paths.

## Live Host commands

Set `DEEPSEEKBOT_HOST` to the running Host's loopback origin, or a tailnet HTTPS origin. Supply its current launch token through `DEEPSEEKBOT_HOST_TOKEN` or `--token-file <private-file>`, never a token argument. `--host <origin>` overrides the environment. Login happens per invocation, cookies remain in memory, and restarting the Host requires its new token. Live commands never open the profile database. See [ADR-0159](adr/0159-live-cli-verbs-ride-the-dsh-http-carrier.md).

### Online creation and headless debugging

With that Host selection, `create`, `list`, `show`, `model-presets`, `model-preset-create`, `model-preset-apply`, `model-plan` and `channels` call the existing Host owners. Blank, GitHub/Git, Zip and directory creation use the same source/metadata flags above. Zip/directory inputs are packed/read on the caller and uploaded to the existing Bot Zip import endpoint; Git cloning uses the Host's Git environment and credentials. Do not combine explicit `--home` and an online target. Failed Host calls never fall back to local data; database commands without an online adapter refuse a selected Host instead of silently opening an offline owner. Secret file commands and search remain independent. The `schedule*` commands use the Host too; see [Schedules on a live Host](#schedules-on-a-live-host).

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

Creation returns `bot`, `dm`, the Host's Memory `dataDir`, completed/deferred `steps` and `next`. The model preset is applied through its owner, never forwarded as a native Agent preset. A missing specified preset is rejected before creation; other model failures after creation preserve the Bot and return its known identity and steps with `outcome: created`. A lost creation/import response without a stable operation key can return `outcome: unknown`: inspect the Host before creating again; no automatic mutation retry is provided. For online creation and inspected imports, use the [receipt-backed operation key](#tob-bot-creation-profiles-and-lifecycle) to reconcile the same identity. A created Bot alone does not prove model usability: use `send` and its exact correlated committed reply.

`bot-attention` supports `--cursor` and the Host's pending/processing/observed/deferred/needs-repair/handled states; it limits pages to 1–100. Session summaries are newest-first and limited to 1–100 (default 50), with `total`; activity limits its session details and reports `sessionCount`. These are bounded summaries, not full tool-call logs or streaming drafts.

For explicit cleanup, `bot-delete-preview <bot-id>` returns the owner's current scope and `preview.token`. Review it, then pipe `{"token":"<preview.token>"}` to `bot-delete-confirm <bot-id> --confirmation-stdin --confirm`. Memory is retained unless `--erase-memory` explicitly selects the owner-reviewed directory, and it erases the Bot's private-input secrets during the stop phase. Inspect `deletion.phase`; an incomplete cleanup can be continued with `bot-delete-retry <bot-id> --confirm`. Scope changes remain owner refusals; deletion is not content purge or complete data erasure.

From a built checkout, `node scripts/cli-smoke.mjs --preset <id> [--zip ./shared.zip] [--git owner/repo] [--cleanup]` drives the business CLI against the selected Host, checks a real reply for each source and returns owned IDs. Without an existing preset, provide `--provider <id> --model <id>`. Successful `--cleanup` deletes only that run's Bot identities through preview/confirmation, retaining Memory and any created preset; failed runs retain their resources for diagnosis. Use a disposable isolated Profile. The script does not authorize external messaging or verify UI rendering. See [ADR-0162](adr/0162-online-cli-management-keeps-explicit-host-authority.md).

```bash
deepseekbot send <bot-id> --body "Reply with QA_OK" --timeout 60
deepseekbot send <bot-id> --body-stdin --message-id human-<UUID>
deepseekbot send-status <bot-id> --message-id <receipt-message-id>
deepseekbot channel-messages <channel-id> --host http://127.0.0.1:31917 --limit 20
deepseekbot tool-approval-status <channel-id> --message-id <card-id>
deepseekbot tool-approval-decide <channel-id> --message-id <card-id> --outcome allowed-once
deepseekbot tool-approval-decide <channel-id> --message-id <card-id> --outcome allowed-always-kind
deepseekbot tool-approval-decide <channel-id> --message-id <card-id> --outcome rejected
deepseekbot user-question-status <channel-id> --message-id <card-id>
deepseekbot user-question-answer <channel-id> --message-id <card-id> --answer-stdin
deepseekbot ask-secret-status <channel-id> --message-id <card-id>
deepseekbot ask-secret-submit <channel-id> --message-id <card-id> --values-stdin
deepseekbot ask-secret-cancel <channel-id> --message-id <card-id>
deepseekbot ask-secret-account-status <channel-id> --message-id <configured-card-id>
deepseekbot ask-secret-replace <channel-id> --message-id <configured-card-id>
deepseekbot ask-secret-revoke <channel-id> --message-id <configured-card-id>
deepseekbot ask-secret-accounts <bot-id>
deepseekbot release-info [--since <version>]
deepseekbot workspace-options
deepseekbot grant-create <bot-id> --workspace <workspace-id>
```

`tool-approval-status` returns `status` and, while the card is still `pending`, its `expiresAt`, the time the Web card counts down to. `--outcome allowed-always-kind` is the `secret_cli` card's "Always allow this kind": it allows this call and saves a rule for the same program, account and environment variable names, which `tool-approval-rules` lists with kind `secret-cli`; any other card refuses it.

### Agent control

These commands let an agent configure a Bot's capabilities and the Host without the Web UI, through the same Host owners and checks the UI uses:

```bash
deepseekbot browser-access-set <bot-id> --enabled
deepseekbot computer-access-set <bot-id> --disabled
deepseekbot access <bot-id>
deepseekbot access-set <bot-id> --mode danger-full-access --scope chat --acknowledge-risk
deepseekbot access-set <bot-id> --mode workspace-write
deepseekbot settings botharness-client
printf '{"assignmentConcurrencyLimit":3}' | deepseekbot settings-set botharness-client --patch-stdin
deepseekbot workspace-create /srv/bots/workspace
deepseekbot group-create "Skill Lab" --member <bot-id> --member <bot-id>
```

`access-set` refuses `danger-full-access` unless `--acknowledge-risk` is given: full access lets the Bot run any command and use the Browser and Computer without an approval card. `--scope chat` also applies it to the Bot's own chat; `assignments` keeps it to new Assignments. `settings` returns `{ns, revision, value}` for one namespace; `settings-set` reads a JSON object of fields from stdin and applies it against that revision, so a concurrent change fails instead of being overwritten. Only fields the Host marks as live can be changed this way. `workspace-create` takes an absolute path and returns the Host workspace, whose id `grant-create` uses.

### Channels and groups

These commands manage Channels and groups through the same Host owners and checks as the Web UI. Each takes a Channel ID from `channels`:

```bash
deepseekbot channel <group-channel>
deepseekbot group-create "Skill Lab" [--member <bot-id> ...] [--operation-key <stable-key>]
deepseekbot channel-rename <channel> --name "Skill Lab" [--expected-channel <channelFingerprint>]
deepseekbot channel-media-target <channel> --source-event <source-event-id> --attachment <attachment-id>
deepseekbot channel-media-download <channel> --source-event <source-event-id> --attachment <attachment-id> --out ./original.csv
deepseekbot group-avatar-set <channel> --avatar-file ./avatar.png [--expected-channel <channelFingerprint>]
deepseekbot group-avatar-set <channel> --clear [--expected-channel <channelFingerprint>]
deepseekbot group-invite <channel> --bot <bot-id> [--operation-key <stable-key>] [--expected-channel <channelFingerprint>]
deepseekbot group-invite-cancel <channel> --invitation <invitation-id> [--expected-channel <channelFingerprint>]
deepseekbot group-join-decide <channel> --request <request-id> --accept [--expected-channel <channelFingerprint>]
deepseekbot group-join-decide <channel> --request <request-id> --decline [--expected-channel <channelFingerprint>]
deepseekbot group-member-remove <channel> --bot <bot-id> [--expected-channel <channelFingerprint>]
deepseekbot group-send-review <channel> [--accept | --off]
deepseekbot group-wake-policies <channel>
deepseekbot group-wake-set <channel> --bot <bot-id> --mode digest --count 5 --interval 30 [--expected-channel <channelFingerprint>]
deepseekbot group-wake-set <channel> --bot <bot-id> --inherit [--expected-channel <channelFingerprint>]
deepseekbot group-delete <channel> --confirm
deepseekbot channel-timeline <channel> [--direction older|newer|around] [--cursor <cursor>] [--around <message-id>] [--limit <n>] [--older-limit <n>] [--newer-limit <n>]
deepseekbot channel-journal <channel> --through <revision> [--before <position>] [--limit <n>]
deepseekbot channel-mark-read <channel> --message-id <message-id>
deepseekbot channel-mark-all-read
deepseekbot channel-react <channel> --message-id <message-id> --emoji 👍 [--remove]
deepseekbot channel-search <channel> --query <text> [--cursor <cursor>] [--limit <n>]
deepseekbot channel-unread
deepseekbot channel-preferences <channel>
deepseekbot channel-mute <channel> [--off] [--expected-state <stateFingerprint>]
deepseekbot channel-pin <channel> [--off] [--expected-state <stateFingerprint>]
deepseekbot channel-hide <channel> [--off] [--expected-state <stateFingerprint>]
deepseekbot channel-human-name-set <channel> (--nickname <text> | --clear) [--expected-state <stateFingerprint>]
deepseekbot channel-retry <dm-channel> --message-id <human-message-id>
deepseekbot channel-bot-stop <channel> --bot <id>
deepseekbot channel-history
deepseekbot channel-history-sources <channel> [--before <cursor>]
deepseekbot channel-purge-preview <channel> --source-event <id> [--source-event <id> …]
deepseekbot channel-purge-preview <channel> --source-event <id> | jq '{token}' \
  | deepseekbot channel-purge-confirm <channel> --source-event <id> --confirm --confirmation-stdin
```

`channel_send` accepts optional `resolve_inbox_ids`: an explicit selection of 1–200 observed Source Event or Message IDs to mark done after a committed send or successful drop. Omitting it preserves Inbox responsibility. Held/refused outcomes never resolve these IDs. When the selection is omitted, `inboxResolution.outcome` is `not-requested`: complete remaining work with `inbox_resolve` before ending the turn. Drop uses the inbound Channel when `channel_id` is omitted. Inspect `inboxResolution` separately: if it fails, repair with `inbox_resolve`, never resend a committed reply. The same parameters work through `bot-tool <bot> channel_send --args-stdin`.

If membership in the initiating opted-in Group is revoked, this run cannot redirect its reply to another Channel. `channel_send` returns `refused` with reason `group-reply-source-revoked`. A later independent DM is unaffected.

`group-send-review <channel> --accept` enables the opt-in freshness check for a local Group;
`--off` disables it and no flag reads its state. It does not change wake settings.
A direct `bot-tool <bot> channel_read --args-stdin` returns `observationIds` for enabled Groups.
Pass the target's handle as `observation_id` to `channel_send`. A `held` result is not a sent
message: read `review.content` when present. If `review.complete` is true, pass its
`review.observationId` as `observation_id` without another `channel_read`; otherwise read the
missing content first. Then pass `draft_id` with the new observation and revised
(or unchanged) `body`. Only one recheck is allowed. Send `drop: true`, `draft_id` and an empty
`body` to abandon the draft without resolving its Inbox item. `expired`, `refused` and
`requires-review` are terminal for automatic sending. Handles cannot cross Bot owners or Groups.

For deliberate yielding, the same direct `bot-tool <bot> channel_send --args-stdin` accepts
`{"channel_id":"...","body":"","drop":true,"draft_id":"...","observation_id":"...","yield_to_message_ids":["..."]}`.
Read the cited peer answers first (`review.peerMessageIds` lists fully returned peers).
The result is `dropped` with `reason: explicit-peer-yield` and `yieldedToMessageIds`, retained
in the draft audit and `bot-trace`. Unobserved, changed, purged, own, Human or preview-only
references return `peer-answer-not-observed`; no drop or Inbox completion occurs. The Host
does not decide that the peer answered adequately. Useful additions and new direct questions
still use the existing send path; resolve only explicitly selected completed Inbox items.

`channel <group-channel>` returns `{channel, channelFingerprint, invitationPolicy:{autoAccept}, wakePolicies}` and refuses non-group Channels. Stable creation/invitation inputs and retry semantics are described under [Tob group creation and invitations](#tob-group-creation-and-invitations); Human online commands may use them too.

Renaming a Bot DM renames that Bot, as in the Web UI. `group-avatar-set` accepts a PNG, JPEG or WebP source of at most 5 MB (5,000,000 bytes) and normalizes it to WebP within 1024 × 1024 pixels and 98,286 bytes, satisfying both the existing 96 KiB image limit and serialized data-URL limit. Invitation and join-request IDs are in the group's `invitations` and `joinRequests`, returned by `channels` and by every group command. `group-wake-set` sets when a member Bot wakes for ordinary group messages: `all`, `mentions`, `digest` (after `--count` messages or `--interval` seconds; defaults 5 and 30) or `silent`; `--inherit` returns the member to its Bot's default. `channel-timeline` and `channel-journal` page messages the way the chat view does; take the `revision` from `channel-timeline` as `--through`. `channel-retry` asks the Bot to answer a Human DM message again after a failed reply. `channel-unread` lists the unread Bot message count of each Channel that has any; these are the numbers the sidebar shows on each row. `channel-mute` mutes a Channel the way the sidebar menu does: it keeps its row greyed and its unread messages out of the Activity total; `--off` unmutes it. `channel-bot-stop` stops the Bot's current turn, as the Stop button on the working status does: the Bot goes idle, the Channel records that the Human stopped it, and a Bot that is not working is refused with `not-working`. Assignments the Bot delegated keep running. `channel-react` adds your reaction to one message, or removes it with `--remove`, and returns the message's `reactions`; a message holds at most 20 of your reactions, and the emoji must be a single emoji. Bots react through `channel_send` with `react_to` and `reaction`, and an empty `body` when they only react; `bot-tool <bot> channel_send --args-stdin` runs that without the model. `channel-search` matches `--query` without case in the messages you can see, newest first, and pages with the `nextCursor` it returns.

`group-delete` and `channel-purge-confirm` cannot be undone and need `--confirm`. `channel-history` lists deleted groups whose content can still be purged. Purging works in two steps like the history page: `channel-purge-preview` lists the messages, Bot admissions, files and effects the chosen Source Events would remove and returns a short-lived `token`; `channel-purge-confirm` reads `{"token": …}` from stdin for the same Source Events and fails coded when the scope changed. Pick Source Events from `channel-history-sources`, which pages with the `before` cursor it returns.

`channel-media-target` acquires checked source media through current Human Channel authorization and returns its canonical Host file target. `channel-media-download` uses the same authenticated attachment route as the card, writes the original bytes to a new local `--out` file and returns size, MIME and SHA-256 in its JSON result. It refuses an existing output instead of overwriting it. Both commands use `channel + source-event + attachment` without a Bot selector or model call; source revocation remains a coded refusal. The default bound is 25 MiB.

### Bot profile, roster and Part Library

These commands set a Bot's look and wake rules, arrange the sidebar and manage Custom Parts through the same Host calls as the Web UI ([#1702](https://github.com/BotHarness/DeepSeekBot/issues/1702)):

```bash
deepseekbot bot-avatar-set <bot-id> --file ./avatar.png
deepseekbot bot-banner-set <bot-id> --file ./banner.png
printf '{"scene":"…","seed":7}' | deepseekbot bot-banner-set <bot-id> --recipe-stdin
deepseekbot bot-banner-set <bot-id> --clear
deepseekbot bot-appearance-set <bot-id> --recipe-stdin < recipe.json
deepseekbot bot-primary-color-set <bot-id> --color '#3366ff'
deepseekbot bot-primary-color-set <bot-id> --automatic
deepseekbot bot-source-policies <bot-id>
deepseekbot bot-source-policy-set <bot-id> --source-class group-ordinary --wake digest --digest-count 5 --digest-interval 600
deepseekbot bot-source-policy-set <bot-id> --source-class human-dm --delivery turn
deepseekbot bot-source-policy-reset <bot-id> --source-class group-ordinary
deepseekbot bot-standing-limits-set <bot-id> --soul 4000 --core-memory 8000
deepseekbot developer-mode-set --enabled
deepseekbot roster
deepseekbot roster-section-create "Work bots"
deepseekbot roster-batch move <channel-id> <channel-id> --section <section-id>
deepseekbot roster-batch pin <channel-id>
deepseekbot roster-pins-set <channel-id> <channel-id>
deepseekbot roster-hidden-set
deepseekbot roster-section-rename <section-id> --name "Play"
deepseekbot roster-section-reorder <section-id> <section-id>
deepseekbot roster-top-reorder section:<section-id> channel:<channel-id>
deepseekbot roster-section-remove <section-id> --confirm
deepseekbot human-identity
deepseekbot human-name-set --name "Vain"
deepseekbot channel-human-name-set <channel-id> --nickname "Boss"
deepseekbot part-library
deepseekbot part-library-import --file ./parts.zip
deepseekbot part-library-import-image --file ./hat.png --slot <slot> --colors 4 --name Hat
deepseekbot part-library-add --part-stdin --name Bob < part.json
deepseekbot part-library-export --out /tmp/part-library.zip
deepseekbot part-library-export --part-id <part-id> --out /tmp/part.png
```

Images are read from a file path: avatar sources are static PNG, JPEG or WebP up to 5 MB (5,000,000 bytes) and 40 million decoded pixels. The CLI preserves the source, applies orientation, fits without enlargement within 1024 × 1024 pixels and compresses to WebP (at most 128 KiB for a Bot; at most 98,286 bytes for a Group). Quality and dimensions may decrease to fit; prepare the composition first because the CLI has no interactive crop. Animated, oversized or undecodable inputs refuse. A banner is a 3:1 PNG; `--clear` returns the avatar to its default and the banner to the seeded scene. `bot-appearance-set` takes the same pixel recipe as the avatar editor and redraws the avatar from it. `--source-class` is `assignment-report` (`--wake conditional|immediate`), `group-ordinary` (`--wake immediate|digest|mentions|silent` with `--digest-count` and `--digest-interval` seconds), or `human-dm`, `bot-dm` and `group-mention` (`--delivery steer|turn`). Roster commands take Channel ids (`dm-<bot-id>` for a DM); `roster-pins-set` and `roster-hidden-set` replace the whole list, so pass no ids to clear it, and `roster-batch move` without `--section` moves to the top level. `roster-section-remove` needs `--confirm` and moves the section's Channels to the top level. With `--host` or `DEEPSEEKBOT_HOST`, `human-name-set` and `channel-human-name-set` use the Host; with `--home` they keep their offline path. `part-library-export` writes the part PNG, or a zip of the whole library, to `--out` and prints its file name and size; `--part-stdin` exports a worn part given as JSON.

### IM apps from the CLI

```bash
printf '{"token":"…"}' | deepseekbot im-app-add discord --credentials-stdin
deepseekbot im-app-status discord
deepseekbot im-bind <bot-id> --app <app-id>
deepseekbot im-status <bot-id>
deepseekbot channel-ingests <channel>
deepseekbot channel-connect <channel> --bot <bot-id> --conversation <external-id>
deepseekbot im-unbind <bot-id> --app <app-id>
deepseekbot im-app-remove discord --app <app-id>
```

`im-app-add` covers token-based platforms (Discord, Slack, QQ, DingTalk, WeCom, Matrix); Feishu and WeChat keep `im-authorize`. Credentials arrive only on stdin and are never printed; output lists each app's id, name, connection state and error code. `im-bind` binds a connected app (the `id` from `im-app-status`, also the `ref` in `im-status`) to a Bot, and `im-status` shows each binding's `reception`. `channel-connect` attaches an external group conversation to a Channel as context through that Bot's binding; the conversation must already be known to the binding, so mention the app there once and pick the id from the `candidates` in `channel-ingests`. Otherwise the Host refuses with `conversation-unavailable`.

### IM messaging, approvals and failure alerts from the CLI

```bash
deepseekbot messaging-defaults discord
printf '{"expectedRevision":1,"collection":"mentions","wake":"digest","count":5,"intervalSeconds":30,"identityEnabled":true}' \
  | deepseekbot messaging-defaults-set discord --input-stdin
deepseekbot messaging-grants <bot-id>
deepseekbot messaging-targets <app-ref>
deepseekbot messaging-authorize <bot-id> --app <app-ref> --target <target-ref>
deepseekbot messaging-receive <bot-id> --grant <grant-id> --enabled
deepseekbot messaging-channel-target <bot-id> --grant <grant-id> --channel <channel-id|none>
printf '{"collection":"all","wake":"digest","count":5,"intervalSeconds":30}' \
  | deepseekbot messaging-group-policy <bot-id> --grant <grant-id> --input-stdin
printf '{"mode":"follow","expectedRevision":0,"wake":null}' \
  | deepseekbot messaging-thread-policy <bot-id> --source <source-event-id> --input-stdin
deepseekbot messaging-source <bot-id> --source <source-event-id>
printf '{"kind":"mute","grantId":"<grant-id>","expectedRevision":2,"muted":true}' \
  | deepseekbot messaging-conversation <bot-id> --input-stdin
deepseekbot messaging-send <bot-id> --grant <grant-id> --body-stdin [--request-id <id>]
deepseekbot messaging-reachable <bot-id> --binding <binding-id> [--cursor <cursor>]
deepseekbot messaging-post <bot-id> --binding <binding-id> --conversation <group-id> --body-stdin [--request-id <id>]
deepseekbot messaging-post-status <bot-id> --binding <binding-id> --conversation <group-id> --body-stdin --request-id <id>
deepseekbot messaging-post-limit <bot-id> --binding <binding-id> --limit <1-10000|none>
deepseekbot messaging-revoke <bot-id> --grant <grant-id> --confirm
printf '{"kind":"policy","restricted":true,"expectedRevision":0}' | deepseekbot sender-access <bot-id> --input-stdin
deepseekbot channel-bridges <channel-id>
printf '{"kind":"add","grantId":"<grant-id>","expectedGrantRevision":2,"name":"QA","enabled":true,"collection":"mentions"}' \
  | deepseekbot channel-bridge <channel-id> --input-stdin
deepseekbot approval-routes <bot-id>
deepseekbot approval-route <bot-id> --pairing <pairing-id|none>
deepseekbot approval-test <bot-id>
deepseekbot approval-retry <bot-id> --delivery <delivery-id>
deepseekbot failure-alerts <bot-id>
deepseekbot failure-alerts-set <bot-id> --enabled
deepseekbot failure-alerts-test <bot-id>
deepseekbot failure-alerts-retry <bot-id> --delivery <delivery-id>
```

For a qualified WeChat private connector, the update JSON also accepts independent `dmMirror` and `dmForward` booleans; both default to `false`. Read `channel-bridges` first and send its current grant/route revisions with the update. The preference is shared by entries for the same Binding and conversation. Turning a switch off stops uncommitted work, including offline; it does not purge history or revoke normal reply authority. Forwarding requires an existing proactive target in the same account. For example, add `"dmMirror":true,"dmForward":false` to an otherwise unchanged update payload to enable local presentation only.

These call the same Host bridge methods as the Bot's IM settings, the Channel bridge list and the approval and failure-alert cards, so the Host applies the same checks and refuses with the same codes. `messaging-grants` lists the Bot's authorized conversations (grant ids, revisions, reception, group and thread policies) and bindings with their post limits, without target digests or app fingerprints. Structured changes read one JSON object from `--input-stdin` in the shape the Web UI sends, including its `expectedRevision`, so a concurrent change fails instead of being overwritten; `approval-route`, `failure-alerts-set` and `messaging-post-limit` read the current revision themselves. `messaging-send` and `messaging-post` print the `requestId` they used: retrying with the same `--request-id` returns the existing post instead of sending twice, and `messaging-post-status` reads it back without posting. Like the confirmation dialogs in the Web UI, `messaging-revoke`, blocking a conversation, deleting a bridge and `delete-*` sender-access changes need `--confirm`. Send only to IM conversations you are authorized to test in.

### Browser and Computer from the CLI

```bash
deepseekbot browser-open <bot-id>
deepseekbot browser-frame <bot-id> --out /tmp/frame.jpg
deepseekbot browser-takeover <bot-id> --enabled
deepseekbot browser-takeover <bot-id> --disabled
deepseekbot browser-stop <bot-id>
deepseekbot computer-status
deepseekbot computer-start --target local
deepseekbot computer-stop
deepseekbot computer-frame --out /tmp/desktop.jpg
deepseekbot computer-takeover --enabled
echo '{"kind":"click","x":10,"y":20}' | deepseekbot computer-input --args-stdin
deepseekbot computer-takeover --disabled
deepseekbot grants <bot-id>
```

`browser-open` starts the Bot's Browser (Browser Access must be on) and returns its tab and viewer URL. `browser-frame` saves the current picture to an absolute path and reports its size and viewport, so an agent can look at what the Bot sees. `browser-takeover --enabled` pauses the Bot's Browser for Human input and `--disabled` hands it back. `computer-start` carries the explicit authorization the panel button sends; read the result with `computer-status`, whose `status.detail` explains a refusal such as a missing OS permission or display. `grants` lists a Bot's Workspace Grants from a live Host. Route refusals keep the Host's code, or `host-refused` with its message.

`computer-frame` saves the current picture of the Computer desktop (Local or Container) to an absolute path and reports its size, `mimeType` (`image/jpeg`, or `image/png` when the Host cannot encode JPEG), `seq` and target. It is the same frame a paired phone polls from `GET /api/computer/frame?after=<seq>`, which waits for the screen to change and answers 204 when it stays the same. `computer-input --args-stdin` sends one Human action to that desktop: `{"kind":"click","x":10,"y":20}` (optional `"button":"right"`, `"count":2`), `{"kind":"scroll","direction":"down","amount":3}`, `{"kind":"type","text":"hi"}` or `{"kind":"key","key":"return","modifiers":["meta"]}`. Coordinates are pixels of the last frame. Both refuse with `not-running` while the Computer is stopped. Input needs `computer-takeover --enabled` first, or it is refused with `not-paused`. `computer-frame` answers `no-frame` when the Computer has not produced a picture yet. `computer-takeover --enabled` returns once any Bot Computer call already in progress has finished (at most 10 seconds), and a result that finishes after the pause starts is withheld from the Bot. While paused, every Bot Computer tool call is refused, screenshots included, so the Bot cannot move focus or see the screen while you type a password. The pause lasts while the phone keeps polling frames or sending input and lapses 30 seconds after the last one; `computer-takeover --disabled` hands the desktop back at once.

### Human Inbox, assignments, Sessions and approval rules

```bash
deepseekbot inbox --category action --limit 20
deepseekbot inbox --category replies --search budget --unread --sort mentions-first
deepseekbot inbox-status
deepseekbot inbox-dismiss <item-id> --source-key <source-event-id>
deepseekbot inbox-snooze <item-id> --source-key <source-event-id> --until 2026-10-15T09:00:00Z
deepseekbot inbox-snooze <item-id> --source-key <source-event-id> --clear
deepseekbot inbox --category action --snoozed
deepseekbot inbox-ignore <report-source-event-id>
deepseekbot assignment-context <bot-id> --session <session-id> --source <source-event-id>
deepseekbot channel-assignments <group-channel>
deepseekbot channel-assign <channel> --section <section-id> --index 0
deepseekbot session-ids
deepseekbot session-owner <session-id>
deepseekbot session-archive-set <bot-id> --session <session-id> --archived
deepseekbot tool-approval-rules <bot-id>
deepseekbot tool-approval-rule-revoke <bot-id> --rule <rule-id> --confirm
deepseekbot grant-revoke <bot-id> --grant <grant-id> --confirm
deepseekbot grant-write-set <bot-id> --grant <grant-id> --disabled
deepseekbot private-mcp-set <bot-id> --server <name> --enabled
deepseekbot private-mcp-remove <bot-id> --server <name> --confirm
```

`inbox --search <text>` searches safe Activity summaries, Channel names and Bot slugs before pagination (maximum 200 characters). `--unread` restricts personal messages to unread entries and leaves pending actions intact. `--sort newest|oldest` orders each category; `--category replies --sort mentions-first` puts mentions before replies. Keep filters unchanged when using `--cursor`. Search, unread filtering and mention ordering require query version 1; an older Host fails with `host-query-unsupported` instead of returning partial results.

`inbox` returns one page of the Human Inbox (`items` and `nextCursor`), filtered like the Inbox tabs by `--category` (`action`, `info`, `unread`, `replies`, `handled`), `--bot` or `--channel`. `inbox-dismiss` takes an item's `id` and, when the item has one, its `sourceEventId` as `--source-key`; `inbox-ignore` marks an informational assignment report as read. `inbox-snooze` hides an Action, Info or Replies item until `--until` (at most 30 days away), the Web Inbox's "Remind me later"; `--clear` brings it back now, and `inbox --snoozed` lists the items still snoozed with their `snoozedUntil`. `assignment-context` reads the report behind an `assignment-report` item. `channel-assignments` lists a group Channel's assignment work; `channel-assign` moves a Channel into a sidebar section (`--unsectioned` takes it out). `session-ids` lists the root Sessions Bots own and `session-owner` names a Session's Bot and role. `tool-approval-rules` lists a Bot's "always allow" rules. Revoking a rule, a Workspace Grant or a private MCP server needs `--confirm`, as the Web UI asks for confirmation. With a Host targeted, `grant-revoke` and `grant-write-set` go through it; with `--home` they stay offline maintenance commands. Private MCP servers are listed by `ask-secret-accounts`; a name the Host does not know fails with `private-mcp-server-unavailable`.

### Tob scheduled work

Inside Tob’s trusted Human-DM Shell, the same seven schedule commands use the existing Bot Schedule owner. `schedules <bot>` returns each schedule’s `stateFingerprint`, its trigger timezone, next occurrence and last firing, plus a collection `stateFingerprint`. Calendar triggers require an explicit IANA timezone; ask the Human to resolve an ambiguous Bot or timezone before writing.

For `schedule-create`, pass the observed collection fingerprint as `--expected-state` and a stable `--operation-key`. For `schedule-update`, `schedule-delete` and `schedule-run-now`, pass the selected schedule’s fingerprint. Creation keys bind the Bot’s identity and complete input; replaying the same key and payload reads the original schedule without another write or approval, even after a Host restart. A changed payload refuses `operation-key-conflict`; deletion refuses `schedule-creation-deleted` instead of recreating work. After an uncertain creation, reconcile that same key and payload before considering a new request.

All five trigger types and the UI’s title, prompt, enable/disable and lock settings are available. The review shows the exact Bot/task, previous state and requested changes. Writes recheck Bot identity and state after approval; independent edits refuse `stale-schedule`. Firing/history changes alone do not invalidate an edit. Locked tasks refuse editing, deleting and running; an explicit reviewed `--unlocked`-only patch can unlock, followed by a separate fresh review for the intended change. Deletion always requires `--confirm` and removes its history. Manual firing is a write: inspect `schedule-history` after an uncertain response and never retry automatically.

```bash
deepseekbot schedules writer
deepseekbot schedule-create writer --title Check --prompt "Summarize the task" --daily 09:00 --timezone Asia/Tokyo --operation-key daily-check-001 --expected-state <collection-fingerprint>
deepseekbot schedule-update writer --sid <id> --disabled --expected-state <schedule-fingerprint>
deepseekbot schedule-history writer --sid <id>
deepseekbot schedule-delete writer --sid <id> --expected-state <schedule-fingerprint> --confirm
```

These scoped requirements supplement the Human CLI below. Preview is timing evidence; only actual history with its Source Event/Session and the selected Bot’s result establishes execution. CLI access does not grant unattended authorization or bypass the original Human-DM source and approval policy.

### Schedules on a live Host

```bash
deepseekbot schedules <bot-id>
deepseekbot schedule-create <bot-id> --title Standup --prompt "Summarize yesterday" --daily 09:00 --timezone Asia/Tokyo
deepseekbot schedule-preview --cron "0 9 * * 1-5" --timezone Asia/Tokyo
deepseekbot schedule-update <bot-id> --sid <schedule-id> --every 3600 --disabled
deepseekbot schedule-run-now <bot-id> --sid <schedule-id>
deepseekbot schedule-history <bot-id> --sid <schedule-id>
deepseekbot schedule-delete <bot-id> --sid <schedule-id> --confirm
```

With a Host selected, the schedule commands call the same Host methods as the Schedules panel, so the Host checks the Bot, the trigger, the time zone and the lock, and a refusal keeps its code (`invalid-input`, `not-found`, `locked`, `inactive`). `schedule-preview` returns the trigger and the Host's next occurrences. `schedule-run-now` queues a firing that the running Host executes. `schedule-delete` also removes the schedule's history, so it needs `--confirm`, like the panel's confirmation.

### Browser and Computer: observation, packages, transfer and logs

```bash
deepseekbot browser-observation <bot-id> [--tab <tab-id>] [--out /tmp/frame.png]
deepseekbot browser-takeover-audit <bot-id>
printf '%s' "<takeover-token>" | deepseekbot browser-takeover-recording --token-stdin
deepseekbot browser-profile-set <bot-id> --profile work
deepseekbot browser-packages
deepseekbot browser-install-packages --package libnss3 --package libgbm1 --confirm --wait
deepseekbot computer-install-packages --confirm --wait
deepseekbot computer-diagnostics
deepseekbot computer-logs [--bot <bot-id>] [--plugin <name>] [--entity <id>] [--since <ms>] [--limit 100]
deepseekbot computer-exports
deepseekbot computer-export [--dir /abs/exports] [--out /tmp/computer.tar]
deepseekbot computer-upload /abs/path/backup.tar [--name restore.tar]
deepseekbot computer-import restore.tar --confirm
deepseekbot computer-open-dir [--dir /abs/exports]
deepseekbot computer-webrtc [--probe]
deepseekbot browser-webrtc --viewer <id> [--probe]
```

`browser-observation` with a running local process but no owned current tab returns `viewerUrl: null`; process readiness alone is not viewer readiness. `browser-frame` preserves a stopped/no-tab refusal (404) and reports an unavailable first frame after the bounded wait as `host-refused` (503).

`browser-observation` returns the same state the Browser panel polls: whether the Browser runs, its tabs and focused tab, takeover state, stored profiles and target. The current picture is never printed as base64; it is summarized as `{mimeType, bytes}` and saved to `--out` when given. `browser-takeover-audit` lists a Bot's takeover events in time order. `browser-takeover-recording` reads one takeover and its recorded input; the token is the `takeover=` value from the takeover link and arrives on stdin. `browser-profile-set` picks the Bot's Browser profile (`default` resets it) with the same name rules as the panel.

`browser-open` refuses a machine without Chrome's system libraries with `provision-missing-libs` and lists the packages in its message. `browser-packages` reports whether the Host can install them (`access`) and the last install's progress; `browser-install-packages` installs the named packages and `computer-install-packages` installs what Local Computer reports missing. Both need `--confirm`, like the panel's install button, and `--wait` polls until the install settles. A Host without administrator rights refuses with `needs-administrator`.

`computer-diagnostics` returns the Computer's recent diagnostic events and `computer-logs` the Host's operational log entries, filtered by plugin, Bot (`--bot`), entity, time (`--since`, epoch milliseconds) and count. The archive commands work with Container Computer only (`container-only` otherwise). `computer-export` writes an archive to the export folder (or `--dir`) and, with `--out`, downloads it right away; the one-time download token is never printed. `computer-upload` streams a local `.tar` into the export folder, `computer-exports` lists the archives there, and `computer-import <archive> --confirm` stops the container and restores its data from that archive. `computer-open-dir` opens the export folder in the Host's file manager.

`computer-webrtc` reads whether a phone can call Container Computer over WebRTC (`/api/computer/webrtc`): the tailnet address and UDP port the container advertises, an empty ICE server list, and the number of open calls, or a refusal code with `fallback: "websocket"` (`not-running`, `media-unavailable`, `tailnet-unavailable`, `tailnet-changed`). `browser-webrtc --viewer <id>` does the same for the Container Browser whose viewer path is `/botharness-browser/viewer/<id>/`. `--probe` opens the signalling socket a phone uses (`/api/computer/webrtc/signaling`, `/api/browser/webrtc/signaling?viewer=<id>`), runs the Selkies handshake up to the server's offer and reports its ICE-lite flag and media candidates; while the probe is open the container streams over WebRTC, and closing it switches back to WebSockets, so a desktop viewer reconnects once. A phone reaches the same routes through `/botharness-device/api/…` on its device credential.

The Web Client's live stream socket (`/api/remote.mux`) and its viewer event report (`/api/computer/diagnostics/viewer`) stay UI-only; `browser-frame`, `browser-observation` and `computer-diagnostics` give an agent the same information.

### Debug by layer: with and without the model

Run the same task twice to find the layer that fails:

```bash
# A — through the Bot: model → Harness → tool → Browser
deepseekbot send <bot-id> --body "Open https://example.com and reply with the main heading."

# B — without the model: the same Browser tool code, Browser Access and audit
deepseekbot browser-tools
printf '{"url":"https://example.com"}' | deepseekbot browser-tool <bot-id> browser_open --args-stdin
deepseekbot browser-tool <bot-id> browser_observe
deepseekbot browser-tool <bot-id> browser_screenshot --out /tmp/shot.jpg
```

If B fails, the Browser itself is the problem (for example a site refusing headless Chrome), whatever the model does. If B works and A does not, look at whether the Bot's tool call was refused (Harness: access or approval) or never made or made with wrong arguments (model). `browser-tool` takes the tool's arguments as a JSON object on stdin, accepts the name with or without the `browser_` prefix, and saves the first image result to `--out`. Direct calls are audited with the session `direct`.

The Computer works the same way. Start it first, then call one of the curated tools with a Bot that has Computer Access:

```bash
deepseekbot computer-start --target local
deepseekbot computer-tools
deepseekbot computer-tool <bot-id> computer_list_windows
deepseekbot computer-tool <bot-id> computer_get_desktop_state --out /tmp/desktop.png
```

`computer-tool` refuses a tool that is not in the curated catalog, a Bot without Computer Access, and a Computer that is not running, with the same messages a Bot would get.

To see what the Bot did in path A, read its tool-call trace right after `send`:

```bash
deepseekbot bot-trace <bot-id> --turns 1
```

Each turn lists the tools the model called with bounded arguments, the outcome (`ok`, `error`, `denied` when an approval was rejected, `cancelled`, or `pending`), the approval decision when there was one, and the first part of the result. Arguments and results of `secret_cli`, `secret_mcp_connect` and `ask_secret` are never returned. A `denied` call points at the Harness (access or approval); a missing or wrongly argued call points at the model; an `error` from the same tool that also fails in path B points at the Browser or Computer. `--session` reads another of the Bot's Sessions, such as an Assignment.

### Harness Bot tools without the model

The Harness tools a Bot uses to talk, read its Inbox and run its Channels and schedules can be called the same way, as that Bot, with no model involved:

```bash
deepseekbot bot-tools
deepseekbot bot-tool <bot-id> channel_list
printf '{"channel_id":"dm-<bot-id>","body":"direct hello"}' | deepseekbot bot-tool <bot-id> channel_send --args-stdin
deepseekbot bot-trace <bot-id> --session direct --turns 5
```

`bot-tools` lists the tools the runner can call with their input schemas. `bot-tool` reads the arguments as a JSON object on stdin and runs the same tool code a Bot turn runs, with the tool's own argument validation, membership and permission checks; it returns `{slug, tool, sessionId: "direct", result}`. There is no inbound Channel, so pass `channel_id` where a turn would default to it. A direct read does not mark Inbox items as seen, and a Bot-to-Bot send is refused because it has no Source Event to carry Bot causation. Failures exit non-zero with a code: `tool-not-direct` for a tool that only works inside a Bot turn (starting or waiting on an Assignment, Subagents, question and secret cards, Memory branch switches, workspace grant requests, images for the model), `invalid-args`, `unknown-bot`, `bot-paused`, or `tool-failed` with the tool's own message. Each call is kept in the Host's recent direct-call log, which `bot-trace --session direct` returns; it lasts until the Host restarts.

`bot_create` creates a blank PersonaBot as that Bot would from chat: `display_name` is required; `description`, `tags`, `avatar_path` (an absolute PNG, JPEG or WebP path in the Bot's Memory Repository or a Workspace Grant), `soul`, `core_memory` and `memory_location` are optional. It returns `bot_id`, `display_name`, `dm_channel_id`, `memory_dir` and `model` (`host-default` when the new Bot answers on the Host default model, `set` once it has its own), opens the new Bot's DM and adds a notice in the creating Bot's Human DM. Refusals are coded: `invalid-input`, `invalid-avatar`, `invalid-memory-dir`, `git-not-found` and `memory-unavailable`. Run directly, it skips the tool approval a Bot turn goes through, because you are the Human running it.

```bash
printf '{"display_name":"Tim","tags":["translator"],"soul":"# Tim\\nCalm and precise."}' | deepseekbot bot-tool <bot-id> bot_create --args-stdin
```

Together with `send` and `bot-trace`, this places a failure: if the direct call works and the same request through `send` does not, look at the model's call in `bot-trace`; if the direct call also fails, the problem is in the Harness or the runtime.

`send` establishes the registered Bot's DM and returns `receipt`, the committed Human `message`, `sourceEventId`, processing `state`, and `replies` associated with that exact request and Bot-owned Session. Other requests, approval/question cards, notices and failures do not count as replies. A real reply verifies the selected model and key together. The deadline defaults to 120 seconds and accepts up to 600. No send is automatically retried. Failures after starting the send include its receipt: inspect `send-status` before resubmitting. A supplied `human-<UUID>` ID with the same body lets the Host deduplicate; a changed body fails coded. Handled-without-reply returns `reply-not-produced`; repair-needed processing returns `send-needs-repair`.

Question answer stdin is `{"answers":[{"id":"question-id","selected":["Blue"],"custom":"optional text"}]}`; read IDs and options from live channel history. Host owners apply decisions once and return coded refusals for repeated or competing decisions. Tool approval exposes allow-once and reject. Question status preserves pending/submitted/answered/expired distinctions. `release-info` only reads lifecycle information. Workspace grants take IDs from `workspace-options`.

Private input uses the authenticated Owner and the same inline cards as Web Chat. Read `privateInputRequest.fields` and the card ID from `channel-messages`, then feed a JSON object of those field IDs and confidential strings to `ask-secret-submit --values-stdin` from a trusted source. Keep values out of arguments, shell history and ordinary messages. Submission and cancellation return only `{accepted:true}`; no command reads original values back. `ask-secret-status` returns request settlement, while `ask-secret-account-status` reports current access, including revoked or superseded. Replacement returns a new blank card's `{messageId}` for a separate stdin submission; revocation returns `{accepted:true,stopped,completed,uncertain}` and withdraws local access, without undoing remote effects; the account's stored values are erased at once. `ask-secret-accounts` lists a Bot's current private accounts as `{status,accounts}`: each row has the account name, purpose, field labels, `configured`/`replacing`/`unavailable`, when it was last set, and the configured card's `channelId` and `messageId` for `ask-secret-replace` and `ask-secret-revoke`. It never returns values or references. Private-operation refusals use the static `private-input-not-accepted` error instead of forwarding Host payloads. Mutations never retry automatically; inspect status and history after an uncertain transport outcome. These commands work in every Profile: since ADR-0189 secret input needs no opt-in and no Docker, see the [ordinary Profile guide](dev/guides/private-input-ordinary.md). The [account lifecycle guide](dev/guides/private-input-cli.md) has runnable checks for replacement, revocation and scheduled reuse.

Host-down commands fail `host-unreachable` without submitting a message. Expired tokens fail `host-unauthorized`; malformed responses fail `host-protocol-error`. Bridge and gateway codes pass through unchanged. Stdout remains one JSON document (`--compact` is available); authentication values are never printed or saved.

Credential writes validate actual YAML before and after disk writes and restore exact previous bytes on failure (or remove a failed new file). Empty `refs: {}` becomes a block map while comments and records remain. Multiline values, including blank and trailing lines, round-trip. Null refs, empty stores and nonempty inline refs maps fail `bad-credentials` unchanged; use a block refs mapping for edits.

### To-do example plugin

These commands reach the to-do example plugin (`@botharness/todo`, [ADR-0203](adr/0203-bot-mode-is-a-dockable-layout-that-plugins-extend-with-dock-panels.md)). They work only on a Host where that plugin is installed; elsewhere they fail `todo-plugin-missing`.

```bash
deepseekbot todos
deepseekbot todo-add --title "Renew the passport"
deepseekbot todo-update <todo-id> --done
deepseekbot todo-update <todo-id> --title "Renew both passports" --not-done
deepseekbot todo-remove <todo-id>
deepseekbot todo-tools
printf '{"title":"Water the plants"}' | deepseekbot todo-tool <bot-id> todos_add --args-stdin
```

`todos` returns `{ok, todos}`, oldest first; each to-do has `id`, `title`, `done`, `createdAt`, `updatedAt` and `createdBy` (`{kind:"human"}` or `{kind:"bot", slug}`). `todo-add`, `todo-update` and `todo-remove` change the list as the Human, the same way the To-do panel will. `todo-tools` lists the Bot tools `todos_list`, `todos_add`, `todos_update` and `todos_remove` with their input schemas, and `todo-tool` runs one of them as that Bot with no model involved, returning `{ok, slug, tool, result}`. Refusals carry a code: `invalid-input` (an empty or too long title, an update with nothing to change, an unknown tool), `invalid-args` (tool arguments that fail the tool's schema), `todo-not-found`, `todo-limit` (the list holds 1,000 to-dos) and `unknown-bot`.

### Auto approval (Approval Templates)

A PersonaBot can select one Approval Template ([ADR-0207](adr/0207-an-approval-template-lets-a-reviewer-session-answer-tool-approvals.md)). While one is selected, an Approval Reviewer answers the Bot's approvals by the template before any card is posted: Shell commands that leave the sandbox, file tools, opening an attachment, `secret_cli` and `secret_mcp_connect` calls, and Computer and Browser Authorization. For a secret tool the reviewer sees the program, its arguments, the account and the placeholder names, never a secret value or an environment value; for an Authorization it sees the device and the Session. `cautious` sends secret tools and both Authorizations to the Human; `get-work-done` allows a known program with the account for its own service, and Browser Authorization when the task needs it. Any call that changes approval policy still goes to the Human as a card.

Templates are a Profile-wide library. Two are built in and read-only, `cautious` and `get-work-done`. Every other template is one Markdown file, `$DSH_HOME/botharness/approval-templates/<name>.md`, that the settings page (Settings → Auto approval) and these commands both read and write. A name uses lowercase letters, digits and dashes; the text is at most 32 KiB, and its first `#` heading and first line become the title and description.

```bash
deepseekbot approval-template list [--bot <bot-id>]
deepseekbot approval-template show cautious
deepseekbot approval-template create night-shift --file night-shift.md
cat night-shift.md | deepseekbot approval-template create night-shift --text-stdin
deepseekbot approval-template create my-cautious --from cautious
deepseekbot approval-template edit night-shift --file night-shift.md
deepseekbot approval-template delete night-shift
deepseekbot approval-template-set <bot-id> night-shift
deepseekbot approval-template-set <bot-id> off
```

`list` returns `{templates}` with each template's `name`, `title`, `description`, `builtIn` and `usedBy` (the Bots that select it); with `--bot` it also returns that Bot's `selected` template, or `null`. `show` returns `{template}` with its full Markdown `text`. `create` and `edit` return `{template}`; `create --from` copies another template's text, which is how a built-in is changed. `delete` returns `{template, clearedBots}`: every Bot that used the template has its selection cleared, so its approvals go back to cards. `approval-template-set` returns `{bot}` with the new `approvalTemplate`. `approval-templates` and `approval-template-show` remain as aliases of `list` and `show`.

Self-escalation guard: when a Bot runs these commands from its own Shell, writing a new template or editing one that no Bot uses needs no card, so a Bot can draft a template for you. Selecting a template, and editing or deleting one that some Bot currently uses, always becomes a Human approval card that neither a saved rule nor the Approval Reviewer can answer; when you reject it, the file stays unchanged. Refusals carry a code: `invalid-input` (a bad name, empty or oversized text, an unknown template to select), `template-exists`, `template-read-only` (a built-in), `unknown-template` and `unknown-bot`.

Each call the reviewer rejects becomes an `auto-rejection` item in the Human Inbox. Its `autoRejection` holds the Session, tool, input, template and reason. `inbox-allow-once` is the Inbox's "Allow this once anyway": it covers that exact call only. The Bot is told it may retry, and the next call in that Session with the same tool and identical input runs without review. Later calls are still reviewed.

```bash
deepseekbot inbox --category action --kind auto-rejection
deepseekbot inbox-allow-once autoreject:<source-event-id>
```

`inbox-allow-once` returns `{accepted, channelId, messageId}`, where `messageId` is the Human's override message in the Channel. An item that was already allowed, or whose Bot left the Channel, is refused with `auto-rejection-unavailable`.

**Circuit breaker.** After 3 rejections in a row, or 20 in one Session, auto approval pauses for that Session: every request posts a card, and the Channel shows a notice. The next approval the Human gives in that Session, on a card or from the Inbox, resumes it with fresh counts. The thresholds are fixed. The breaker and unused "allow once" overrides live in Host memory, so a Host restart resumes auto approval with fresh counts and drops an override the Bot has not used yet; the Inbox item stays handled.

### Approval Reviewer model

By default each Bot's Approval Reviewer runs on that Bot's own model. One Profile-wide setting can name a single reviewer model for every Bot instead, for example a cheap, fast one.

```bash
deepseekbot approval-reviewer-model
deepseekbot approval-reviewer-model-set deepseek/<model> [--effort <effort>]
deepseekbot approval-reviewer-model-set bot
```

Both commands return `{follows, model}`: `follows` is `bot` (each Bot's own model, `model` is `null`), `model` (the named model is used for every review) or `invalid` (the setting file cannot be read). For a named model they also return `available` and, when it is `false`, `unavailableReason`. A model that is not in the catalog, or whose provider has no working key, is still saved, but every review then posts the ordinary Human card and writes `fallback=model-unavailable` with the reason to `logs.db`; the reviewer never switches to another model on its own. Each review's `approval-review` line in `logs.db` names the `model` and the `reviewSession` it used. When a Bot runs `approval-reviewer-model-set` from its own Shell, the call always becomes a Human approval card; neither a saved rule nor the Approval Reviewer can answer it. Refusals carry a code: `usage` (no `<provider>/<model>`, or `--effort` with `bot`) and `invalid-input`.

### Models, usage and activity

```bash
deepseekbot model-catalog
printf '%s' "$PLAN_JSON" | deepseekbot model-plan-set <bot-id> --plan-stdin
deepseekbot model-plan-customize <bot-id> --orchestrator-provider deepseek --orchestrator-model deepseek-reasoner
printf '%s' "$ASSIGNMENTS_JSON" | deepseekbot model-plan-assignments-set <bot-id> --plan-stdin
deepseekbot model-plan-inherit <bot-id>
deepseekbot model-preset-update <preset-id> --name Nightly --orchestrator-effort high
deepseekbot home-model-set --provider <provider-id> --model <model-id> [--orchestrator-effort <effort>] [--expected-revision <default-revision>]
deepseekbot model-preset-apply <bot-id> --preset <preset-id> [--expected-revision <plan-revision>] [--preset-revision <preset-revision>]
deepseekbot overview-usage --period week
deepseekbot overview-memory
deepseekbot activity-overview
deepseekbot channel-activity-today
deepseekbot bot-usage <bot-id> --start 2026-10-01 --end 2026-10-14 [--purpose assignment] [--model <m>] [--provider <p>]
deepseekbot bot-session-usage <bot-id>
deepseekbot bot-activity-history <bot-id> [--before 2026-10-14] [--weeks 26]
deepseekbot group-activity <group-channel>
```

`model-preset-create` also accepts `--plan-stdin` against an online Host, with only `{"assignmentModels":[...]}` in stdin, to preserve allowed models, reasoning efforts and notes when creating a preset. Creation and update forward the complete policy through the same Host bridge as the mobile editor; neither silently reduces it to the default model.

`model-catalog` lists the models the Host can run and the Profile default, as the model pickers do. `model-plan-set` replaces a Bot's whole plan with stdin `{"orchestrator":{...},"assignmentDefault":{...},"assignmentModels":[...]}`; `model-plan-assignments-set` takes the same object without `orchestrator`. A route is `{"provider","model","reasoningEffort"?}` and an Assignment model is `{"provider","model","allowedEfforts":[...],"defaultEffort","note"?}`. `model-plan-customize` changes only the Bot’s Orchestrator, creating an independent override if necessary while preserving fixed or inherited Assignment settings. `model-plan-inherit` drops the Bot's own model so it follows the Profile default. `model-preset-update` changes a preset's name or routes; flags you leave out keep the current values, and an optional `--plan-stdin` `{"assignmentModels":[...]}` replaces its Assignment models. The Host validates every route against its catalog. Plan and preset writes check a revision: `--expected-revision` makes that check explicit; without it the command reads the current revision first, like `memory-save` does with `--expected-head`. A plan changed meanwhile fails with the Host's `invalid-input`.

The online Human CLI accepts `home-model-set --orchestrator-effort` and `--expected-revision`; the latter names `model-catalog.defaultRevision`, or the command reads the current default revision when omitted. `model-preset-apply` accepts `--expected-revision` for the Bot plan and `--preset-revision` for the preset; omitting these retains the existing Human behavior. Scoped Tob calls require the corresponding explicit revisions and cannot omit them to bypass the reviewed snapshot.

`overview-usage` (`--period today|week|month|quarter`; `month` is the last 28 days and `quarter` the last 84, default `today`) and `overview-memory` return the Overview page's per-Bot rows; pass `nextCursor` back as `--after` for more. In `overview-usage`, each bucket is the sum of what providers reported and is `null` only when nothing in it was reported; `partial: true` on the totals, a day or a Bot means some usage in it went unreported, so its `totalTokens` is a lower bound. `activity-overview` shows what every Bot is doing and `channel-activity-today` today's messages per Channel. The `bot-*` readers address a Bot by id and read the Profile panels through its DM: `bot-usage` needs a non-future `--start`/`--end` range shorter than 182 days, `bot-session-usage` groups usage by Session and Assignment, and `bot-activity-history` returns the activity calendar (`--weeks` 1–104). `group-activity` takes a group Channel id. In `bot-activity-history`, a model row’s `totalTokens` retains the reported lower bound with `partial: true` when other calls are unreported; fully unreported usage stays `null`. The strict `bot-usage` query retains its existing unknown-total semantics.

### Marketplace, releases, usage statistics, Git and pairing review

These commands call the same Host methods as the Marketplace page, the update card, the usage statistics notice, the Git prompt and the IM pairing panel:

```bash
deepseekbot marketplace-list [--query <words>] [--topic <topic>] [--sort updated|stars] [--cursor <next-cursor>]
deepseekbot marketplace-topics
deepseekbot marketplace-detail <owner/repo>
deepseekbot marketplace-submit https://github.com/<owner>/<repo>
deepseekbot marketplace-report <owner/repo> [--reason <text>]
deepseekbot release-check
deepseekbot release-install <version> --confirm
deepseekbot release-restart --confirm
deepseekbot telemetry-status
deepseekbot telemetry-set --enabled | --disabled
deepseekbot git-status
deepseekbot git-install
deepseekbot pairing-list <bot-id>
deepseekbot pairing-review <bot-id> <pairing-id> --decision approve --role <role-id>
deepseekbot pairing-review <bot-id> <pairing-id> --decision approve --capability approve [--capability answer ...]
deepseekbot pairing-review <bot-id> <pairing-id> --decision reject
deepseekbot pairing-review <bot-id> <pairing-id> --decision revoke --confirm
```

`release-info` includes an optional Host-owned `identity`: `development` with source revision/dirty state, `release` with version, or `unknown` with a metadata/composition reason. Old Hosts omit this field; absence is not verified release identity. The internal source version placeholder remains `0.0.0`; About displays source identity instead. `release-check` can return `unknown`; install/restart then refuse with `release-identity-invalid`. Installed/staged and running versions remain separate until the new Host answers with the exact target version.

`marketplace-submit` and `marketplace-report` first solve the Host's proof-of-work challenge, as the Web page does, so they can take a few seconds; the Marketplace's own refusals (`repository-missing-topic`, `rate-limited`, …) come back as the error code. A report reason is at most 500 characters. `release-check` returns the update status (`current`, `available`, `restart-required`, `development`, `unknown` or `unavailable`). `release-install` and `release-restart` need `--confirm`; a failed install or restart exits non-zero with `release-<reason>`, such as `release-network` or `release-not-pending`. Restarting stops every running Bot turn, so do it only on a Host you own. `pairing-list` shows a Bot's pairing requests and its roles; `pairing-review` reads the current revisions itself, so a request that changed in between is refused instead of overwritten. Approve with one `--role` for a conversation request or with `--capability` for a management request.

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

The bot name is a label; identity is the id. Without an operation key, every create mints a new bot, so reusing a name returns a second bot and still exits 0. A stable online operation key instead reconciles its original identity.

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

With a live Host selected, the same commands go through the Host's Memory owner instead of the local store, and `memory-save` then requires `--expected-head`. The live Host also offers the rest of the Memory panel:

```bash
deepseekbot memory-graph <bot-id> [--offset <n>]
deepseekbot memory-commit-diff <bot-id> --sha <commit>
deepseekbot memory-changes <bot-id>
deepseekbot memory-working-diff <bot-id> --path <file> --kind staged|unstaged|untracked|current
deepseekbot memory-file-target <bot-id> --path <file>
deepseekbot memory-versions <bot-id>
deepseekbot memory-version-name <bot-id> --sha <commit> --name <version>
deepseekbot memory-version-unname <bot-id> --tag <version>
deepseekbot memory-checkpoints <bot-id>
deepseekbot memory-restore <bot-id> --checkpoint <id> --expected-current <id>
deepseekbot memory-restore-commit <bot-id> --sha <commit> --expected-head <commit> [--name <version>]
deepseekbot memory-repair <bot-id> --expected-head <commit>
```

Writes and restores always name the head or checkpoint they expect, so a concurrent change fails with `memory-conflict` instead of being overwritten; `--restore-id` and `--repair-id` default to fresh UUIDs and make a retry idempotent. A restore records a checkpoint first, which `memory-checkpoints` lists.

To move a Bot's Memory repository to another folder, or back to the default one:

```bash
deepseekbot memory-move <bot-id> --memory-location <absolute-dir>
deepseekbot memory-move <bot-id> --default-location
```

The repository moves to `<absolute-dir>/<bot-id>`; the folder must already exist and must not already hold that Bot. The Bot's main session is archived first, so its next turn starts a new main session in the new folder; history, Memory commits and assignments stay. The move is refused with `bot-busy` while the Bot is working, `invalid-memory-dir` for a missing or occupied folder, and `memory-conflict` while a Memory repair is unfinished. Across drives the files are copied, checked against the original HEAD, then the old folder is removed; a `leftover` path in the result names an old folder that could not be removed.

## Home and Tob

`deepseekbot home-dashboard [--period 24h|7d|30d]` reads the same Home cards as the authenticated Client without provisioning a Bot, sending a message or invoking a model. The default is the exact preceding 24 hours; `from` is inclusive and `to` exclusive, both ISO timestamps. Attention, working Bots, usage and recent activity each retain an explicit unavailable state. Attention separates actionable requests from unread messages. Working Bots require live execution; recent Channels use committed message times and tasks use their owning Assignment update times, never visits or Channel metadata edits.

Rolling usage reads the existing Usage owner's anonymous receipts, now carrying exact event timestamps and nullable reported totals. The indexed query examines at most 50,001 scalar receipts (50,000 plus a truncation sentinel), never Session logs. A numeric partial total is a reported lower bound; `null` means unknown. Generation 102 records an upgrade coverage boundary when historical statistics already exist, so old day buckets cannot silently become exact hourly statistics. Existing non-model reconciliation can enrich receipts from actual trusted events without incrementing daily counters again; missing histories remain unknown. Ordinary history loss retains statistics, while the existing Bot usage purge removes them. `freshness` separately reports reconciliation/degradation. The Host's existing startup reconciliation remains its own lifecycle and is not the Home query. This command preserves `overview-usage` calendar-day semantics and does not grant Human authority to Tob's scoped Shell. Home snapshots refresh on entry or explicit action without a background model report.

`deepseekbot tob-home` prepares/reuses the protected local Tob identity, Memory, managed Workspace and DM, returning their IDs and the canonical attention summary. It does not send a message. `deepseekbot home-model-set --provider <id> --model <id>` updates the native Host default; independent Bot plans remain unchanged.

Tob uses the normal native bash/pwsh Tool to call `deepseekbot`; the dedicated `tob_assignment_limit_read` and `tob_assignment_limit_set` Tools and their direct-runner entries are removed. Existing Assignment Tools are unchanged. The scoped journey supports the Bot creation/profile/lifecycle, group creation/invitation, group settings/member removal, invitation cancellation/join decisions, Channel personal preferences, model, runtime, privacy, Git and update operations listed below; it is an explicit allowlist, not blanket access to every Human CLI command or other Bots' data.

Tob's Host-supplied system guidance is bundled with the plugin and is installed only for the protected Tob Orchestrator; upgrades do not overwrite the Human's editable personality or Memory. A simple question such as “What can you do?” first discovers the installed CLI capabilities, then describes practical outcomes in the Human's language and offers a concrete next step. Capability questions are read-only: they do not propose a mutation or approval. A later specific change request still goes through the existing authority and approval checks.

The npm Bundle ships the core CLI module and product CLI entry. Tob uses a managed executable injected into its eligible Shell environment; it does not depend on a global `deepseekbot`, a source checkout, or manually copied skill files. Missing packaged CLI entries fail release verification; an unavailable runtime CLI is reported rather than replaced with an administrative fallback.

Inside an eligible Tob Shell execution:

```bash
deepseekbot capabilities
deepseekbot settings botharness-client
# Use the previous value and revision returned by the read, not these example values.
printf '%s' '{"assignmentConcurrencyLimit":3}' | deepseekbot settings-set botharness-client --patch-stdin --expected-revision 12 --previous-value '{"assignmentConcurrencyLimit":8}'
```

`capabilities` (also scoped `--help`) reports supported commands, fields, required review inputs and coded refusals. The read returns `{scope, ns, revision, value}`; `value` contains only the allowed fields. The write goes through existing Host approval policy for the parsed namespace, previous value, proposed value and revision. It rechecks the actual Tob root Orchestrator and the exact accepted Human DM source before and after approval and at execution, then reads back the native Settings value. Group/IM requests, Bot-originated input, Assignment Sessions and caller-supplied identities cannot grant this authority.

The Host supplies an ephemeral loopback endpoint and scoped token to this Shell's child environment. This is a short-lived bearer capability, not a Human administrator credential or an isolation boundary against the same OS user; do not print or persist it. It expires when the Shell finishes, aborts or is disposed. Unsupported commands/options, incomplete scoped context and attempts to select another Host, token or offline home refuse rather than falling back to Human/offline access. `stale-setting` requires a new read and proposal; `agent-write-uncertain`, `setting-outcome-uncertain` and `setting-readback-mismatch` require read-back before any retry. A fresh Shell execution is required after context expiry.

A fresh Human message delivered to Tob’s protected private DM establishes a new execution scope even when it arrives during a Memory triage turn. The Host pins that actual delivery separately from the complete accepted context; Memory, Group, external IM and Bot input cannot establish or inherit it. Any later accepted input invalidates a captured execution, and only another fresh protected-DM Human delivery can establish a new one. Current Source Event, Message, recipient admission, Session ownership and purge checks remain in force. A clarification can continue only through its original private question binding and accepted Human answer, with no intervening context; recovered or automation-originated questions grant no management authority.

Authenticated Human `settings-set` keeps its existing behavior. It additionally accepts the paired `--expected-revision` and `--previous-value` flags to apply a previously reviewed patch; the latter is a JSON object with the same fields as the patch. Omitting both retains the existing read-then-write flow. Tob deletion/archiving still refuses with `protected-bot`.

The [UI/CLI coverage inventory](agents/cli-ui-coverage.md) distinguishes existing Human commands from scoped Tob access and tracks the remaining coverage work. See [ADR-0224](adr/0224-tob-management-uses-scoped-native-shell-cli.md) for authority and lifecycle boundaries.

### Bot ZIP file listing and export

```bash
deepseekbot bot-zip-files <bot-id> --host <url>
deepseekbot bot-zip-export <bot-id> --include SOUL.md --out ./selected.zip --expected-state <stateFingerprint> --host <url>
deepseekbot bot-zip-export <bot-id> --all --history --out ./full.zip --expected-state <stateFingerprint> --host <url>
```

These online commands reuse the existing Bot ZIP owner. Listing returns Git-eligible relative paths, sizes, required descriptor/presentation files and a content snapshot fingerprint, without file bodies or the Host's absolute Memory path. The fingerprint binds actual file bytes, Bot profile identity and exportable Git refs; the owner checks again before export and after archive construction. Repeat `--include` for exact paths from that listing; required descriptor/avatar files remain included. `--all` selects every eligible file and is required for `--history`. Git ignore rules, symlink exclusion and the existing archive size/entry limits remain authoritative. History includes content from earlier commits.

`--out` must name a new file. The CLI creates it exclusively with mode `0600`; an existing path refuses `output-exists` without overwrite. Stdout contains only download path, byte count, SHA-256 and related metadata; binary archive data and file bodies never enter the conversation result. A changed content/identity snapshot refuses `stale-bot-files`; read again and review the exact new scope instead of blindly replaying.

Tob invokes the same commands through native Shell from its authenticated Human DM, without a Human Host token, arbitrary Host override or offline directory fallback. Export follows the existing approval policy, showing the target Bot, exact selected/required files and history choice. Denial or revoked authority prevents archive delivery. Exporting Tob personality/Memory does not transfer its protected local identity: existing ZIP import still creates an ordinary Bot. Marketplace selection/import has its own reviewed flow below; transfer grants no cross-Bot Memory editing authority.

### Tob Bot creation, profiles and lifecycle

### Tob Marketplace proposal and selected import

For a requested Bot, Tob prepares a custom SOUL and initial Core Memory proposal and actually searches the Marketplace unless the Human explicitly skips search. `marketplace-list` returns `status: matches` or `no-matches` after a successful query; `marketplace-unavailable` is a service failure, not evidence that no candidate exists. `marketplace-topics` and `marketplace-detail` use the existing catalogue owner. Listing text and the bounded README are marked untrusted data. Search and inspection create no Bot and do not publish, install dependencies or run repository scripts.

```bash
deepseekbot marketplace-list --query 'research assistant'
deepseekbot marketplace-topics
deepseekbot marketplace-detail owner/repo
deepseekbot bot-import-preview --from-git owner/repo
deepseekbot create --from-git owner/repo --name Researcher --operation-key import-research-001 --expected-commit <observed-commit>
deepseekbot bot-import-preview --from-zip ./selected.zip
deepseekbot create --from-zip ./selected.zip --operation-key import-selected-001 --expected-archive <observed-sha256>
# --from-dir ./bundle uses the same archive preview/import contract.
```

After the Human chooses an import, Tob reviews its source, name/tags/bio overrides and preservation of imported personality. Git/GitHub inspection observes the immutable HEAD commit; cloning must still produce that exact commit before a Bot identity is registered (`git-source-changed` otherwise). The existing SSH-to-HTTPS fallback is visible in the inspected source. ZIP/directory preview returns the hash of the actual archive bytes, eligible file paths/sizes, descriptor and history presence, without file bodies. A changed archive returns `stale-import-source`.

ZIP/directory inputs are read by the CLI in its native Shell environment and uploaded privately as bounded binary bytes (100 MiB maximum), never as model-facing base64 JSON or a caller-selected Host directory read. Scoped writes still require the accepted Human DM Source Event and current native ToolExecution; the broker checks authority before buffering and after approval. Do not use unrelated Host paths as a workaround for a missing source file.

Both authenticated Human online imports and scoped Tob imports reuse the existing Registry, Memory and Channel owners and the creation receipt table. Replay the **same key and exact payload** to reconcile the original Bot and DM after an uncertain response. Completed replay does not clone, unpack or overwrite later Memory edits. Different payloads return `creation-key-conflict`; archived/deleted identities cannot be recreated, and a reserved folder without an identity requires repair. Imported `SOUL.md`, `MEMORY.md`, presentation and optional history are preserved; imports create ordinary Bots without privileged Tob identity, credentials or Workspace Grants. No custom proposal is silently written over an imported personality.

These are command contracts. Direct CLI, actual Tob model/approval, Web navigation, restart persistence and macOS Desktop qualification are separate evidence gates.

`create` without an import source in scoped Tob execution makes a blank Bot in managed Memory storage. A name is the only required user choice; Tob supplies a stable `--operation-key` for the operation. Optional `--description`, repeated `--role` tags, `--avatar-file`, `--persona` / `--persona-stdin`, and `--core-memory` / `--core-memory-stdin` reuse the existing creation validation. Only one content option may consume stdin. Initial personality and Memory become `SOUL.md` and `MEMORY.md`; no unrelated Workspace Grants or credentials are copied.

```bash
deepseekbot create --name Translator --operation-key create-translator-001 --persona 'Translate clearly.' --core-memory 'Prefer concise explanations.'
deepseekbot show <bot-id>
deepseekbot update <bot-id> --expected-profile <profileFingerprint> --name Translator --description 'Translation assistant' --role translator
deepseekbot pause <bot-id> --expected-profile <profileFingerprint>
deepseekbot resume <bot-id> --expected-profile <profileFingerprint>
```

The Host reserves one identity in its durable creation receipt before creating the Memory Repository and DM. After a lost response, repeat the **same operation key and same payload**: an existing completed receipt returns that Bot and DM, while a partially completed operation reconciles the reserved identity. A completed scoped retry performs a checked read instead of another creation approval. A changed payload refuses with `creation-key-conflict`; an archived or deleted identity refuses with `creation-identity-unavailable` and is never recreated by replay. `creation-memory-conflict` means the reserved folder exists without its Registry identity: preserve it for repair rather than deleting it or trying a new key. Receipt-backed creation is not a filesystem/database transaction and does not promise automatic repair of that interrupted state.

The authenticated Human online `create` also accepts `--operation-key`. It uses managed Memory without `--preset` or a custom Memory location; apply a model plan or move Memory separately. Selected Git/Zip/directory imports also accept a key with the inspected source fingerprint as described below. Calls without a key keep their existing behavior. Editing another Bot's existing Memory is a separate capability.

Scoped `show` returns `{bot, profileFingerprint}`. Before every `update`, `pause`, `resume`, `bot-avatar-set`, `bot-banner-set`, `bot-appearance-set` or `bot-primary-color-set`, read the target and pass that fingerprint using `--expected-profile`. Presentation commands retain their existing file/recipe/clear/color options. The fingerprint covers the complete Registry record, so a concurrent change to any recorded profile field invalidates the reviewed snapshot. The Host rechecks it after approval and before applying the existing owner operation, then returns the canonical profile and new fingerprint. Re-read after `stale-setting`; do not silently overwrite. Profile metadata updates are limited to name, description and tags, not Workspace Grants, credentials or model configuration. Human online `update` also requires `--expected-profile` from `show` and uses the same Host owner; a stale fingerprint is not silently refreshed. Use `--description ''` to clear the bio and `--role ''` to clear all tags.

```bash
deepseekbot bot-delete-preview <bot-id>
deepseekbot bot-delete-memory-folder <bot-id>
printf '%s' '{"token":"<preview.token>"}' | deepseekbot bot-delete-confirm <bot-id> --confirmation-stdin --confirm
# Only after explicitly reviewing erasure of the owner's displayed Memory folder:
printf '%s' '{"token":"<preview.token>"}' | deepseekbot bot-delete-confirm <bot-id> --confirmation-stdin --confirm --erase-memory
deepseekbot bot-delete-retry <bot-id> --confirm
```

Deletion retains Memory by default. `--erase-memory` selects the exact owner-reviewed Memory directory, only when `preview.eraseAvailable` permits it; caller-selected paths are rejected. `bot-delete-memory-folder` returns the validated `{target:{path,relativePath,kind}}` for inspection, not arbitrary filesystem access. Preview tokens, dependency scope and path ownership checks remain authoritative. Deletion retry continues the already accepted retention/erasure choice; it cannot change that choice. Scoped confirm and retry require a fresh Human decision each time, including under full access, remembered rules or automatic approval. Both Human commands now require `--confirm`, so update existing cleanup scripts. Tob itself cannot be archived or deleted (`protected-bot`), and names, personality text and imports never grant its authority.

See [ADR-0225](adr/0225-bot-creation-receipts-and-reviewed-profile-lifecycle.md) and the [coverage inventory](agents/cli-ui-coverage.md#2089-bot-management-scope). Direct CLI, actual Tob conversation, Web navigation and macOS Desktop are separate verification gates; these command contracts do not imply those runs have passed.

### Tob group creation and invitations

The first [#2090](https://github.com/BotHarness/DeepSeekBot/issues/2090) slice lets Tob create groups and add existing Bots from its accepted Human DM. After the management operation is approved, invited Bots join immediately under the existing default `autoAcceptGroupInvites=true`; no separate invitation decision is needed. It uses the existing Channel owner through the scoped CLI, without a new model Tool. Tob manages other Bots and cannot be an initial member or invitation target.

```bash
deepseekbot channels --limit 25
deepseekbot channel <channel-id>
deepseekbot group-create "Research team" --member <bot-a> --member <bot-b> --operation-key group-research-001
deepseekbot group-create "Planning" --operation-key group-planning-001
deepseekbot group-invite <channel-id> --bot <bot-c> --operation-key invite-research-001 --expected-channel <channelFingerprint>
```

Scoped `channels` returns bounded Channel metadata, not message bodies; use `--limit` from 1 to 100 (default 50) and the returned `nextCursor` with `--cursor`. `channel <group-channel-id>` returns `{channel, channelFingerprint, invitationPolicy:{autoAccept}, wakePolicies}` and refuses a non-group target. The scoped projection keeps at most 100 members, the last 100 invitations and the last 100 join requests, with counts for omitted entries. These reads do not admit Tob as a member or authorize group messages as management instructions.

`group-create` supports an empty group or repeated `--member` values for existing eligible Bots. Explicit initial members join directly, matching the existing Human/UI creation behavior. A later `group-invite` uses the existing invitation owner. With the default `autoAcceptGroupInvites=true`, it records an accepted invitation (`respondedBy: "profile-policy"`) and membership together, without waking the invited Bot for a separate decision. This adds no setting or UI toggle. Only if the Human has already disabled auto-accept does the existing pending-invitation decision flow apply. Tob preserves that choice and reports the returned state.

Scoped creation/invitation writes require a stable `--operation-key` of 8–128 letters, digits, dots, underscores, colons or hyphens, starting with a letter or digit; invitation also requires the `--expected-channel` fingerprint from the preceding read. The reviewed snapshot binds current Channel metadata, membership and invitation policy, plus the target Bot identity. Message arrivals and unread counters do not invalidate that snapshot. Approval and execution recheck the accepted Human DM and current target state. If a relevant setting changes while review is pending, read it again and submit a new proposal rather than refreshing the approved snapshot silently.

The keyed result includes a `receipt` with `operationKey`, `kind`, `channelId`, optional `invitationId` and completion `status`, alongside canonical Channel state and the invitation when applicable. The durable operation receipt reserves the Channel or invitation identity. After an uncertain response, repeat the **same command, key and payload** to reconcile that operation instead of selecting another key. A completed scoped replay reads back the existing result without asking for another mutation approval. Changed payloads, unavailable targets or changed Bot incarnations refuse; replay never recreates a deleted group or duplicates an invitation. Current authority is still required after a Shell or Host restart; the receipt does not preserve the expired Shell capability.

`stale-channel` or `stale-profile` requires a fresh read and review. `operation-key-conflict` means the key is already bound to different input. `channel-operation-unavailable`, `unknown-channel`, `unknown-bot` and `archived-bot` refuse unavailable identities; `protected-bot` refuses Tob as a target. An unavailable invitation returns `group-invite-unavailable`. These failures do not authorize a fallback command or a replacement identity.

Authenticated Human online `group-create` and `group-invite` also support stable operation keys; the invitation command accepts `--expected-channel` for the observed state. These review/retry inputs are optional for Human commands and mandatory for scoped Tob. Existing unkeyed Human operations retain their owner behavior.

The following slices add group rename/avatar, member wake settings, member removal, cancellation of pending invitations and decisions on pending join requests. Personal mute/pin/nickname/visibility is covered by the preferences slice below; group deletion, attachments and external membership remain outside the scoped allowlist. Some already have Human CLI commands above; that does not grant Tob access. #2090 remains open for its remaining scope. See [ADR-0226](adr/0226-group-management-receipts-preserve-channel-authority.md) and the [coverage inventory](agents/cli-ui-coverage.md#2090-group-management-scope). Direct CLI, real Tob approval/readback, Web membership/history and macOS Desktop are separate verification gates.

### Tob group settings and member removal

From its accepted Human DM, Tob can use existing approval to change a group name, avatar or member wake policy for ordinary group messages, or remove a Bot member. It reuses the same Channel owner, authority and durable data, with no new model Tool, database migration or UI. Scoped `channel-rename` accepts groups only; it cannot rename a Bot DM.

```bash
deepseekbot group-wake-policies <channel-id>
deepseekbot channel-rename <channel-id> --name "Product research" --expected-channel <channelFingerprint>
deepseekbot group-avatar-set <channel-id> --avatar-file ./avatar.png --expected-channel <channelFingerprint>
deepseekbot group-avatar-set <channel-id> --clear --expected-channel <channelFingerprint>
deepseekbot group-wake-set <channel-id> --bot <bot-id> --mode digest --count 5 --interval 30 --expected-channel <channelFingerprint>
deepseekbot group-wake-set <channel-id> --bot <bot-id> --inherit --expected-channel <channelFingerprint>
deepseekbot group-member-remove <channel-id> --bot <bot-id> --expected-channel <channelFingerprint>
```

`group-wake-policies` returns the current group snapshot, `channelFingerprint` and each member's `{botSlug, inherited, policy}`. The fingerprint includes effective wake policies, including inherited Bot defaults: changing a default invalidates an older review. Message traffic and unread changes do not invalidate it. Scoped avatar reads/reviews expose presence, type, size and digest instead of image data.

Every write requires the observed `--expected-channel`; read again after each successful edit before preparing another. Names must be nonempty and at most 120 characters. Avatars use the bounded PNG/JPEG/WebP files described above, or `--clear`. Wake modes are `all`, `mentions`, `digest` and `silent`; `--count` is 1–100 and `--interval` is 1–3600 seconds, defaulting to 5/30. `--inherit` removes the group override and restores the Bot default. Member removal preserves the Bot identity, Memory, other Channels and group history. Removing the group owner clears its ownership, leaving Human management. An archived existing member can be removed; changing wake policy requires an active Bot.

Approval binds the previous state, exact target and proposed values. Execution rechecks the Human's current group access and target Bot identity. Denied/expired approval, a Human who has left, a non-group target, a missing membership or a replaced identity refuses without bypassing checks; Tob still cannot join groups. `stale-channel`/`stale-profile` requires a fresh read and review rather than overwriting a concurrent edit.

These edits do not accept `--operation-key` or add replay receipts. After an uncertain result, inspect `channel`/`group-wake-policies` before doing anything else; do not blindly retry. Any remaining change needs a new proposal against the current snapshot. Existing create/invite receipts and default automatic acceptance are unchanged. Authenticated Human online equivalents may supply `--expected-channel`; omission preserves existing behavior without weakening Tob's mandatory inputs. #2090 remains open for its undelivered scope; these contracts do not claim Web, real-model or macOS verification has passed.

### Tob invitation cancellation and join decisions

From its accepted Human DM, Tob can use existing approval to cancel one **pending** group invitation or accept/decline one **pending** join request. First read `channel <channel-id>` for the exact invitation/request ID, status and `channelFingerprint`, then propose the operation:

```bash
deepseekbot channel <channel-id>
deepseekbot group-invite-cancel <channel-id> --invitation <invitation-id> --expected-channel <channelFingerprint>
deepseekbot group-join-decide <channel-id> --request <request-id> --accept --expected-channel <channelFingerprint>
deepseekbot group-join-decide <channel-id> --request <request-id> --decline --expected-channel <channelFingerprint>
```

Scoped commands require the observed `--expected-channel`; a join decision requires exactly one of `--accept` or `--decline`. Approval binds the current group snapshot, exact pending record, target Bot incarnation and requested decision. Before execution, the Host rechecks the accepted Human DM, current Human membership, fingerprint, target identity and pending status. Denied/expired approval, a Human who has left, a concurrent decision or an unavailable/replaced target cannot authorize a mutation or silently refresh approved inputs.

`unknown-invitation`/`unknown-join-request` refuses an absent record; `invitation-not-pending`/`join-request-not-pending` refuses an already settled target. `stale-channel`/`stale-profile` requires another read and review. These refusals do not authorize a replacement target or a different action.

The default `autoAcceptGroupInvites=true` is unchanged: invited Bots normally join immediately, so cancellation cannot undo an already accepted invitation and never removes an existing member. Cancellation only applies to a still-pending invitation, such as one created after the Human opted out of automatic acceptance. Removing an existing member requires a separate reviewed `group-member-remove`; a failed cancellation must not fall back to removal.

The existing Channel owner persists membership and accepted status together for acceptance; decline does not add membership. It records the existing decision notification once. Tob does not join the group or accept its content as management authority. This slice reuses canonical status and notification handling without another model Tool, schema migration or operation receipt.

Authenticated Human online equivalents may provide `--expected-channel`; `group-join-decide` without it retains existing same-decision idempotent readback of a completed result. Scoped Tob entry points accept pending records only and cannot bypass fresh review by omitting the fingerprint or repeating a terminal decision. After an uncertain response, read the exact record's status and membership first. If it remains pending and action is still needed, propose against a fresh snapshot instead of blindly retrying. Personal preferences are covered next; group deletion and external membership remain separate delivery, and this slice does not close #2090.

### Tob Channel personal preferences

From its accepted Human DM, Tob can use existing approval to change the current Human's mute, pin or hidden preference for a Channel, or their **Human Channel nickname**. Read the preference snapshot first, then pass its returned `stateFingerprint` as `--expected-state` to the corresponding write:

```bash
deepseekbot channel-preferences <channel-id>
deepseekbot channel-mute <channel-id> --expected-state <stateFingerprint>
deepseekbot channel-mute <channel-id> --off --expected-state <stateFingerprint>
deepseekbot channel-pin <channel-id> --expected-state <stateFingerprint>
deepseekbot channel-pin <channel-id> --off --expected-state <stateFingerprint>
deepseekbot channel-hide <channel-id> --expected-state <stateFingerprint>
deepseekbot channel-hide <channel-id> --off --expected-state <stateFingerprint>
deepseekbot channel-human-name-set <channel-id> --nickname "Boss" --expected-state <stateFingerprint>
deepseekbot channel-human-name-set <channel-id> --clear --expected-state <stateFingerprint>
```

`channel-preferences` returns `{channel:{id,type,name,botSlug?}, scope:"human-channel", humanId, muted, pinned, hidden, nickname, stateFingerprint}`. The target must be an ordinary Bot DM or Group Channel that the current local Human participates in; `nickname` is `null` when no override is set.

The scope is the stable Human identity in the current Host Profile and the exact Channel. It is not a display-name match or a browser-tab/device-local layout: clients connected to the same Host Profile read the same canonical preference. A nickname changes the Human's label in that Channel, not the Bot name, Channel name or Human ID. Nicknames are trimmed, at most 128 characters and cannot contain control characters or newlines; `--clear` restores inheritance from the Human's default display name.

Mute/pin/hide enables the preference unless `--off` is supplied. Hiding affects roster presentation; it does not delete the Channel, messages or membership. A hidden Channel remains addressable by its exact ID through `channel-preferences` and can be restored with `channel-hide --off`. Single-Channel pin/hide operations preserve other Channels' preferences instead of replacing entire lists. Muting does not stop a Bot or change a group member's wake policy.

The fingerprint binds the target Channel incarnation, local Human identity, its four personal preferences and, for a Bot DM, the Bot incarnation. Editing another Channel does not stale this snapshot or get overwritten by the target edit.

Scoped writes require the observed `--expected-state`. `stale-channel-preferences` requires a fresh read and review. Approval binds previous values, target and proposed values; execution rechecks current Human Channel access and the snapshot. Concurrent edits, revoked access or expired/denied approval cannot be silently overwritten. Successful writes return canonical readback. Read again before another edit; after an uncertain result, inspect current state instead of blindly retrying. Tob continues to use the existing scoped Shell CLI and approval path, without a dedicated Tool.

Mute, pin and hidden state remain owned by `RosterStore`; the Human Channel nickname remains owned by `ChannelStore`. There is no second preference store. Authenticated Human online writes may supply `--expected-state`, while Tob requires it; the existing offline nickname command is not a scoped Tob bypass. These commands cover personal preferences without granting whole-layout, all-settings or group-deletion authority. Direct CLI, real Tob approval/readback, Web and macOS Desktop remain separate verification gates.

### Tob model and runtime management

Use `deepseekbot capabilities` inside Tob's eligible Shell execution to discover its current commands. The following commands reuse existing Host owners; writes still require the accepted Human DM and existing review policy.

```bash
deepseekbot list
deepseekbot model-catalog
deepseekbot model-plan <bot-id>
deepseekbot model-presets
deepseekbot settings

deepseekbot home-model-set --provider <provider-id> --model <model-id> [--orchestrator-effort <effort>] --expected-revision <default-revision>
deepseekbot model-plan-customize <bot-id> --orchestrator-provider <provider-id> --orchestrator-model <model-id> --expected-revision <plan-revision>
deepseekbot model-plan-inherit <bot-id> --expected-revision <plan-revision>
# Full plan JSON: orchestrator, assignmentDefault and assignmentModels.
deepseekbot model-plan-set <bot-id> --plan-stdin --expected-revision <plan-revision> < plan.json
# Assignment-only JSON omits orchestrator; the Bot must already have a plan.
deepseekbot model-plan-assignments-set <bot-id> --plan-stdin --expected-revision <plan-revision> < assignments.json
deepseekbot model-preset-apply <bot-id> --preset <preset-id> --expected-revision <plan-revision> --preset-revision <preset-revision>
```

`model-catalog` returns available models and `default`/`defaultRevision`; model-plan reads return the Bot plan revision. Changing the Host default preserves other Bots' independent overrides. Customize changes the Orchestrator while preserving Assignment choices; inherit returns the Bot to the Host default. The Host validates route availability both while preparing the operation and before execution. An unavailable route refuses with `model-unavailable`, while a changed reviewed revision refuses with `stale-setting`. Legacy plans requiring repair return `legacy-model-repair-required` rather than being silently rewritten. Credential setup remains native and private: use the existing model/credential interface; Tob receives catalog/readiness information, never credential values.

Preset create/read/update/application reuse the existing preset owner. Scoped `model-preset-create --name <name>` and `model-preset-update <preset-id> --name <name> --expected-revision <revision>` require explicit `--orchestrator-provider`, `--orchestrator-model`, `--assignment-provider` and `--assignment-model`; optional effort flags and `--plan-stdin` with `{"assignmentModels":[...]}` use the existing shapes. Scoped updates require the complete intended name and routes even though the Human command supports partial updates. Applying a preset checks both Bot and preset revisions. There is no preset deletion owner or command; this slice does not invent one or claim complete preset CRUD.

`settings` discovers the supported namespaces; `settings botharness-client` returns the supported live runtime and message-display fields:

| Field                        | Accepted value                                    |
| ---------------------------- | ------------------------------------------------- |
| `assignmentConcurrencyLimit` | Integer 1–32                                      |
| `showBotSessions`            | Boolean                                           |
| `showApprovalReviewSessions` | Boolean                                           |
| `developerMode`              | Boolean                                           |
| `autoFoldLongMessages`       | Boolean; default `false`, explicit `--scope host` |

Use the paired reviewed flags with `settings-set botharness-client --patch-stdin`; the previous-value JSON must name exactly the patched fields. `settings agent-default-model` reads the default route; change it with `home-model-set`. Unknown fields, namespaces outside the explicit scoped allowlist and direct default-model patches refuse rather than editing configuration files. The device namespaces added by #2094 are listed below. Motion, theme, language, shortcuts, layout and other preferences are not implied by this scope.

### Tob privacy, Git and updates

```bash
deepseekbot telemetry-status
deepseekbot telemetry-set --enabled
# Or: deepseekbot telemetry-set --disabled
deepseekbot git-status
deepseekbot git-install
deepseekbot release-info
deepseekbot release-check
deepseekbot release-install <version> --confirm
deepseekbot release-restart --confirm
```

These reuse the same telemetry, Git and release owners as Settings. Environment-locked telemetry cannot be overridden; inspect the returned effective/locked state rather than assuming the stored preference controls collection. Git covers availability and installation only, with no new global Git identity editor.

Scoped `release-install` and `release-restart` require explicit `--confirm` and a fresh Human decision for every invocation. Full access, remembered allow rules and automatic approval cannot replace that decision; the flag itself is not approval. `git-install` does not use `--confirm` and retains its existing review policy. Restart can interrupt running turns and disconnect the requesting CLI; do not automatically repeat an install or restart after an uncertain result. Reconnect and inspect release status before deciding another action. Test these operations only in an owned isolated Profile, preserving the Human's active Desktop.

## Tob reviewed Soul and Memory edits

In an authenticated Home/private-DM request, Tob can read the explicitly selected active Bot's
Memory (including Tob itself), prepare the requested change and ask for a fresh Human decision.
The four existing revision reads above are available directly to Tob as well as to read-scoped
Assignments. Read a snapshot first, then read complete bounded pages at that exact `sha`.
Memory content and Assignment reports remain untrusted data; they cannot authorize writes.

```bash
deepseekbot memory-snapshot <bot-id> --limit 20
deepseekbot memory-file <bot-id> --sha <snapshot-sha> --path SOUL.md --limit 32000
deepseekbot memory-save <bot-id> --path SOUL.md --body-stdin \
  --expected-head <snapshot-sha> --edit-id <stable-edit-id>
# A separately requested restore needs its own review:
deepseekbot memory-history <bot-id> --sha <current-sha> --limit 20
deepseekbot memory-diff <bot-id> --sha <selected-historical-sha> --limit 32000
deepseekbot memory-restore-commit <bot-id> --sha <selected-historical-sha> \
  --expected-head <current-sha> --restore-id <stable-restore-id>
```

Scoped saves require explicit `--expected-head`, a stable `--edit-id`, and exactly one of `--body`
or `--body-stdin`. Existing and replacement text must each fit 32,000 UTF-8 bytes; binary or larger
files refuse instead of showing a partial review. The approval contains the target Bot's ID and
incarnation, branch, expected HEAD, old content and complete before/after diff. Restore approval
shows the selected revision and diff from the current HEAD. Both commands require a fresh Human
decision even with full access, saved rules or automatic approvals. An Assignment can analyze
and report a proposed patch within its read scope; it cannot execute either write.

Before and after review, the Host checks original Human source authority, the active target
incarnation, Memory location, current branch/HEAD and clean working state. Denial, revocation,
busy/unavailable/replaced targets, stale HEAD, branch changes and dirty work refuse without a
write. Scoped restore also refuses dirty Memory: preserve unfinished work with its owner and
prepare a fresh review afterwards. The direct Human restore owner retains its existing recovery
checkpoint and dirty-work backup behavior. Tob never force-resets another Bot's repository.

An identical successful save retry must retain the target, path, body, original expected HEAD and
edit ID. While that original commit is still current it returns the same accepted commit as a
checked read, without another mutation or review. Changing those inputs or moving past that
commit refuses with `memory-conflict`; read current state before proposing a new edit. After an
uncertain restore outcome, inspect current files/history before any new proposal; restore is not
an automatic retry. Supported restore creates a new commit on the current branch and preserves
history, rather than rewinding to the selected SHA.

Read canonical files and the resulting Git revision before reporting success. Changes to `SOUL.md`
and `MEMORY.md` reach new Sessions and the next compaction; an already running Session keeps its
frozen prefix. Direct CLI, real Tob, rendered Web and macOS Desktop require separate verification.

A Tob self edit during its own prepared turn additionally requires that turn's exact owning
Orchestrator, clean branch and an already accepted HEAD. A first turn over pending initialization
commits may therefore refuse safely; let the normal turn settle and read the baseline again.
Assignments and another active Orchestrator cannot borrow this internal owner context.

## Tob Assignment Memory reading

For an explicit Human request in Tob's private DM, Tob can use the invocation-scoped CLI to
create a read-only comparison Assignment. Run `deepseekbot capabilities` first. The Assignment
stays owned by Tob and uses one active Tob-owned Workspace Grant; a whole Bot-data directory or
Memory Repository is refused as its working directory.

```bash
deepseekbot assignment-memory-create "Compare the selected Bots' Memory and cite sources" \
  --grant <Tob-workspace-grant-id> --member <bot-a-id> --member <bot-b-id> \
  --operation-key <stable-operation-key>
```

Creation follows existing review policy. Preserve the operation key and exact payload after an
uncertain response; the Host returns the same canonical Assignment. Optional `--key` reserves its
Continuity Key, but creating again against an occupied key refuses. Continue the same Assignment
with the normal Assignment Request/report path. Continuation keeps its original source and
selected targets. Expanding targets needs a new authorized Assignment.

Inside that Assignment, native Shell exposes only the following delegated read commands:

```bash
deepseekbot memory-snapshot <bot-a-id> --limit 20
deepseekbot memory-file <bot-a-id> --sha <snapshot-sha> --path MEMORY.md --offset 0 --limit 16000
deepseekbot memory-history <bot-a-id> --sha <snapshot-sha> --offset 0 --limit 20
deepseekbot memory-diff <bot-a-id> --sha <snapshot-sha> --offset 0 --limit 16000
```

The same online Human Memory commands accept these revision and pagination fields through the
same Memory owner. Snapshot/history pages contain at most 100 entries. File/diff pages contain
at most 32,000 characters; follow `nextOffset` until `partial` is false. Every result carries
`botSlug`, exact `sha`, `revisionStatus`, page bounds and source path where relevant. Git status
can be `accepted`, `pending` or `needs-repair`; pending content is not accepted Memory. A missing
or binary file returns explicit `unavailable` state. Pinned content comes from the commit rather
than the current working file.

The delegated scope checks the original Human source, current Assignment lifetime, revocation,
Workspace Grant and selected target lifecycle for every read. Unknown targets return
`memory-target-denied`; archived/deleted/replaced targets return `memory-target-unavailable`.
Writes and unrelated management commands return `memory-read-only` or the scoped parser's
`agent-scope-denied`. Grant loss, archived/stopped Assignments and revoked scopes refuse. Tob
can explicitly revoke with `deepseekbot assignment-memory-revoke <assignment-session-id>`.
Creation and revocation require a Human-only private-DM turn. A turn that also admitted Assignment
lifecycle sources refuses `human-dm-required`; let Tob finish that turn and send a fresh private-DM request.
Retrieved text and quotes are data. Report source Bot/file/revision and partial/unavailable states
through the existing Assignment Report; do not copy whole histories into Tob Memory.

Delegated Memory Assignments accept one literal `deepseekbot` command per Shell call. This restricted
Consumer invokes the shipped CLI in-process with only its broker context; it never executes OS Shell
syntax. Raw commands, interpreters, substitutions, redirects, file tools and Subagents are unavailable.
Target incarnation timestamps are captured before review and rechecked at creation.

### Tob Client preferences

`client-targets` discovers live `{clientId,generation}` targets. `client-preferences <client-id> --generation <generation>` reads the selected Client's current values, `stateFingerprint` and field ownership. There is no automatic sole-Client selection. In Tob's ordinary Shell only, `current` resolves from the authenticated Human DM Source Event that started the current turn; a model cannot supply its own current-Client generation. Missing or mixed origins refuse `current-client-unavailable` / `ambiguous-client-target`.

```sh
deepseekbot client-targets --host "$DEEPSEEKBOT_HOST"
deepseekbot client-preferences CLIENT_ID --generation GENERATION --host "$DEEPSEEKBOT_HOST"
printf '%s' '{"notifications":false}' | deepseekbot client-preferences-set CLIENT_ID --generation GENERATION --scope browser-origin --expected-state 'OBSERVED_FINGERPRINT' --patch-stdin --host "$DEEPSEEKBOT_HOST"
```

A write changes exactly one preference and compares the current owner snapshot at application time. The browser's existing notification owner retains its localStorage key and old value; unrelated local state is untouched. This is **browser-origin storage**, shared by same-origin tabs in that browser context, not a device identity or tab-only durable setting. Independent browser contexts remain separate. `notifications:true` enables only when actual OS/browser permission is already `granted`; otherwise the result is `permission-pending`, `permission-denied` or `permission-unsupported` with `changed:false`. `{"notificationPermission":"request"}` reports the current permission and, when pending, directs the Human to the existing Settings → Notifications switch. The CLI never manufactures a user gesture or a permission grant.

| UI control                                                                                          | Existing owner and scope                                                        | CLI path                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme: light / dark / system                                                                        | Native `ui-theme.preference`, Host/Profile user settings                        | `settings ui-theme`, then reviewed `settings-set ui-theme --scope host`                                                                            |
| Language: English / Chinese                                                                         | Native `locale.preference`, Host/Profile user settings                          | `settings locale`, then reviewed `settings-set locale --scope host`                                                                                |
| Motion: system / reduce / full                                                                      | `botharness-client.motionPreference`, Host/Profile                              | `settings` / `settings-set botharness-client --scope host`                                                                                         |
| Bot icon: mascot / simple / blob / bot                                                              | `botharness-client.botIcon`, Host/Profile                                       | Same settings path                                                                                                                                 |
| Send key: enter / shift-enter / mod-enter                                                           | `botharness-client.sendKey`, Host/Profile                                       | Same settings path                                                                                                                                 |
| Automatically fold long messages (off by default)                                                   | `botharness-client.autoFoldLongMessages`, Host/Profile                          | Same settings path; reviewed `settings-set botharness-client --scope host`                                                                         |
| Automatically accept Group invitations                                                              | `botharness-client.autoAcceptGroupInvites`, Host/Profile                        | Same settings path                                                                                                                                 |
| Default Human name                                                                                  | Existing Human identity owner, local Human/Profile                              | `human-name`; scoped `human-name-set (--name TEXT                                                                                                  | --clear) --expected-state FINGERPRINT` |
| IM defaults: collection, wake, thresholds, enabled identity, WeChat typing, new-conversation policy | Existing messaging owner, Host/Profile per platform                             | `messaging-defaults PLATFORM`; `messaging-defaults-set PLATFORM --input-stdin` with observed `expectedRevision` and existing complete input schema |
| Desktop notifications                                                                               | Selected Client's existing browser-origin owner; permission belongs to Human/OS | `client-preferences` / `client-preferences-set`                                                                                                    |

Native DSH `0.2.0-rc.2` stores **both theme and locale in the Host user-settings document**, despite their Client UI location. Their writes affect every connected Client and require explicit `--scope host` in Tob. Read the namespace revision and previous field values, explain the shared effect to the Human, then use the existing `--expected-revision`, `--previous-value` and `--patch-stdin` settings review. `client-preferences-set` refuses theme/locale with `host-scope-required`; it never creates a competing local theme/locale override. A Human request for current-Client-only theme/language needs a scope clarification before Tob proposes a shared write. Existing unrelated settings and concurrent UI changes retain native revision protection.

The supplemental inventory still tracks local file-open choices, composer-footer and DM trace presentation as unavailable in this slice. `client-preferences-set` refuses those fields as `unsupported-client-preference`. Native-only notification controls absent from the connected Web Client remain unsupported; a stored preference does not prove OS notification delivery. Layout and shortcut controls are separate slices.

`no-connected-client`, `unknown-client-target`, `client-target-stale` and `client-target-replaced` distinguish absent, unknown, expired and replaced targets. A reload retains the tab id but replaces its generation. Unresponsive undelivered requests refuse `client-unresponsive`; a delivered write without confirmed completion refuses `client-outcome-uncertain`. Read the owner again before deciding what happened; never blindly retry an uncertain mutation. Pending commands are process-local, bounded and never replay after Host restart. The selected Client retains preference persistence through its existing owner.

The notification owner refreshes actual shared storage before reads/comparisons and follows storage events. Where Web Locks are available, both UI and CLI writes use the same owner lock; scoped writes recheck state and Host source authorization inside it. Without Web Locks, scoped mutations refuse client-concurrency-unavailable, while the ordinary UI remains usable. The pinned connection Provider shares one OperatorPeer across authenticated HTTP requests: private mount/tab-owner proofs provide Client incarnation separation, and a Peer id is not a browser identity.

### Selected Client layout

`client-layout CLIENT_ID --generation GENERATION` reads the mounted Bot-mode Workspace owner, its active `channelId`, stable panel IDs and eligibility, global geometry, parked geometry, control order/visibility, gap, per-Channel trees and SHA-256 `stateFingerprint`. It refuses an unavailable narrow-screen owner; it never switches Channels to satisfy an edit. `current` is available only through Tob's authenticated originating Human DM.

Use `client-layout-set CLIENT_ID --generation GENERATION --scope browser-origin --expected-state FINGERPRINT --patch-stdin` with one JSON edit:

| `type`          | Fields                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- |
| `gap`           | `gap`: integer 0–16                                                                          |
| `rail-order`    | `order`: unique stable panel IDs                                                             |
| `rail-location` | `before`: `left`, `right` or a discovered Dockview column group ID                           |
| `control`       | `panel`, `visible`; Channel children require `channelId`                                     |
| `visibility`    | `panel`, `open`; Channel children require `channelId`                                        |
| `move`          | `panel`, `target`, `direction`: left/right/above/below; Channel children require `channelId` |
| `size`          | Global `panel`, `width`, `height`: fractions 0.05–1                                          |
| `child-resize`  | `channelId`, binary split `path` (root is empty), `ratio`: 0.2–0.8                           |
| `child-axis`    | `channelId`, `path`, `axis`: horizontal/vertical                                             |

Channel moves target a sibling leaf (`messages` is the fixed content leaf). Hidden children retain their tree and saved percentages. Global moves require visible separate panel groups; unsupported grouped topology, hidden targets and ineligible Bot-only children return coded refusals. The selected Channel must still match when applying the edit. Existing layout v1–v8 migration and backup storage remain authoritative. Unreadable/newer layout storage refuses recovery-required; a save failure reports `client-outcome-uncertain`, requiring a fresh read before another write. Same-origin tabs share persistence; runtime identity selects the live owner that applies the edit. Native restart, physical geometry and UI evidence require separate qualification.

A layout owner whose same-origin storage was replaced by another tab refuses `stale-client-layout` and stops saving until reload, preserving the other tab's accepted state.

### Selected Client shortcuts

`client-shortcuts CLIENT_ID --generation GENERATION` discovers stable customizable panel IDs, the seven `botharness.navigation.*` action IDs, current effective bindings, fixed commands, native configuration revision and exact `web|desktop:macos|windows|linux` profile. Alt+1…0 Channel selection remains fixed and is never renumbered from rail order.

Use `client-shortcuts-set CLIENT_ID --generation GENERATION --scope client-profile --expected-state FINGERPRINT --patch-stdin` with `{ "profile":"web:macos", "id":"DISCOVERED_ID", "type":"set", "binding":{"code":"KeyJ","modifiers":["primary","alt","shift"]} }`. Use `"type":"disable"` or `"type":"reset"` without `binding` to unbind explicitly or restore that action alone. Native panel combinations support the existing optional `secondCode`; navigation actions retain their existing single-key and primary/Alt/Shift rules.

The selected profile must match. Native panel edits pass the observed native revision to the same owner used by Settings and tooltip/key dispatch. Navigation edits reuse the existing owner and key, migrating legacy overrides into preserved profile records; explicit null disables survive reload. A reserved/conflicting edit returns `outcome:refused`, `reason`, conflicting stable IDs and the unchanged effective catalog. It never steals another binding or resets all profiles. Storage failures preserve accepted navigation bindings and report a refusal; native revision/conflict refusals remain classified by the native owner. Authorization, Client lifetime and reviewed state are rechecked before native dispatch. The native owner serializes edits and compares the revision again before writing. Once dispatched, the native save cannot be cancelled: a lost reply, expired Client lifetime or write failure returns `client-outcome-uncertain`. Rediscover the live Client and read `client-shortcuts` before proposing another change; never automatically replay the write. Physical key delivery, editable/modal/IME handling, Web reload and macOS restart require separate runtime qualification.

### Tob grants, approval and connector policies

Inside an eligible Tob Human-DM Shell, existing policy commands return `{value, stateFingerprint, result?}`. Read the matching owner first, then pass that fingerprint as `--expected-state` to a write. Every policy write requires a new Human decision, including narrowing access; Full access, remembered rules and the automatic reviewer cannot approve these operations. The approval shows the exact target, previous state and requested change. The Host checks the accepted source and policy again at execution, and returns the canonical owner state after the write. A stale fingerprint produces `stale-policy`; read again before proposing another change. Never blindly repeat `policy-outcome-uncertain` or `agent-write-uncertain`.

| Read first                                                                                      | Existing writes available to Tob                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grants <bot>`                                                                                  | `grant-create --workspace <id>`; `grant-write-set --grant <id>` with `--enabled` or `--disabled`; `grant-revoke --grant <id> --confirm`                                                                                 |
| `access <bot>`                                                                                  | `access-set --mode` with `workspace-write` or `danger-full-access`; optional `--scope chat` or `--scope assignments` and `--acknowledge-risk`; `browser-access-set`, `computer-access-set`                              |
| `approval-templates`                                                                            | `approval-template-set <bot> <name>` or `off`; template create/edit with `--text-stdin`, copy with `--from`, delete with `--confirm`                                                                                    |
| `tool-approval-rules <bot>`                                                                     | `tool-approval-rule-revoke <bot> --rule <id> --confirm`                                                                                                                                                                 |
| `approval-reviewer-model`                                                                       | `approval-reviewer-model-set <provider/model>` or `bot`; optional `--effort <effort>`                                                                                                                                   |
| `messaging-defaults <platform>`                                                                 | `messaging-defaults-set <platform> --input-stdin`                                                                                                                                                                       |
| `messaging-grants <bot>`, `pairing-list <bot>`, `approval-routes <bot>`, `failure-alerts <bot>` | Existing pairing decisions, authorization/revocation, receiving, Channel targets, group/thread reception and wake policy, conversation/sender policy, proactive post limits, approval routes and failure-alert settings |
| `channel-bridges <channel>`                                                                     | `channel-bridge <channel> --input-stdin [--confirm]`                                                                                                                                                                    |

`workspace-options`, `approval-template-show`, `messaging-targets` and `im-apps` remain read-only discovery. `capabilities` lists exact command options. Policy reads return existing qualified Provider availability; a missing Provider never becomes a successful local simulation. `access` includes Browser/Computer capability toggles; changing them does not start a Browser/Computer, pair the Human's browser, or grant OS permissions. The existing access owner keeps `workspace-write` at its current effective scope.

Native Browser/Computer UI fields also reuse `settings` and `settings-set --patch-stdin --expected-revision <n> --previous-value <json>` with mandatory Human review. `botharness-browser` admits `target`, `localDriver`, `containerDriver`; `botharness-computer` admits `target`, `idleStopMinutes` (1–1440), `exportDir` (empty/default or an absolute path), `autoAllowActions`. Only those fields are exposed. Device availability, runtime readiness and OS permission remain separate observations.

Private app tokens, credentials and verification codes stay in the existing authenticated Human CLI stdin/private-input flows (`im-app-add`, `im-credentials`, `im-verify`) and the native setup UI. Tob can inspect `im-apps` and existing app/setup availability, but cannot submit secrets through this broker or invent a Provider setup contract. External message/test/retry commands and `tool-approval-decide` are outside this policy allowlist; listing another Bot's approvals gives no authority to answer them.

For an available qualified Feishu/WeChat Provider, Tob may run `im-authorize <platform> --expected-state <im-apps stateFingerprint>` after a fresh Human decision. It receives only an owned opaque receipt, platform, state and expiry. `pairing-status <receipt-id>` refreshes that same Provider attempt; `im-cancel <receipt-id> --expected-state <status stateFingerprint>` reviews and rechecks its current state before cancellation. Unknown receipts, changed owner/platform, expiry or stale review refuse; cancelling a ready attempt never deletes its native account. Start is never retried automatically after uncertainty, and an existing pending attempt for that platform must be continued or cancelled first.

In **Bot settings → Applications**, choose **Continue setup** on the matching platform/expiry row, select the Bot, and continue in the existing setup form. The Human-only owner lookup and Client adoption poll the exact native attempt; they never call `setup.start` again. QR, credentials and verification remain inside that authenticated private form. Tob receives no native attempt id, QR, token, Provider instruction text or error payload. The authenticated Human CLI paths `im-setup-receipts` and `im-setup-resume <receipt-id>` inspect this same owner/handoff without emitting private setup artifacts; neither is admitted by the Tob broker. References are process-local and expire with the Provider attempt or Host restart, while the Provider remains the sole authority for provisioning and native credentials.

The authenticated Human CLI also covers the remaining Browser control routes: `browser-profile-pair` / `browser-profile-forget` (no Bot argument), and `browser-daily-connect`, `browser-daily-grant`, `browser-daily-return`, `browser-borrow-pair`, `browser-borrow-return` (one Bot argument). Each requires `--confirm`; they reuse existing pairing/control owners and leave required Human browser and OS consent intact. These pairing commands are outside scoped Tob policy authority. Direct CLI, real Tob review/refusal/readback, rendered Web, macOS Desktop and actual external delivery are distinct verification gates.

## Paired devices

`deepseekbot devices` lists the Host, current route diagnostics and paired devices without credentials. Each device includes an `identity` fingerprint covering its stable id, name, pairing time and revocation state. `device-routes` reads the same route owner without changing Tailscale or publishing a tunnel; `ready: false`, `serve-missing`, `serve-other-target` and stopped/missing Tailscale remain explicit diagnostics.

```sh
deepseekbot devices
deepseekbot device-routes
deepseekbot device-offer --out /private/local-folder/new-pairing.json
deepseekbot device-offer-status <receipt-id>
deepseekbot device-revoke <device-id> --expected-device <identity-from-devices> --confirm
```

The direct offer command exclusively creates a new mode-0600 local file containing the pairing link and expiry; choose a protected local folder and never paste the file into a chat or Session. Ordinary JSON contains only a receipt, expiry, reachability and handoff status. Existing files are never overwritten. This file contains a one-time five-minute offer, never an operator token or a device credential. Native Windows private-file ACL qualification remains separate; use the Human Devices UI there.

In Tob’s authenticated private DM, ordinary Shell supports these same commands through the existing scoped broker. `device-offer` takes no `--out`: after review it returns a safe receipt and asks the Human to open Settings → Devices → Pair a phone. The Human dialog reuses the latest still-pending offer, so the link stays in the Human UI. Offer creation and revocation use existing approval policy and revalidate the Human source. Local file output, Host credentials and authority overrides are refused in scoped CLI. This is capability coverage, not blanket permission.

Offer receipts report `pending`, `redeemed` (with device id), `expired` or `unknown`. Offers and bounded receipt history are process-local: restart, capacity eviction or a receipt outside the retained window yields `unknown`; do not infer successful pairing. Reconcile using `devices` before retrying. Devices stay in the existing durable device owner across Host restarts.

Revocation requires the reviewed fingerprint and explicit confirmation. The Host rechecks identity immediately before revocation; a changed identity returns `stale-device`, an absent device returns `device-unknown`, and an already revoked matching identity returns `alreadyRevoked`. Revocation closes open device streams and denies later requests through the same listener’s device gateway. Direct CLI uses the existing authenticated management routes; Tob uses the same owner behind its source and review checks. An authorized protocol test client proves gateway behavior; it does not qualify a physical phone, camera, Keychain or native network transport.

## Profile backup and recovery

Online commands use the authenticated live Host and the same backup owner as Bot-mode Settings. They never restore over a running Host. Archive content and the single-use export token never appear on stdout. Human CLI file paths must be absolute; outputs are new private files (0600 on POSIX), and the preview plan input must be a regular private file. Review the reported scope before exporting; a changed Profile or expired five-minute plan refuses `preview-stale`. Failed exports remove their partial output. Keep review plans and archives private.

```sh
deepseekbot profile-backup-preview --out /private/path/review.json
deepseekbot profile-backup-export --file /private/path/review.json --out /private/path/environment.botharness-backup --confirm
deepseekbot profile-backup-inspect --file /private/path/environment.botharness-backup
deepseekbot profile-recovery
deepseekbot profile-recovery-authorize <bot-slug> --confirm
deepseekbot profile-recovery-activate <bot-slug> --confirm --acknowledge-split-brain
```

`profile-backup-inspect` uploads the protected archive to the selected Host and returns only bounded counts, Session support, bytes and integrity metadata. The existing `botharness-profile inspect --file <archive>` is an offline local inspection. `botharness-profile restore --file <archive> --new-home <new-directory>` remains the only restore entry: it requires a new directory, keeps the destination stopped and cold, and never restarts or changes the active Desktop. Launch the new data space with the trusted pinned DSH 0.2.0-rc.2 and this BotHarness candidate, then run recovery commands against that Host. v1 archives produced by rc.1 remain readable. Native Session history remains unsupported; target-local credentials are not restored, and imported external and management authority is invalidated before the destination is published.

Restored Bots require an explicit target-local Model Plan and credentials, per-Bot authorization and split-brain acknowledgement. Inspect readiness before authorizing or activating one Bot. Plan changes invalidate authorization. Browser/Computer access, external bindings, Workspace and other imported authority remain suspended and require their own existing authorization paths.

In Tob's authenticated Home/private-DM Shell, discover capabilities first. `profile-backup-preview` returns a safe `planId` while the bearer-like export token stays inside the Host. `profile-backup-export --plan <planId> --confirm` requires fresh Human review and writes only a protected Host archive; its receipt returns `receiptId`, file location, bytes and hash. The receipt ID equals the already-known `planId`: after a lost reply, inspect that ID or repeat the exact plan command to read the completed result without exporting again, including after a Host restart. `profile-backup-inspect --receipt <receiptId>` returns bounded metadata. Tob cannot supply `--host`, `--token-file`, arbitrary input/output paths or archive content. Model authorization and activation also require Human review, current readiness and explicit flags. Scoped requests bind the reviewed Model Plan revision and recovery fingerprint through the HTTP boundary to the owner commit; a later plan or recovery state returns `plan-changed`. The owner rechecks current scoped authority immediately before committing. Human online commands can also pass `--expected-revision <planRevision> --expected-state <stateFingerprint>` from `profile-recovery` for the same compare-and-set behavior. An uncertain write is reconciled through receipt/current readiness, never automatically retried. Protected exports are manual artifacts, without an automatic retention catalog; remove them through trusted local file management after use. The Host bounds this export folder to eight files and 512 MiB total.

Backup CLI output first goes to an exclusive `0600` sibling `.part` file. The final path appears only after the complete download's hash matches the Host receipt and a no-overwrite atomic publication succeeds. A pre-existing or concurrently created destination is preserved. A process killed during download may leave only a private staging file for trusted manual cleanup; it does not leave a partial archive under the requested final name. Refusals such as `preview-stale`, `too-large`, `package-invalid` and `plan-changed` remain coded through scoped Tob execution.

A restored database retains content and history while invalidating target-local capabilities: copied devices are revoked and their credential hashes replaced, device Host identity is reset, push destinations and remembered secret-MCP execution approvals are discarded, and the imported protected Tob role is removed. The imported steward's persona/Memory remains an ordinary paused Bot; Home prepares a fresh target-local protected Tob. Pair devices and authorize secret execution again on the target. Workspace Grants, tool approval rules, broad Assignment access, messaging bindings/grants/pairings, schedules and pending execution retain their existing cold-restore refusal or suspension. Creation/group operation receipts remain coordination history, never authority to reuse an old accepted Source Event or revive an expired Shell capability. The original Profile is unchanged by restoring into the new directory.

The export review binds the complete Profile scope and current authority. The archive captures the consistent state at execution, including its own approval audit. Tob's exact native execution review may add its own progress/review records without invalidating the plan; unrelated Source content, Memory, profile or permission changes still refuse `preview-stale`. Internal scope fingerprints and captured Source/call identity are Host-only and never appear in CLI output.

## Tob Group deletion and attachment upload

`deepseekbot group-delete <channel-id> --confirm [--expected-channel <fingerprint>]` ends a Group for every member, cancels pending invitations and requests, and retains history and Bots. Tob requires the observed fingerprint from `channel`, current Human Group access, explicit confirmation and Host approval. Changes during review refuse with `stale-channel`; after an uncertain outcome inspect current state instead of blindly repeating deletion.

`deepseekbot attachment-upload --file <canonical-regular-file> [--upload-id <UUID-v4>]` uploads up to 25 MiB through the existing authenticated attachment owner and prints metadata plus SHA-256. It does not send a message. Files with symlink components, nonregular files and changing/oversized inputs refuse before transfer. Human CLI may omit the ID to generate one; retain the returned ID for retry. Tob must supply a stable UUID-v4 and uses scoped approval showing only name, size and digest. The Host receives bytes, never a caller-selected Host file path. Reusing the ID with changed bytes/name refuses; a retained matching upload returns the same file identity. Original-file edits and external sending keep their existing separate authority.

## Tob selected content and progress reads

`channel-content <channel-id>` and `bot-progress <bot-id>` are bounded, read-only queries of one explicitly selected target. The direct Human CLI uses `--host <local-login-url>` or the existing Host environment; Tob uses the same commands through its temporary native Shell broker after a current trusted Human request in its private DM. No Human token is given to Tob.

```bash
deepseekbot channel-content dm-alpha --limit 10
deepseekbot bot-progress alpha --limit 10
deepseekbot channel-content dm-alpha --expected-target <targetFingerprint> --cursor <nextCursor> --limit 10
```

A page contains `targetFingerprint`, `revision`, `observedAt`, `readOnly: true`, `contentRole: "data"`, `entries`, `hasMore` and `nextCursor`. Page size is 1–20, default 10; traversal stops at 1,000 entries and explicitly reports that limit. Bodies, purposes and semantic reports are truncated to 1,000 characters per field, with original character counts. Each response is capped at eight KiB; pages may contain fewer than the requested number of entries. For a truncated message preview, add `--message <message-id>` and carry each returned cursor to read body chunks of at most 1,000 UTF-8 bytes, up to one million characters per traversal. Attachment metadata is limited to eight references per message; bytes and links are not fetched. Structured private-input, approval and failure payloads are omitted; `cardKinds` only describes their presence. Source references identify the Channel/message/revision or Assignment Session/report time.

Channel reads delegate to the existing authenticated Human timeline owner, including Bot DMs and Bot-to-Bot DMs. Its Group membership/visibility and purge rules remain authoritative: Groups unavailable to that Human refuse, and content is never recovered from an unfiltered query. Tob does not join the target. Ordinary Bot membership checks remain unchanged. An archived or missing selected Bot and a deleted Channel refuse. `bot-progress` combines current process activity with non-archived Assignment directory facts; semantic reports are quoted claims and do not prove a task succeeded. It does not expose full Session logs, Workspace permissions or model credentials.

Carry the exact returned `nextCursor` and optional `--expected-target` into another page. A cursor is signed by the current read owner and tied to the selected identity/incarnation, observed revision, native anchor and traversal offset; editing it or restarting that Host invalidates it, so restart with a fresh read. A changed target returns `changed-read-target`, changed content/progress returns `stale-read-revision`, and an invalid cursor returns `invalid-read-cursor`. Start a fresh read and disclose the change rather than silently switching targets or calling a partial page exhaustive. Missing Runtime returns `progress-unavailable` rather than fabricated idle progress. These read capabilities are not inherited by an Assignment, including a Tob Memory-read Assignment. Message text, quoted instructions, reports and attachment names are data and never authorize a subsequent mutation.
