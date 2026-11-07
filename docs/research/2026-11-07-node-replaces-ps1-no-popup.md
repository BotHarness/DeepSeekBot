# Replace `scripts/android-qa.ps1` with Node: no-popup findings

Status: research only. No code changed. Target: port the single tracked
`scripts/android-qa.ps1` (211 lines) to `scripts/android-qa.mjs` so no
`.ps1` console window flashes on Windows, keeping the CLI surface stable.

## 1. Root cause of the popup

`pwsh.exe` is a console-subsystem process. On Windows the system creates a
new console for a console process, and a child console process inherits its
parent's console by default
([Creation of a Console](https://learn.microsoft.com/en-us/windows/console/creation-of-a-console)).
When a GUI parent (agent harness, Explorer, or any `CreateProcess` caller
that passes no console-suppressing flag) launches
`pwsh.exe -File scripts/android-qa.ps1`, Windows allocates a fresh console
for it — the flashing conhost window. Every helper invocation pays this
once, before PowerShell even starts parsing the script.

What each knob actually does:

- `CREATE_NO_WINDOW` (`0x08000000`): "The process is a console application
  that is being run without a console window. Therefore, the console handle
  for the application is not set." Ignored for non-console apps and
  incompatible with `CREATE_NEW_CONSOLE`/`DETACHED_PROCESS`
  ([Process Creation Flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)).
  This is the flag that eliminates the popup for console tools like
  `pwsh.exe`, `adb.exe`, `node.exe`.
- `DETACHED_PROCESS` (`0x00000008`): the new console process does not
  inherit the parent console but _may_ call `AllocConsole` later — i.e. it
  can still end up with a console
  ([Process Creation Flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)).
  In Node, `detached: true` on Windows means the child "will have its own
  console window" and can outlive the parent
  ([`options.detached`](https://nodejs.org/api/child_process.html#optionsdetached)).
  So `detached` alone does **not** suppress the window; it must be combined
  with `windowsHide: true` (plus detached stdio) for a hidden emulator.
- `Start-Process -WindowStyle Hidden`: maps to `ProcessWindowStyle.Hidden`
  (`SW_HIDE` in `STARTUPINFO.wShowWindow`), which only hides the window —
  the console is still allocated. `Start-Process` itself "is implemented
  using the `Start` method of the `System.Diagnostics.Process` class"
  ([Start-Process](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-7.6)).
  The .NET equivalent of `CREATE_NO_WINDOW` is the separate
  [`ProcessStartInfo.CreateNoWindow`](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.createnowindow?view=net-10.0)
  property ("`true` if the process should be started without creating a new
  window"), which is ignored when `UseShellExecute` is `true`. The script's
  emulator launch (`Start-Process ... -WindowStyle Hidden`) therefore still
  owns a hidden console; the user-visible flash comes from the _outer_
  `pwsh.exe` invocation, not from that line.

Exact Node options and what they map to:

- `windowsHide: true` — "Hide the subprocess console window that would
  normally be created on Windows systems. Default: `false`." Available on
  `spawn`/`execFile`/`exec`/`fork` and the sync variants
  ([child_process](https://nodejs.org/api/child_process.html)).
- Node's C++ layer translates `options.windowsHide` into libuv's
  `UV_PROCESS_WINDOWS_HIDE` flag
  ([`src/process_wrap.cc`](https://github.com/nodejs/node/blob/v22.x/src/process_wrap.cc),
  validated and threaded through in
  [`lib/child_process.js`](https://github.com/nodejs/node/blob/v22.x/lib/child_process.js)).
- libuv's Windows `uv_spawn`
  ([`src/win/process.c`](https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/process.c))
  then does two things when `UV_PROCESS_WINDOWS_HIDE` (or
  `UV_PROCESS_WINDOWS_HIDE_CONSOLE`) is set: passes `CREATE_NO_WINDOW` to
  `CreateProcessW` (only when no stdio fd is inherited — with piped/ignored
  stdio this holds), and sets `wShowWindow = SW_HIDE` (for
  `UV_PROCESS_WINDOWS_HIDE_GUI`/`UV_PROCESS_WINDOWS_HIDE`).
- `shell: false` + direct `argv` array: libuv builds the `CreateProcessW`
  command line itself with correct quoting (`quote_cmd_arg` in the same
  file), so no `cmd.exe`/`conhost` intermediary is involved. Leave
  `windowsVerbatimArguments` at its default `false` for `adb.exe`,
  `emulator.exe`, `scrcpy.exe` (documented at
  [`spawn`](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options));
  it exists for programs with non-standard command-line parsing.
- Net effect: the `.mjs` port must pass `windowsHide: true` on **every**
  spawn (default is `false`), and the harness invoking
  `node scripts/android-qa.mjs` gets the same `CREATE_NO_WINDOW` treatment
  the repo's other 261 `.mjs` helpers already rely on.

## 2. Performance: local reproducible benchmark

No primary source publishes pwsh-vs-node startup figures, so both were
measured on this Windows box (median of 5 `spawnSync` runs, same machine,
same session):

| Command                                          | Median     | Runs (ms)               |
| ------------------------------------------------ | ---------- | ----------------------- |
| `pwsh.exe -NoProfile -Command exit` (pwsh 7.6.9) | **341 ms** | 323, 323, 341, 344, 346 |
| `node -e ""` (node v24.16.0)                     | **48 ms**  | 43, 44, 48, 57, 58      |

Reading: each helper invocation today pays ~340 ms of pwsh 7 cold start
(.NET runtime + profile bypass still loads the engine) before executing a
single action; the `.mjs` equivalent pays ~50 ms of Node startup. The port
also removes one process layer per invocation (`.mjs -> adb` instead of
`.mjs -> pwsh -> adb`); every action in the helper already shells out to
`adb`/`scrcpy`/`pnpm`/`gradlew`, so per-action child costs are unchanged.
Long-running actions (`metro`, `build`, `record`) are unaffected — the win
is startup latency and the missing popup, not throughput. Figures are
machine-specific; re-run the snippet in §1–2's benchmark before quoting
them elsewhere.

## 3. Concurrency correctness for the lease

- Current mechanism: `[IO.File]::Open($LeasePath, CreateNew, Write, None)`
  (`scripts/android-qa.ps1:89`). `FileMode.CreateNew` means "the operating
  system should create a new file. ... If the file already exists, an
  `IOException` exception is thrown"
  ([FileMode](https://learn.microsoft.com/en-us/dotnet/api/system.io.filemode?view=net-10.0)).
  The Win32 disposition behind it is `CREATE_NEW`, which fails with
  `ERROR_FILE_EXISTS` when the lease exists — the losing claimant throws
  and exits nonzero.
- Node equivalent: `fs.openSync(path, 'wx')` / `await fs.open(path, 'wx')`
  (`'x'` = exclusive; documented under
  [File system flags](https://nodejs.org/api/fs.html#file-system-flags)).
  libuv's Windows fs layer maps the exclusive flag to disposition
  `CREATE_NEW` (verified in
  [`src/win/fs.c`](https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/fs.c)),
  so a lost race surfaces as `EEXIST` on Windows too. Verified empirically
  on this box: first `openSync(p, 'wx')` succeeds, second throws with
  `code === 'EEXIST'`.
- The existing test's parallel-double-claim expectation
  (`scripts/test/android-qa.test.mjs:42-59`, "admits exactly one concurrent
  runner") is therefore preserved by `wx`: open-`wx`, write the lease JSON,
  close; on `EEXIST`, exit nonzero with the same message/exit-code contract.
  Port recipe: `try { fd = openSync(lease, 'wx'); writeSync(fd, json);
closeSync(fd) } catch (e) { if (e.code === 'EEXIST') fail('already
claimed'); throw e }`.
- Atomic JSON writes (`active.json`, `config.json`, build manifests):
  write-tmp + rename. libuv rename on Windows is `MoveFileExW` with
  `MOVEFILE_REPLACE_EXISTING` (same `src/win/fs.c`), i.e. an atomic
  same-volume replace; verified empirically (write `<name>.tmp-<pid>`,
  `renameSync`, content reads back intact). Keep `events.jsonl` as one
  append per event (today's `Add-Content` per `Event()` call,
  `scripts/android-qa.ps1:39-42`): same line-granularity semantics, no worse
  than today.

## 4. Port mapping per ps1 construct

| ps1 construct (`scripts/android-qa.ps1`)                                                                    | `.mjs` equivalent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `param()` block with `ValidateSet` (action, lane) and `ValidateRange` (ports, seconds) (`:4-13`)            | `node:util` [`parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig) + manual range/enum checks that print the same usage errors and exit nonzero. No new dependency: `parseArgs` is core.                                                                                                                                                                                                                                                                                                                                                          |
| `$LASTEXITCODE` checks after `& $Exe` / `git` / `adb` (`:27-29`, `:31-33`, `:136-149`)                      | `spawnSync(...).status` (or `execFileSync` throwing on nonzero) compared against `0`; throw `"<exe> exited <code>"` to keep the message contract.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Start-Process -WindowStyle Hidden` emulator launch (`:124`)                                                | `spawn(emulatorExe, ['-avd', avd, '-port', port, '-no-snapshot-save'], { detached: true, stdio: 'ignore', windowsHide: true, cwd: sdk })` + `child.unref()`. `detached` gives post-parent survival; `windowsHide` + ignored stdio yields `CREATE_NO_WINDOW` + `SW_HIDE` per §1.                                                                                                                                                                                                                                                                                |
| Binary PNG pipe avoiding redirection corruption (`:189-196`, uses `ProcessStartInfo` + `BaseStream.CopyTo`) | `spawn(adb, [...])` + `node:stream/promises` `pipeline(child.stdout, createWriteStream(prefix + '.png'))`, then check exit code. Bytes never pass through text decoding — the same guarantee as the current workaround. (PowerShell `>` redirection historically went through text formatting/`Out-File`; byte-preserving native-stdout redirect only arrived in 7.4 — [about_Redirection](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_redirection?view=powershell-7.6). The port sidesteps the issue entirely.) |
| `$env:` scoping (`:111-116`, `:129-133`)                                                                    | Per-spawn `env: { ...process.env, ANDROID_HOME: sdk, ... }` — strictly scoped to the child, better than the script's process-wide mutation and required since concurrent `.mjs` actions must not share globals.                                                                                                                                                                                                                                                                                                                                                |
| `trap { ... events.jsonl; throw }` (`:16-23`)                                                               | Top-level `try/catch`: on failure append the same `{time, phase:'failed', action, owner, batch, code:'ANDROID_QA_FAILED'}` JSON line, then `process.exitCode = 1` and rethrow/print.                                                                                                                                                                                                                                                                                                                                                                           |
| `ConvertTo-Json` / `ConvertFrom-Json`, `[DateTime]::UtcNow 'o'`                                             | `JSON.stringify` / `JSON.parse`, `new Date().toISOString()` (same ISO-8601 `o`-round-trip shape).                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm.cmd` / `gradlew.bat` invocation (`:134`, `:150`, `:164`)                                              | `.bat`/`.cmd` files "are not executable on their own ... cannot be launched using `execFile`" — spawn `cmd.exe /c` or use `exec` per [Spawning .bat and .cmd files on Windows](https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows), with `windowsHide: true`. `adb.exe`/`emulator.exe`/`scrcpy.exe` spawn directly with `shell: false`.                                                                                                                                                                                           |
| `git -C $Repo rev-parse --path-format=absolute --git-common-dir` (`:31`)                                    | Unchanged semantics: `spawnSync('git', ['-C', repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'])` ([git-rev-parse](https://git-scm.com/docs/git-rev-parse)). Keeps all worktrees resolving the shared main-checkout queue root.                                                                                                                                                                                                                                                                                                                 |

## 5. Recommendation

Port to `scripts/android-qa.mjs`. The popup has a single root cause (a
console-subsystem `pwsh.exe` spawned without `CREATE_NO_WINDOW`), the exact
Node options that produce `CREATE_NO_WINDOW` are verified against Node and
libuv primary sources, the lease's atomicity maps 1:1 onto `wx`/`EEXIST`,
and the measured startup tax (~340 ms → ~50 ms per invocation) disappears
with the pwsh layer. Risk is low: the helper is a thin orchestrator over
`adb`/`scrcpy`/`pnpm`/`gradlew`, and every construct above has a direct
core-Node equivalent with no new dependencies.

The port must keep, verbatim: action/flag names (`init status claim release
devices emulator build install metro open screenshot record mirror`,
`-Owner -Batch -Lane -Serial -Label -ViewOnly -MetroPort -Seconds
-QueueRoot`), exit-code contract (0 success, nonzero + message on every
refusal the test asserts), `active.json`/`config.json`/`queue.md`/
`events.jsonl`/evidence-manifest JSON shapes, and the lease-match rules
(owner/batch/worktree/serial, lane pinning). Un-skip and retarget
`scripts/test/android-qa.test.mjs` to `node scripts/android-qa.mjs` so the
lease tests run cross-platform in CI instead of Windows-only behind
`pwsh.exe`. Update call sites in the main checkout: `docs/agents/android-device-qa.md`,
`docs/agents/qa-evidence.md` (if referencing), `AGENTS.md:80`,
`apps/mobile/AGENTS.md:53`, `.agents/skills/verify-deepseekbot/SKILL.md`,
`features/README.md`, `features/phone-notifications.md`,
`features/phone-member-interactions.md`,
`features/phone-chat-backgrounds.md` (`pwsh -NoProfile -File
scripts/android-qa.ps1` → `node scripts/android-qa.mjs`). Delete the
`.ps1` in the same change so `git ls-files "*.ps1"` returns to empty.

## 6. Draft AGENTS.md norm text (EN, ZH-ready)

> Repo scripts are Node `.mjs` run as `node scripts/<name>.mjs` — no new
> `.ps1`/`.cmd`/`.bat` files. Spawn child processes with direct `argv`
> (`shell: false`) and `windowsHide: true` on every spawn so no conhost
> window flashes on Windows; keep CLI action/flag names, exit codes, and
> JSON shapes stable when porting a helper.

Proposed Chinese counterpart (for `AGENTS.md`/docs ZH sync):

> 仓库脚本统一为 Node `.mjs`，以 `node scripts/<name>.mjs` 运行——不得新增
> `.ps1`/`.cmd`/`.bat` 文件。每次 spawn 子进程使用直接传参（`shell: false`）
> 并设置 `windowsHide: true`，避免 Windows 弹出 conhost 窗口；移植脚本时保持
> CLI 动作/参数名、退出码与 JSON 结构不变。

## Sources

- [Node `child_process` — `windowsHide`, `detached`, `shell`, `.bat/.cmd` on Windows](https://nodejs.org/api/child_process.html)
- [Node source: `windowsHide` → `UV_PROCESS_WINDOWS_HIDE`](https://github.com/nodejs/node/blob/v22.x/src/process_wrap.cc) via [`lib/child_process.js`](https://github.com/nodejs/node/blob/v22.x/lib/child_process.js)
- [libuv `src/win/process.c` — `CREATE_NO_WINDOW` / `SW_HIDE` / `DETACHED_PROCESS` handling in `uv_spawn`](https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/process.c)
- [libuv `src/win/fs.c` — `CREATE_NEW` disposition, `MoveFileExW` rename](https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/fs.c)
- [Node `fs` — File system flags (`wx`)](https://nodejs.org/api/fs.html#file-system-flags)
- [Node `util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig)
- [Win32 Process Creation Flags (`CREATE_NO_WINDOW`, `DETACHED_PROCESS`)](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)
- [Creation of a Console](https://learn.microsoft.com/en-us/windows/console/creation-of-a-console)
- [Start-Process](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-7.6)
- [ProcessStartInfo.CreateNoWindow](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.createnowindow?view=net-10.0)
- [FileMode enum (`CreateNew`)](https://learn.microsoft.com/en-us/dotnet/api/system.io.filemode?view=net-10.0)
- [about_Redirection (byte-stream redirect since 7.4)](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_redirection?view=powershell-7.6)
- Local evidence (this Windows box, 2026-11-07): pwsh 7.6.9 `-NoProfile -Command exit` median 341 ms vs node v24.16.0 `-e ""` median 48 ms (5 `spawnSync` runs each); `fs.openSync(p,'wx')` second-create throws `EEXIST`; write-tmp + `renameSync` round-trips intact.
