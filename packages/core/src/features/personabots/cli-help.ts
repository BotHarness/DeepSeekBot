export const BOT_CREATE_HELP = `tobs: manage your Bots

Usage:
  tobs ssh-tunnel <alias> --pairing-file <private-file> --out <new-private-file>
    --local-port <port> --remote-port <port> [--ssh-config <absolute-file>]
  tobs create --name <name> [--persona <text> | --persona-stdin]
                    [--core-memory <text> | --core-memory-stdin]
                    [--description <text>] [--role <tag> ...] [--avatar-file <image>]
                    [--preset <model-preset-id>] [--memory-location <absolute-dir>]
                    [--home <dsh-home>] [--operation-key <stable-key> (online blank creation)]
  tobs create --name <name> --from-git <url | owner/repo> [...]
  tobs create [--name <name>] --from-zip <file> [...]
  tobs create [--name <name>] --from-dir <directory> [...]
  tobs bot-import-preview --from-git <url | owner/repo> --host <url>
  tobs create-status --name <name> --operation-key <stable-key> [same blank or pinned Git input] --host <url>
  tobs list [--home <dsh-home>]
  tobs bot-zip-upload --from-zip <file> --upload-key <key> --host <url>
  tobs bot-zip-preview --upload-key <key> --archive-sha256 <hash> --archive-size <bytes> --host <url>
  tobs bot-zip-import --upload-key <key> --archive-sha256 <hash> --archive-size <bytes> --operation-key <key> --name <name> --host <url>
  tobs bot-zip-import-status --archive-sha256 <hash> --operation-key <key> --name <name> --host <url>
  tobs show <id> [--home <dsh-home>]
  tobs model-presets [--home <dsh-home>] [--include-usage (online)]
  tobs model-preset-delete <preset-id> --expected-revision <n> --confirm
  tobs model-preset-create --name <preset> --orchestrator-provider <p> --orchestrator-model <m>
                                  [--orchestrator-effort <e>] --assignment-provider <p>
                                  --assignment-model <m> [--assignment-effort <e>] [--home <dsh-home>]
                                  [--assignment-models open|listed] [--plan-stdin (online Host only)]
                                  [--orchestrator-group <id> instead of the Orchestrator route]
                                  [--assignment-groups <id,id> [--assignment-default-group <id>]]
                                  [--orchestrator-engine codex|claude] [--assignment-engine codex|claude]
                                  [--<role>-engine-model <id>] [--<role>-engine-effort <level>]
  tobs model-preset-apply <id> --preset <preset-id> [--expected-revision <n>] [--preset-revision <n>] [--home <dsh-home>]
  tobs model-plan <id> [--home <dsh-home>]
  tobs engine list|status --host <url>
  tobs engine tools <id> [--query memory] --host <url>
  tobs engine tool <id> memory_read --args-stdin --host <url>
  tobs engine accounts --host <url>
  tobs engine account-add codex|claude --name <name> --expected-revision <r> --host <url>
  tobs engine account-rename <account-id> --name <name> --expected-revision <r> --host <url>
  tobs engine account-remove <account-id> --expected-revision <r> --confirm --host <url>
  tobs engine login <account-id>|codex|claude [--account <id>] --host <url>
  tobs engine login claude [--account <id>] --code-stdin --host <url> < <code-file>
  tobs engine models <account-id>|codex|claude --host <url>
  tobs engine use <id> codex|claude|none --role orchestrator|assignment [--account <id>] [--model <id>] [--effort <level>] [--fallback on|off] --host <url>
  tobs pause <id> [--home <dsh-home>]
  tobs resume <id> [--home <dsh-home>]
  tobs update <id> [--name <name>] [--description <text>] [--role <tag> ...] [--home <dsh-home>]
  tobs human-name-set (--name <text> | --clear) [--home <dsh-home>]
  tobs channel-human-name-set <channel> (--nickname <text> | --clear) [--home <dsh-home>]
  tobs memory-snapshot <id> [--home <dsh-home>]
  tobs memory-file <id> --path <file> [--home <dsh-home>]
  tobs memory-history <id> [--limit <n>] [--home <dsh-home>]
  tobs memory-diff <id> --sha <commit> [--home <dsh-home>]
  tobs memory-save <id> --path <file> (--body <text> | --body-stdin)
                             [--expected-head <sha>] [--edit-id <id>] [--home <dsh-home>]
  tobs channels [--home <dsh-home>]
  tobs channel-messages <channel> [--limit <n>] [--before <id>] [--home <dsh-home>]
  tobs channel-media-target <channel> --source-event <id> --attachment <id>
  tobs channel-media-download <channel> --source-event <id> --attachment <id> --out <path> [--representation playback]
  tobs grants <id> [--home <dsh-home>]
  tobs grant-revoke <id> --grant <grant> [--home <dsh-home>]   online: add --confirm
  tobs grant-write-set <id> --grant <grant> (--enabled | --disabled) [--home <dsh-home>]
  tobs schedules <id> [--home <dsh-home>]
  tobs schedule-create <id> --title <t> --prompt <p> (--every <s> | --daily <HH:MM> |
                                  --weekly <HH:MM> --weekdays <0-6,..> | --once-date <d> --once-time <t> |
                                  --cron <expr>) [--timezone <tz>] [--enabled|--disabled] [--locked] [--home <dsh-home>]
  tobs schedule-update <id> --sid <schedule> [--title ...] [--prompt ...] [trigger ...] [--home <dsh-home>]
  tobs schedule-delete <id> --sid <schedule> [--confirm] [--home <dsh-home>]
  tobs schedule-history <id> --sid <schedule> [--home <dsh-home>]
  tobs schedule-run-now <id> --sid <schedule> [--home <dsh-home>]
  tobs schedule-preview (--every <s> | --daily ... | ...) [--home <dsh-home>]
  tobs pairings <id> [--home <dsh-home>]
  tobs secret-put <NAME> [--home <dsh-home>]            secret value arrives on stdin only
  tobs secret-list [--home <dsh-home>]                  names, sources, writability; never values
  tobs secret-unset <NAME> [--home <dsh-home>]
  tobs search <words>                                   find commands by words
  tobs send <id> (--body <text> | --body-stdin) [--message-id human-<UUID>] [--timeout <seconds>]
  tobs send-status <id> --message-id <Human-message-id>
  tobs tool-approval-status <channel> --message-id <card-id>
  tobs tool-approval-decide <channel> --message-id <card-id> --outcome allowed-once|rejected
  tobs user-question-status <channel> --message-id <card-id>
  tobs user-question-answer <channel> --message-id <card-id> --answer-stdin
  tobs ask-secret-status <channel> --message-id <card-id>
  tobs ask-secret-submit <channel> --message-id <card-id> --values-stdin
  tobs ask-secret-cancel <channel> --message-id <card-id>
  tobs ask-secret-account-status <channel> --message-id <configured-card-id>
  tobs ask-secret-replace <channel> --message-id <configured-card-id>
  tobs ask-secret-revoke <channel> --message-id <configured-card-id>
  tobs ask-secret-accounts <id>
  tobs release-info [--since <version>]
  tobs release-check
  tobs release-install <version> --confirm
  tobs release-restart --confirm
  tobs plugin-check [--force]
  tobs plugin-install <package> <version> --confirm
  tobs plugin-restart --confirm
  tobs update-status
  tobs update-cancel
  tobs marketplace-list [--query <words>] [--topic <topic>] [--sort updated|created|stars] [--cursor <c>] [--include-uploads]
  tobs marketplace-topics
  tobs marketplace-sections [--lang zh|en]
  tobs marketplace-digest [--day YYYY-MM-DD] [--lang zh|en]
  tobs marketplace-digests [--lang zh|en]
  tobs marketplace-detail <owner/repo>
  tobs marketplace-avatar-list [--cursor <cursor>]  Browse Marketplace Avatars / 浏览市场头像
  tobs marketplace-avatar-detail <id>  Read a Marketplace Avatar / 查看市场头像详情
  tobs marketplace-avatar-apply <id> --bot <bot> [--operation-key <key>]  Apply to a Bot / 应用到 Bot
  tobs marketplace-avatar-apply-candidates  List eligible Bots / 列出可应用头像的 Bot
  tobs marketplace-avatar-publish --file <image> --name <name> [--description <text>] [--avatar-tag <tag> ...] [--operation-key <key>] --confirm
    Publish a processed image as the Host owner / Host 所有者从文件发布已处理的头像
  tobs marketplace-file <listing-id> <path>
  tobs marketplace-submit <github-repo-url>
  tobs marketplace-report <owner/repo> [--reason <text>]
  tobs marketplace-account
  tobs marketplace-author --name <display name> [--accept-terms]
  tobs marketplace-upload-plan <bot-id>
  tobs marketplace-upload <bot-id> --name <name> [--description <bio>] [--role <tag> ...] [--replaces <listing-id>] --confirm
  tobs marketplace-mine [--lang zh|en]
  tobs marketplace-delete <listing-id> --confirm
  tobs marketplace-install <listing-id> [--lang zh|en]
  tobs marketplace-install <listing-id> --review <review-id> --confirm [--operation-key <key>]
  tobs share-draft-start <bot-id>
  tobs share-draft-show <bot-id>
  tobs share-draft-file <bot-id> --path <file>
  tobs share-draft-decide <bot-id> --path <file> (--keep | --drop | --rewrite-stdin)
  tobs share-draft-finish <bot-id>
  tobs share-draft-export <bot-id>
  tobs share-draft-discard <bot-id>
  tobs data-reset-preview
  tobs data-reset-confirm --confirmation-stdin --confirm
  tobs telemetry-status
  tobs telemetry-set (--enabled | --disabled)
  tobs git-status
  tobs git-install
  tobs pairing-list <id>
  tobs pairing-review <id> <pairing-id> --decision approve|reject|revoke [--role <role-id> | --capability <c> ...] [--confirm]
  tobs workspace-options
  tobs grant-create <id> --workspace <workspace-id>
  tobs browser-access-set <id> (--enabled | --disabled)
  tobs computer-access-set <id> (--enabled | --disabled)
  tobs access <id>
  tobs access-set <id> --mode workspace-write|danger-full-access [--scope chat|assignments] [--acknowledge-risk]
  tobs settings <namespace>
  tobs settings-set <namespace> --patch-stdin [--expected-revision <n> --previous-value <json>]
  tobs workspace-create <absolute-path>
  tobs channel <channel-id>
  tobs group-create <name> [--member <bot-id> ...] [--operation-key <key>]
  tobs group-invite <channel-id> --bot <bot-id> [--operation-key <key>] [--expected-channel <fingerprint>]
  tobs group-invite-cancel <channel-id> --invitation <invitation-id> [--expected-channel <fingerprint>]
  tobs group-join-decide <channel-id> --request <join-request-id> (--accept | --decline) [--expected-channel <fingerprint>]
  tobs channel-rename <channel-id> --name <name> [--expected-channel <fingerprint>]
  tobs group-avatar-set <channel-id> (--avatar-file <path> | --clear) [--expected-channel <fingerprint>]
  tobs group-wake-policies <channel-id>
  tobs group-wake-set <channel-id> --bot <bot-id> (--mode all|mentions|digest|silent | --inherit) [--count <n>] [--interval <seconds>] [--expected-channel <fingerprint>]
  tobs group-member-remove <channel-id> --bot <bot-id> [--expected-channel <fingerprint>]
  tobs im-app-add <discord|slack|qq|dingtalk|wecom|matrix> --credentials-stdin
  tobs im-app-status <platform>
  tobs im-app-remove <platform> --app <app-id>
  tobs im-bind <id> --app <app-id>
  tobs im-unbind <id> --app <app-id>
  tobs im-reconnect <id> --app <app-id>
  tobs im-status <id> [--read-mode saved|status]
  tobs channel-connect <channel> --bot <id> --conversation <external-id> [--app <app-id>]
  tobs channel-ingests <channel>
  tobs browser-open <id>
  tobs browser-frame <id> --out <absolute-file>
  tobs browser-takeover <id> (--enabled | --disabled)
  tobs browser-input <id> --args-stdin
  tobs browser-stop <id>
  tobs computer-start [--target local|container]
  tobs computer-status
  tobs computer-stop
  tobs browser-tools
  tobs browser-tool <id> <tool> [--args-stdin] [--out <absolute-file>]
  tobs memory-file-target|memory-graph|memory-commit-diff|memory-changes <id> [...]
  tobs memory-working-diff <id> --path <file> --kind staged|unstaged|untracked|current
  tobs memory-checkpoints|memory-versions <id>
  tobs memory-restore <id> --checkpoint <id> --expected-current <id>
  tobs memory-restore-commit <id> --sha <commit> --expected-head <commit> [--name <version>]
  tobs memory-version-name <id> --sha <commit> --name <version>
  tobs memory-version-unname <id> --tag <version>
  tobs memory-repair <id> --expected-head <commit>
  tobs memory-move <id> (--memory-location <absolute-dir> | --default-location)
  tobs model-catalog
  tobs model-plan-set <id> --plan-stdin [--assignment-models open|listed] [--expected-revision <n>]
  tobs model-plan-customize <id> --orchestrator-provider <p> --orchestrator-model <m> [--orchestrator-effort <e>]
  tobs model-plan-inherit <id> [--expected-revision <n>]
  tobs model-plan-assignments-set <id> --plan-stdin [--assignment-models open|listed] [--expected-revision <n>]
  tobs model-preset-update <preset-id> [--name <n>] [--orchestrator-provider/-model/-effort ...]
                                  [--assignment-provider/-model/-effort ...] [--assignment-models open|listed]
                                  [--plan-stdin] [--expected-revision <n>]
                                  [--orchestrator-group <id>|''] [--assignment-groups <id,id>|'']
                                  [--assignment-default-group <id>|'']
                                  [--<role>-engine codex|claude|none] [--<role>-engine-model <id>]
                                  [--<role>-engine-effort <level>]
  tobs overview-usage [--period today|week|month|quarter] [--after <bot-cursor>]
  tobs overview-memory [--after <bot-cursor>]
  tobs activity-overview
  tobs channel-activity-today
  tobs bot-usage <id> --start <YYYY-MM-DD> --end <YYYY-MM-DD> [--model <m>] [--provider <p>]
                        [--purpose orchestrator|assignment|subagent]
  tobs bot-session-usage <id>
  tobs bot-activity-history <id> [--before <YYYY-MM-DD>] [--weeks <1-104>]
  tobs group-activity <channel>
  tobs bot-trace <id> [--turns <1-20>] [--session <session-id>|direct]
  tobs bot-tools
  tobs bot-tool <id> <tool> [--args-stdin] [--session <assignment-session-id>]
  tobs computer-tools
  tobs computer-tool <id> <tool> [--args-stdin] [--out <absolute-file>]
  tobs todos
  tobs todo-add --title <text>
  tobs todo-update <todo-id> [--title <text>] [--done | --not-done]
  tobs todo-remove <todo-id>
  tobs todo-tools
  tobs todo-tool <id> <tool> [--args-stdin]
  tobs bot-attention <id> [--limit <1-100>] [--cursor <source-id>] [--state <state>]
  tobs bot-sessions <id> [--limit <1-100>]
  tobs bot-activity <id> [--limit <1-100>]
  tobs inbox [--category action|info|unread|replies|handled] [--bot <id>] [--channel <id>]
                    [--limit <1-100>] [--cursor <cursor>] [--sort newest|oldest]
                    [--snoozed | --dismissed] [--kind auto-rejection]
  tobs inbox-status
  tobs inbox-dismiss <item-id> [--source-key <source-event-id>]
  tobs inbox-restore <item-id> [--source-key <source-event-id>]
  tobs inbox-dismiss-all --confirm [--kind <kind>] [--category action|info|unread|replies]
                    [--bot <id>] [--channel <id>]
  tobs inbox-allow-once <autoreject:item-id>
  tobs inbox-snooze <item-id> [--source-key <source-event-id>] (--until <ISO time> | --clear)
  tobs inbox-ignore <source-event-id>
  tobs assignment-context <id> --session <session-id> --source <source-event-id>
  tobs channel-assignments <group-channel>
  tobs channel-assign <channel> (--section <section-id> | --unsectioned) [--index <n>]
  tobs session-ids
  tobs session-owner <session-id>
  tobs session-archive-set <id> --session <session-id> (--archived | --unarchived)
  tobs session-send <id> <orchestrator-session-id> [--] <text>
  tobs session-stop <id> <session-id> [--channel <channel-id>]
  tobs bot-stop <id> [--channel <channel-id>]
  tobs tool-approval-rules <id>
  tobs tool-approval-history <id> [--limit <1-100>] [--cursor <cursor>]
  tobs tool-approval-rule-revoke <id> --rule <rule-id> --confirm
  tobs private-mcp-set <id> --server <name> (--enabled | --disabled)
  tobs private-mcp-remove <id> --server <name> --confirm
  tobs bot-delete-preview <id>
  tobs bot-delete-memory-folder <id>
  tobs bot-delete-confirm <id> --confirmation-stdin --confirm [--erase-memory]
  tobs bot-delete-retry <id> --confirm
  tobs bot-avatar-set|bot-banner-set <id> (--file <image> | --clear)
  tobs bot-banner-set|bot-appearance-set <id> --recipe-stdin
  tobs bot-primary-color-set <id> (--color <#rrggbb> | --automatic)
  tobs bot-source-policies <id>
  tobs bot-source-policy-set <id> --source-class <class> [--wake <w>] [--delivery steer|turn]
                                    [--digest-count <n> --digest-interval <seconds>]
  tobs bot-source-policy-reset <id> --source-class <class>
  tobs bot-standing-limits-set <id> --soul <n> --core-memory <n>
  tobs developer-mode-set (--enabled | --disabled)
  tobs roster | human-identity | part-library
  tobs human-avatar-set (--file <image> | --clear)
  tobs human-avatars <human-id>...
  tobs human-profile-setup-finish
  tobs roster-batch pin|unpin|hide|move <channel>... [--section <section-id>]
  tobs roster-pins-set|roster-hidden-set [<channel>...]
  tobs roster-section-create <name>
  tobs roster-section-rename <section-id> --name <text>
  tobs roster-section-remove <section-id> --confirm
  tobs roster-section-reorder <section-id>...
  tobs roster-top-reorder section:<id>|channel:<id>...
  tobs part-library-add --part-stdin [--name <text>] [--parent <part-id>]
  tobs part-library-import --file <png|zip>
  tobs part-library-import-image --file <png> --slot <slot> --colors <n> [--name <text>]
  tobs part-library-export --out <absolute-file> [--part-id <id> | --part-stdin]
  tobs im-apps
  tobs im-authorize <feishu|weixin>
  tobs im-credentials <attempt-id> --credentials-stdin
  tobs im-verify <attempt-id> --verification-stdin
  tobs pairing-status <attempt-id> [--wait] [--timeout <seconds>]
  tobs im-cancel <attempt-id>
  tobs --help | tobs create --help

Output:
  stdout carries JSON, pretty by default; --compact condenses it to one line
  for agents. Human-readable lines go to stderr only.

Sources (exactly one per create):
  (none)       blank bot; --preset applies a model preset, otherwise the model
               step reports no-model-yet and activation stays a Settings task
  --from-git   clone a Git repository as Memory (HTTPS, SSH, or owner/repo
               shorthand for https://github.com/owner/repo.git)
  --from-zip   import a bot bundle zip (same shape as the bot-zip export)
  --from-dir   import a bot bundle directory (same shape as the bot-zip export;
               a .git subtree is skipped as files but packed as history)

Machine contract:
  stdout carries exactly one JSON document. Success exits 0 with the bot id,
  DM channel, data directory, per-step statuses, and next actions. Failure
  exits non-zero with {"error": {"code", "message"}} using a stable code
  (usage, secret-in-argv, bad-zip, bad-bundle, bad-ref, unknown-preset,
  unknown-bot, unknown-channel, duplicate-preset, git-not-found, git-clone-failed, git-clone-timeout,
  memory-unavailable, lease-unavailable, bad-credentials, invalid-input, invalid-avatar,
  file-unreadable). Human-readable lines go to stderr only.
  Stop the Host before offline database commands: the writer lease is exclusive.

Live Host:
  Require --host <loopback-origin|tailnet-HTTPS-origin> or DEEPSEEKBOT_HOST.
  Auth: DEEPSEEKBOT_HOST_TOKEN or --token-file <private-file>, never a token in argv.
  Login is fresh per call; cookies stay in memory. --timeout defaults to 120 seconds (max 600).
  send returns its receipt and exact committed replies. Inspect send-status on timeout
  before retrying; send never automatically resubmits. channel-messages also accepts --host.
  create (blank, Git, Zip and directory), list/show, model-presets/create/apply/plan,
  channels and the schedule* commands use the Host when --host or DEEPSEEKBOT_HOST is set. Do not combine
  --home with an online target; failures never fall back to local database access.
  Zip/directory uploads contain local bytes; Git cloning uses the Host environment.
  Creation errors retain known bot/steps; outcome unknown means inspect before retrying.
  Bot diagnostics are bounded summaries, not full execution logs or live streams.
  grant-revoke and grant-write-set use the Host when it is targeted; revokes and removals
  (grant, tool approval rule, private MCP server) need --confirm, like the Web UI.
  Deletion requires preview then stdin {"token":"<preview.token>"}; Memory is retained.
  Question stdin: {"answers":[{"id":"question-id","selected":["option"],"custom":"optional"}]}
  Private input stdin: {"field_id":"confidential value",...}; only declared fields.
  Private input commands return status/acceptance only and never retry a submission.

Models:
  model-presets lists the profile presets; model-preset-create mints one from
  explicit provider/model routes; model-preset-apply and model-plan read and
  write through the Host when selected, otherwise directly offline. Routes are shape-checked plus
  provider-existence-checked offline; catalog liveness and readiness
  inspection stay Host-side, and model-plan reports readiness deferred.
  --assignment-models open lets Assignments and Subagents use any model the Bot
  owner may use whose provider has an API key; listed (the default) keeps them to
  the Assignment model list. The Assignment default is still required.
  --plan-stdin may give assignmentGroupOptions for Assignment Routing Groups:
  [{group, allowedEfforts?, defaultEffort?, note?}]. A group may offer only the
  effort levels every member supports.

Memory:
  memory-snapshot/file/history/diff read the bot memory store; memory-save
  writes one file and commits it. --expected-head defaults to the current
  HEAD (pass it explicitly for compare-and-swap); --edit-id defaults to a
  fresh UUID and makes repeat submissions idempotent. Conflicts, missing
  files, and bad shas fail coded (memory-conflict, not-found,
  memory-unknown-commit).

Identity:
  The bot name is a label. Every create mints a new bot id, so reusing a name
  always returns a second bot and still exits 0.

Secrets:
  Never pass secrets as arguments: any --api-key/--token/--secret/--password
  style flag is a hard error (secret-in-argv). Model keys and tokens travel in
  the environment (for example DEEPSEEK_API_KEY, GITHUB_TOKEN) or a stdin pipe
  (--persona-stdin); result JSON never contains secret values.

Home:
  --home points at the target DSH_HOME (a fresh directory works with zero
  clicks); without it, DSH_HOME from the environment is used.
`;
