# Shared Lark test Apps

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

For #1373, use one available independent slot and an isolated Host. Complete the actual
unpaired DM/@ → sidebar approval → fixed re-ask notification → new-message model reply → revoke
path before recording real Lark acceptance.
