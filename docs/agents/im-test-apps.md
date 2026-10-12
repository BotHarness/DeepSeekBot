# Shared IM test Apps

Configure up to three reusable, independent Lark Apps once per machine. From any worktree:

```bash
node scripts/dev-im-test-apps.mjs setup
node scripts/dev-im-test-apps.mjs list
```

On Windows, run these commands with Windows Node in PowerShell. The setup launcher selects
Git for Windows Bash explicitly; the `bash` command in PowerShell may instead select WSL,
where `/d/...` is not a Windows drive path. Setup requires an interactive terminal.

The three-stage wizard selects QA1, QA2 or QA3 and confirms an independent App and a free
receiver window, captures credentials with hidden Secret input, then guides the operator through
Bot permissions, message events and release. Re-running preserves existing values on Enter.
Reusing an App does not require creating another App for each branch or task.

Credentials live only in `~/.config/botharness/im-test-apps.env`, outside Git and all worktrees.
Windows Node resolves this to `%USERPROFILE%\.config\botharness\im-test-apps.env`.
Setup protects the directory and file with private POSIX permissions or Windows user/SYSTEM
ACLs, including replacement files. It does not set GitHub secrets or machine-wide environment
variables, start a receiver, or modify a DSH Profile.

Each slot has `BH_LARK_QA<n>_NAME`, `DOMAIN`, `APP_ID`, `APP_SECRET`, `CONSOLE_READY` and
`RECEIVER_CHECKED_AT`; `BH_IM_QA_SLOT` remembers the last selected slot. The file uses literal
`KEY=value` lines. Do not source it: names can contain spaces. Test harnesses import
`loadImTestApp('QA1')` from `scripts/dev-im-test-apps.mjs` and pass credentials privately to
the qualified Provider's existing credentials/configuration seam. This loader alone does not
configure the Provider or grant a receiver window. `list` prints only names and configuration
metadata, never credentials.

Windows and WSL have separate default homes. A WSL test can explicitly set
`BOTHARNESS_IM_TEST_APPS_ENV=/mnt/c/Users/<user>/.config/botharness/im-test-apps.env` to reuse
the Windows file only when its mounted permissions pass the loader's private-file check.
Prefer Windows Node for this Windows setup rather than duplicating credentials.

Before every receiver start, coordinate the current slot, owning issue/task, isolated Host and
start/stop window with the Human and inspect current claims/process evidence. A saved timestamp
is an old operator statement, never an idle indication, automatic lock or continuing lease.
Stop only this task's exact receiver. Keep production exclusive. The Onboarding QA App reserved
by #1022 remains owned by that task; adding it to this registry would not authorize taking it over.

When two Human accounts are signed in to one Lark organization, confirm the selected browser
account as well as the App slot. The other account may not show the designated private chat.
Follow the [AX account-selection procedure](ax-browser.md#im-qa-with-two-human-accounts-in-one-organization)
before changing credentials, permissions or receiver configuration.

For #1373, use one available independent slot and an isolated Host. Complete the actual
unpaired DM/@ → sidebar approval → fixed re-ask notification → new-message model reply → revoke
path before recording real Lark acceptance.

## Reusable Slack QA Apps

Slack has its own QA1/QA2/QA3 slots, independent of the Lark selection:

```bash
node scripts/dev-im-test-apps.mjs setup slack
node scripts/dev-im-test-apps.mjs list slack
```

Run the setup command in an interactive terminal. The repeatable three-stage wizard opens the
Slack app console, selects an existing independent App and test Workspace with a current idle
window, captures the Bot Token and App-level Token with hidden input, and guides Socket Mode,
DM scopes/events, App Home and installation. It does not start a receiver or configure GitHub
secrets. Re-running with Enter preserves existing values. The Human-selected first App is
**BotHarness Slack QA**; its actual configuration and receiver window still require verification.

All values remain in the same protected `~/.config/botharness/im-test-apps.env` outside every
worktree. `BH_SLACK_QA_SLOT` remembers the Slack selection; each slot uses
`BH_SLACK_QA<n>_NAME`, `WORKSPACE_NAME`, `WORKSPACE_URL`, `APP_ID`, `BOT_TOKEN`, `APP_TOKEN`,
`CONSOLE_READY` and `RECEIVER_CHECKED_AT`. The loader privately returns credentials with
`loadSlackImTestApp('QA1')` from `scripts/dev-im-test-apps.mjs`; `list slack` exposes only names,
presence/readiness metadata and the requirement for a current window. The saved name, App ID,
Workspace URL and operator timestamp are metadata, not trusted platform identity or a lease.
The qualified Provider verifies installed workspace/bot identity and current account scope.

For compatibility with existing Lark-only branches, the saver writes Slack records as literal
`# BH_SLACK_...=...` lines. The extended loader reads them, while older Lark loaders ignore and
preserve them as comments. They still contain private tokens and receive the same file protection;
do not source or publish the file. Existing Lark keys/default commands are unchanged. Use the
updated loader for Slack; older branches cannot load a platform they did not implement.

The wizard follows Slack's [Socket Mode configuration](https://docs.slack.dev/tools/python-slack-sdk/socket-mode/):
use an App-level `connections:write` token, enable Socket Mode, subscribe to `message.im`, and
enable messages in App Home. Bot scopes for this first DM tracer are `im:history`, `im:read`,
`chat:write` and `users:read`; installation/reinstallation must grant them. The Provider checks
the original DM with [`conversations.info`](https://docs.slack.dev/reference/methods/conversations.info/),
which needs `im:read`. Group/media/native approval scopes
belong to their own slices. Browser Human login does not substitute for either App token.

Before each Slack receiver start, coordinate the selected slot, owning task, isolated Host and
start/stop window and inspect live receiver evidence, including other devices/environments.
Reuse credentials across branches/sessions, not simultaneous receivers. Stop only this task's
exact receiver after testing. A setup confirmation never grants a perpetual window.
