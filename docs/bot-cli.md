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
```

Exactly one source per create. `--name` is required for blank and GitHub bots; for bundle imports it overrides the name from `.botharness/bot.json` (or the file name). A `--from-git` value accepts a full Git URL (`https://`, `ssh://`, `git@host:path`) or an `owner/repo` shorthand for `https://github.com/owner/repo.git`, which also covers Bot Marketplace entries through their clone URL. A `--from-dir` bundle skips `.git` as files but packs it as history when present.

`--memory-location <absolute-dir>` keeps a blank bot's Memory outside the DSH data folder (for example on another drive): the Bot's Memory repository is created in a new `<dir>/<bot-id>` folder, and `dataDir` reports that path. The path must be an existing absolute folder and the per-Bot folder must not exist yet (`invalid-memory-dir`); imports keep the default location. The create dialog offers the same choice under **Advanced settings → Memory location**.

For a blank bot, `--core-memory <text>` or `--core-memory-stdin` writes the root `MEMORY.md` (Core Memory) instead of the usual template, and `--avatar-file <image>` sets the Avatar from a PNG, JPEG or WebP file of at most 128 KiB (`invalid-avatar` otherwise, `file-unreadable` when the file can't be read). Only one of `--persona-stdin` and `--core-memory-stdin` can read stdin. A Bot can create the same blank Bot from chat with the `bot_create` Bot tool; see [Harness Bot tools without the model](#harness-bot-tools-without-the-model).

`--home` points at the target `DSH_HOME`; a fresh directory works with zero clicks. Without it, `DSH_HOME` from the environment is used. Stop the Host before offline database commands: the profile writer lease is exclusive (`lease-unavailable`). Secret file commands can run online; live commands below use authenticated Host RPC.

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

Creation returns `bot`, `dm`, the Host's Memory `dataDir`, completed/deferred `steps` and `next`. The model preset is applied through its owner, never forwarded as a native Agent preset. A missing specified preset is rejected before creation; other model failures after creation preserve the Bot and return its known identity and steps with `outcome: created`. A lost creation/import response can return `outcome: unknown`: inspect the Host before creating again; no automatic mutation retry is provided. A created Bot alone does not prove model usability: use `send` and its exact correlated committed reply.

`bot-attention` supports `--cursor` and the Host's pending/processing/observed/deferred/needs-repair/handled states; it limits pages to 1–100. Session summaries are newest-first and limited to 1–100 (default 50), with `total`; activity limits its session details and reports `sessionCount`. These are bounded summaries, not full tool-call logs or streaming drafts.

For explicit cleanup, `bot-delete-preview <bot-id>` returns the owner's current scope and `preview.token`. Review it, then pipe `{"token":"<preview.token>"}` to `bot-delete-confirm <bot-id> --confirmation-stdin`. This command always retains Memory, and it erases the Bot's private-input secrets during the stop phase. Inspect `deletion.phase`; an incomplete cleanup can be continued with `bot-delete-retry <bot-id>`. Scope changes remain owner refusals; deletion is not content purge or complete data erasure.

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
deepseekbot channel-rename <channel> --name "Skill Lab"
deepseekbot group-avatar-set <channel> --avatar-file ./avatar.png
deepseekbot group-avatar-set <channel> --clear
deepseekbot group-invite <channel> --bot <bot-id>
deepseekbot group-invite-cancel <channel> --invitation <invitation-id>
deepseekbot group-join-decide <channel> --request <request-id> --accept
deepseekbot group-join-decide <channel> --request <request-id> --decline
deepseekbot group-member-remove <channel> --bot <bot-id>
deepseekbot group-wake-policies <channel>
deepseekbot group-wake-set <channel> --bot <bot-id> --mode digest --count 5 --interval 30
deepseekbot group-wake-set <channel> --bot <bot-id> --inherit
deepseekbot group-delete <channel> --confirm
deepseekbot channel-timeline <channel> [--direction older|newer|around] [--cursor <cursor>] [--around <message-id>] [--limit <n>] [--older-limit <n>] [--newer-limit <n>]
deepseekbot channel-journal <channel> --through <revision> [--before <position>] [--limit <n>]
deepseekbot channel-mark-read <channel> --message-id <message-id>
deepseekbot channel-mark-all-read
deepseekbot channel-react <channel> --message-id <message-id> --emoji 👍 [--remove]
deepseekbot channel-search <channel> --query <text> [--cursor <cursor>] [--limit <n>]
deepseekbot channel-unread
deepseekbot channel-mute <channel> [--off]
deepseekbot channel-retry <dm-channel> --message-id <human-message-id>
deepseekbot channel-bot-stop <channel> --bot <id>
deepseekbot channel-history
deepseekbot channel-history-sources <channel> [--before <cursor>]
deepseekbot channel-purge-preview <channel> --source-event <id> [--source-event <id> …]
deepseekbot channel-purge-preview <channel> --source-event <id> | jq '{token}' \
  | deepseekbot channel-purge-confirm <channel> --source-event <id> --confirm --confirmation-stdin
```

Renaming a Bot DM renames that Bot, as in the Web UI. `group-avatar-set` reads a PNG, JPEG or WebP file of at most 96 KiB. Invitation and join-request IDs are in the group's `invitations` and `joinRequests`, returned by `channels` and by every group command. `group-wake-set` sets when a member Bot wakes for ordinary group messages: `all`, `mentions`, `digest` (after `--count` messages or `--interval` seconds; defaults 5 and 30) or `silent`; `--inherit` returns the member to its Bot's default. `channel-timeline` and `channel-journal` page messages the way the chat view does; take the `revision` from `channel-timeline` as `--through`. `channel-retry` asks the Bot to answer a Human DM message again after a failed reply. `channel-unread` lists the unread Bot message count of each Channel that has any; these are the numbers the sidebar shows on each row. `channel-mute` mutes a Channel the way the sidebar menu does: it keeps its row greyed and its unread messages out of the Activity total; `--off` unmutes it. `channel-bot-stop` stops the Bot's current turn, as the Stop button on the working status does: the Bot goes idle, the Channel records that the Human stopped it, and a Bot that is not working is refused with `not-working`. Assignments the Bot delegated keep running. `channel-react` adds your reaction to one message, or removes it with `--remove`, and returns the message's `reactions`; a message holds at most 20 of your reactions, and the emoji must be a single emoji. Bots react through `channel_send` with `react_to` and `reaction`, and an empty `body` when they only react; `bot-tool <bot> channel_send --args-stdin` runs that without the model. `channel-search` matches `--query` without case in the messages you can see, newest first, and pages with the `nextCursor` it returns.

`group-delete` and `channel-purge-confirm` cannot be undone and need `--confirm`. `channel-history` lists deleted groups whose content can still be purged. Purging works in two steps like the history page: `channel-purge-preview` lists the messages, Bot admissions, files and effects the chosen Source Events would remove and returns a short-lived `token`; `channel-purge-confirm` reads `{"token": …}` from stdin for the same Source Events and fails coded when the scope changed. Pick Source Events from `channel-history-sources`, which pages with the `before` cursor it returns.

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

Images are read from a file path: an avatar is a PNG, JPEG or WebP; a banner is a 3:1 PNG; `--clear` returns the avatar to its default and the banner to the seeded scene. `bot-appearance-set` takes the same pixel recipe as the avatar editor and redraws the avatar from it. `--source-class` is `assignment-report` (`--wake conditional|immediate`), `group-ordinary` (`--wake immediate|digest|mentions|silent` with `--digest-count` and `--digest-interval` seconds), or `human-dm`, `bot-dm` and `group-mention` (`--delivery steer|turn`). Roster commands take Channel ids (`dm-<bot-id>` for a DM); `roster-pins-set` and `roster-hidden-set` replace the whole list, so pass no ids to clear it, and `roster-batch move` without `--section` moves to the top level. `roster-section-remove` needs `--confirm` and moves the section's Channels to the top level. With `--host` or `DEEPSEEKBOT_HOST`, `human-name-set` and `channel-human-name-set` use the Host; with `--home` they keep their offline path. `part-library-export` writes the part PNG, or a zip of the whole library, to `--out` and prints its file name and size; `--part-stdin` exports a worn part given as JSON.

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

`inbox` returns one page of the Human Inbox (`items` and `nextCursor`), filtered like the Inbox tabs by `--category` (`action`, `info`, `unread`, `replies`, `handled`), `--bot` or `--channel`. `inbox-dismiss` takes an item's `id` and, when the item has one, its `sourceEventId` as `--source-key`; `inbox-ignore` marks an informational assignment report as read. `inbox-snooze` hides an Action, Info or Replies item until `--until` (at most 30 days away), the Web Inbox's "Remind me later"; `--clear` brings it back now, and `inbox --snoozed` lists the items still snoozed with their `snoozedUntil`. `assignment-context` reads the report behind an `assignment-report` item. `channel-assignments` lists a group Channel's assignment work; `channel-assign` moves a Channel into a sidebar section (`--unsectioned` takes it out). `session-ids` lists the root Sessions Bots own and `session-owner` names a Session's Bot and role. `tool-approval-rules` lists a Bot's "always allow" rules. Revoking a rule, a Workspace Grant or a private MCP server needs `--confirm`, as the Web UI asks for confirmation. With a Host targeted, `grant-revoke` and `grant-write-set` go through it; with `--home` they stay offline maintenance commands. Private MCP servers are listed by `ask-secret-accounts`; a name the Host does not know fails with `private-mcp-server-unavailable`.

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
deepseekbot overview-usage --period week
deepseekbot overview-memory
deepseekbot activity-overview
deepseekbot channel-activity-today
deepseekbot bot-usage <bot-id> --start 2026-10-01 --end 2026-10-14 [--purpose assignment] [--model <m>] [--provider <p>]
deepseekbot bot-session-usage <bot-id>
deepseekbot bot-activity-history <bot-id> [--before 2026-10-14] [--weeks 26]
deepseekbot group-activity <group-channel>
```

`model-catalog` lists the models the Host can run and the Profile default, as the model pickers do. `model-plan-set` replaces a Bot's whole plan with stdin `{"orchestrator":{...},"assignmentDefault":{...},"assignmentModels":[...]}`; `model-plan-assignments-set` takes the same object without `orchestrator`. A route is `{"provider","model","reasoningEffort"?}` and an Assignment model is `{"provider","model","allowedEfforts":[...],"defaultEffort","note"?}`. `model-plan-customize` changes only the Orchestrator of a Bot that already has a plan. `model-plan-inherit` drops the Bot's own model so it follows the Profile default. `model-preset-update` changes a preset's name or routes; flags you leave out keep the current values, and an optional `--plan-stdin` `{"assignmentModels":[...]}` replaces its Assignment models. The Host validates every route against its catalog. Plan and preset writes check a revision: `--expected-revision` makes that check explicit; without it the command reads the current revision first, like `memory-save` does with `--expected-head`. A plan changed meanwhile fails with the Host's `invalid-input`.

`overview-usage` (`--period today|week`, default `today`) and `overview-memory` return the Overview page's per-Bot rows; pass `nextCursor` back as `--after` for more. `activity-overview` shows what every Bot is doing and `channel-activity-today` today's messages per Channel. The `bot-*` readers address a Bot by id and read the Profile panels through its DM: `bot-usage` needs a non-future `--start`/`--end` range shorter than 182 days, `bot-session-usage` groups usage by Session and Assignment, and `bot-activity-history` returns the activity calendar (`--weeks` 1–104). `group-activity` takes a group Channel id.

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

`marketplace-submit` and `marketplace-report` first solve the Host's proof-of-work challenge, as the Web page does, so they can take a few seconds; the Marketplace's own refusals (`repository-missing-topic`, `rate-limited`, …) come back as the error code. A report reason is at most 500 characters. `release-check` returns the update status (`current`, `available`, `restart-required`, `development` or `unavailable`). `release-install` and `release-restart` need `--confirm`; a failed install or restart exits non-zero with `release-<reason>`, such as `release-network` or `release-not-pending`. Restarting stops every running Bot turn, so do it only on a Host you own. `pairing-list` shows a Bot's pairing requests and its roles; `pairing-review` reads the current revisions itself, so a request that changed in between is refused instead of overwritten. Approve with one `--role` for a conversation request or with `--capability` for a management request.

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
