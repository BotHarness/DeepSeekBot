# Shared device QA

On **Windows 11**, use [Windows Android QA](android-device-qa.md) for the shared emulator,
physical Android phone, batch queue and scrcpy capture helper. Windows has its own queue and
one runner across both Android lanes. The rest of this page describes the **Mac/iOS** lane.

Native checks for `apps/mobile` run on one Mac that several coding agents share (Claude Code,
Codex, or anything else). That Mac has one QA Simulator, one physical iPhone, one QA Host and a
disk budget of about 20 GB. Read this before you boot a Simulator, build the app, start a Host
or touch the phone. The tools themselves (`e2e-mobile-sim.mjs`, agent-device, Maestro,
`rn-profile.mjs`) are documented in [`apps/mobile/README.md`](../../apps/mobile/README.md) and
[`apps/mobile/AGENTS.md`](../../apps/mobile/AGENTS.md). This page covers how agents share them.

For iOS performance diagnosis or tuning, follow [iOS performance verification](ios-performance.md)
within the authorized device window. Simulator diagnostics do not qualify physical Release FPS;
retain valid workload, profiling and matched A/B evidence separately from visual captures.

## Shared resources

| Resource                | Current value                                                                                     | Who may change it          |
| ----------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| QA Simulator            | One shared device with the dev client installed (the queue names it; today "PR1800 glass iOS 26") | Only the current runner    |
| e2e Simulator           | `BotHarness e2e`, erased by `scripts/e2e-mobile-sim.mjs` on every run                             | Only the current runner    |
| Physical iPhone         | The Human's phone, on the Mac's Tailscale tailnet                                                 | The device lane, see below |
| QA Host                 | Port `39100`, home `~/.dsh-botharness-batch-qa`, its own worktree                                 | Only the current runner    |
| Simulator dev build     | `~/Library/Developer/Xcode/DerivedData/DeepSeekBotDev-shared`                                     | One rebuild at a time      |
| Phone build             | `~/Library/Developer/Xcode/DerivedData/DeepSeekBotDev-phone`                                      | One rebuild at a time      |
| Cached e2e app          | `~/Library/Caches/botharness/mobile-sim/DeepSeekBotDev.app`                                       | `e2e-mobile-sim.mjs`       |
| Maestro iOS driver port | One per Mac                                                                                       | One Maestro run at a time  |

Machine-specific values (device UDIDs, team id, tailnet hostname) stay on the Mac and in the
queue. Never commit them.

## The queue

The Simulator runs one thing at a time, so one queue owner schedules all native checks. The
queue is one Markdown file on the Mac, at `.humanlayer/device-qa/queue.md` in the main
BotHarness checkout (`.humanlayer/` is gitignored, so the file is never committed). Every agent on
the Mac reads it there. Agents without access to the Mac (cloud sessions) reach it through the
Mac's folder tools or a session on the Mac. The "模拟器测试排队" (Simulator queue) thread owns
it today.

- Read the queue before you use the Simulator, the phone or the QA Host. Never boot your own
  Simulator to skip the line.
- Only the owner cuts batches and names the runner. Other agents add or update only their own
  entries under "Next batch". The runner adds the results for its batch.
- Keep each edit small: re-read the file just before you change it, because other agents write
  to it too.

Checks run in **batches**: several PRs are merged into one local branch and checked in one run,
not one run per PR.

1. **Submit.** Add one entry under "Next batch" with the PR, the branch and head SHA, who to
   report to, whether it changes native inputs (see [Builds](#builds)), and the QA steps, one per
   line. Mark the steps that need light and dark screenshots, and the steps that need a working
   model, a second paired Host, a Browser or Computer, or the physical phone. A merged PR submits
   `main`.
2. **Get mergeable.** The PR's own agent merges the latest `main` into its branch and pushes
   before the batch is cut. Conflicts are fixed in the PR, never in the batch branch. When two
   open PRs conflict with each other, their agents push a combo branch (see
   [Branches and worktrees](#branches-and-worktrees)).
3. **Cut.** The owner freezes the list and names one runner. Requests that arrive during a run
   wait for the next batch, unless the owner adds them to a batch that is not cut yet.
4. **Run once.** The runner builds the batch branch, starts one Metro, runs
   `node scripts/e2e-mobile-sim.mjs` once, then every entry's steps in order.
5. **Report.** See [Reporting results](#reporting-results). A failure is fixed in its PR and
   rides the next batch.

Android items go to the Windows queue; a Mac batch marks them untested until the Android
runner records its separate result.

## Branches and worktrees

- **Batch branch:** `qa/batch-<n>`, cut from the latest `origin/main`. It merges each open PR
  branch in the batch with `git merge --no-edit`. It stays local and is never pushed. If a merge
  conflicts, abort it and tell the owner. Do not resolve it yourself unless the owner sends the
  resolution.
- **Batch worktree:** the batch branch lives in a worktree under `.worktrees/` in the Mac's main
  checkout (today `.worktrees/qa-batch-1`, reused for later batches by checking out the new
  `qa/batch-<n>`). It is the only checkout the runner rebuilds or reloads from.
- **Combo branches:** when two open PRs conflict, the PR agents push `qa/<pr>-<pr>[-<pr>]` with
  the conflict resolved, for example `qa/1878-1885-1889`. The batch merges the combo branch
  instead of the separate heads. The agents that pushed a combo branch delete it after its PRs
  merge. The runner never deletes `qa/` branches.
- **Evidence branch:** redacted screenshots are pushed to `qa/batch-<n>-evidence` so PR comments
  can embed them by raw URL.
- **Throwaway worktrees:** a bisect or a check on plain `main` gets its own
  `.worktrees/<name>` and its own Metro port, and is removed when the check is done. It never
  reuses the batch worktree.
- Never delete, reset or stash in another agent's worktree. Never remove anything under
  `/private/tmp` that you did not create.

## Builds

JavaScript-only changes need no build: load them through Metro into the installed dev client.

```bash
pnpm --filter @botharness/mobile start --port <free-port>
xcrun simctl openurl <udid> "exp+deepseekbot://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A<port>"
```

A **native change** needs a new build. A change is native when it touches `app.json` or
`app.config` native fields, a config plugin, `Podfile`/`Podfile.lock`, or adds or bumps a
package with native code (an Expo SDK patch bump counts). Check every PR in the batch, and the
`main` it is based on, before deciding a batch is JavaScript only.

- Run `npx expo prebuild` and `LANG=en_US.UTF-8 pod install` (in `apps/mobile/ios`) before the
  build. CocoaPods crashes without a UTF-8 locale.
- Keep exactly one copy of each build. Before a rebuild, delete the previous DerivedData folder
  and `apps/mobile/ios`. Build into the named folder with `-derivedDataPath`, never into a new
  per-branch folder.
- Check `df -h ~` before a build and stop if less than about 15 GB is free. Log the DerivedData
  size and `df -h ~` after the build in the batch's results.
- One build at a time. When another agent's build or profile uses a DerivedData folder (for
  example a Release build on the phone for profiling), do not write to that folder until it is
  done.

## QA Host

Batch checks use a dedicated QA Host, never the Human's everyday Host and never another
agent's Host.

- **Start:** from the batch worktree, after `pnpm build`:

  ```bash
  node scripts/dev-instance.mjs --home ~/.dsh-botharness-batch-qa --port 39100
  ```

  `dev-instance.mjs` writes its log to `$TMPDIR/dsh--dsh-botharness-batch-qa-39100.log`, which
  is the home folder's name sanitized plus the port. Restart it after each Host-side merge:
  stop the exact listener PID (`lsof -ti:39100 -sTCP:LISTEN`), then start it again with the same
  home and port.

- **Token:** the launch token changes on every restart. Read it from the log without printing
  it, and pass it to the `deepseekbot` CLI through the environment:

  ```bash
  export DEEPSEEKBOT_HOST=http://127.0.0.1:39100
  export DEEPSEEKBOT_HOST_TOKEN="$(grep -oE 'token=[A-Za-z0-9._-]+' \
    "$TMPDIR/dsh--dsh-botharness-batch-qa-39100.log" | tail -1 | cut -d= -f2)"
  node packages/deepseekbot/dist/deepseekbot.mjs <verb> …
  ```

  Never put a token in a command argument, a log line, a PR comment or a chat message. See
  [`docs/bot-cli.md`](../bot-cli.md) for the live verbs.

- **Model:** use the latest DeepSeek model through the shared machine-local key
  (`~/.config/botharness/dev.env`; see [`ax-model.md`](ax-model.md)). When the provider answers
  429, the steps that need a model reply are untested, not failed. Run
  `e2e-mobile-sim.mjs --no-approval` and say so.
- **Test data:** seed the QA Host through the CLI so checks have content: a few PersonaBots, a
  group Channel with two of them, a short DM. Ask the Human before you create data that has side
  effects, such as routines. Delete test data you created when the check is done.
- **Pairing:** a pairing offer is one-time and lasts 5 minutes. Make it the way
  `scripts/e2e-device-pairing.mjs` does, or in the Web Client under Bot settings → Devices →
  Pair a phone. A Simulator pairs over the loopback route: open the link with
  `xcrun simctl openurl <udid> '<deepseekbot-dev://pair?p=…>'`. A physical phone needs a Tailscale
  HTTPS route (see below). Never redeem an offer meant for the Human.

## Physical iPhone

The phone is the device lane. It runs in parallel with Simulator batches, but it shares the Mac's
disk, Host and build folders.

- **Reach the Host.** The phone reaches the QA Host only over Tailscale HTTPS. Run
  `tailscale serve --bg 39100`. It replaces whatever the Mac serves on 443, so save
  `tailscale serve status --json` first and note the command that restores the old target. Then
  make an offer whose routes include the `https://<machine>.<tailnet>.ts.net` origin, and turn
  the link into a QR code for the Human to scan. For the Dev app, scan inside its pairing screen
  or use a `deepseekbot-dev://pair?p=…` link; external public `deepseekbot://` links belong to
  the store app. Preserve the encoded payload when changing the prefix.
- **Build.** The phone runs a Release build of the batch branch, made in the batch worktree:

  ```bash
  cd <batch-worktree>/apps/mobile && xcodebuild -workspace ios/DeepSeekBotDev.xcworkspace \
    -scheme DeepSeekBotDev -configuration Release -destination id=<iphone-udid> \
    -derivedDataPath ~/Library/Developer/Xcode/DerivedData/DeepSeekBotDev-phone \
    -allowProvisioningUpdates DEVELOPMENT_TEAM=<team-id> build
  ```

  When the batch has a native change since the phone's last build, run `npx expo prebuild` and
  `LANG=en_US.UTF-8 pod install` first. A Release build carries its JavaScript, so a phone needs
  a new build for every JavaScript change too. Host-side changes, such as notification text, need
  only a QA Host restart.

- **Install:**
  `xcrun devicectl device install app --device <iphone-udid> ~/Library/Developer/Xcode/DerivedData/DeepSeekBotDev-phone/Build/Products/Release-iphoneos/DeepSeekBotDev.app`.
  Then ask the Human to open the app once and keep it in the foreground for a few seconds, so it
  registers for push again.
- **Simulator first.** Run every check that can run on a Simulator there, using iOS 27
  Simulators only, with at most two booted on the Mac at once. Keep the phone for checks that
  need real hardware or system state: Tailscale, Local Network and other permission prompts,
  push, battery, heat and Release performance.
- **Drive the phone with XCUITest over USB.** The phone stays on a USB cable to the Mac.
  Automate it with agent-device's XCUITest runner, which is signed with the
  `yang@deepseekbot.app` Apple account in Xcode → Settings → Accounts. Use that account's team
  for the runner and the phone build; never use the other account listed there. Keep a working
  runner running. Rebuilding it needs a valid sign-in, so if the sign-in has expired, ask the
  Human to sign in again rather than switching accounts. XCUITest cannot tap iOS system
  permission alerts, such as Local Network, so ask the Human to tap those, then continue by
  automation.
- **Push and approval tests.** Check that the phone has a `push_devices` row on the QA Host,
  without reading its token. Trigger one Tool approval at a time from an idle Bot, so no old
  approval is queued ahead of it. Tell the Human when each one is sent. Leave the decision to the
  Human, then record which decision the Host received and whether it came from the notification.
  Leave about 20 seconds between notifications.

## What needs the Human at the Mac

Some steps only the Human can do. Ask once, with the exact command or action and why:

- Approving a permission prompt from an agent session running on the Mac. A session that goes
  quiet is often waiting on one.
- Commands the Mac's permission check blocks: `tailscale serve`, signed `xcodebuild` for the
  phone, and CLI calls that read the Host token from the log. Never work around the block. Send
  the command for the Human to run, and continue when they paste the output.
- Anything on the phone: scanning the QR code, opening the app, tapping notifications and their
  buttons, checking haptics and dictation.
- Global Mac settings, such as `defaults write`, and anything that touches the Human's own
  Hosts or accounts.
- Topping up a model quota.

## Reporting results

Save and index captures using [local QA evidence and release archives](qa-evidence.md).
macOS/iOS and Windows/Android keep separate platform results and share the frozen acceptance SHA
for final release checks; existing runner output locations remain intact.

- **One comment per PR**, posted by the runner with `gh` from the Mac. It gives the PR head SHA
  and the batch branch commit it ran on. It gives pass, fail or untested for each step, with the
  reason for anything untested (for example "Android untested", "no second Host", or "needs a
  model, provider returned 429"). It embeds light and dark screenshots where the step asked for
  them.
- **Redact before you post.** Crop or blur the tailnet hostname, the computer name, home folder
  paths, tokens and any personal content. Publish reviewed screenshots to Cloudflare R2 using
  `pnpm evidence:publish` and embed the returned immutable URLs; never commit them to an evidence
  branch. Follow the retention/cleanup rules in [QA evidence](qa-evidence.md).
- **Human QA.** When the Human checks an item by hand, the comment says
  `Human QA passed (<name>, <time>Z)` and the automated pass for that item is skipped.
- **Summary.** The runner sends the queue owner one line per PR with the result and the comment
  link. The owner records it under the batch in the queue and tells each PR's agent. A failure
  goes back to its PR as a fix, and its recheck rides the next batch.

## Rules that keep the Mac usable

- No global cleanup: no `xcrun simctl shutdown all`, no `erase all`, no deleting other agents'
  Simulators, worktrees, stashes or `/private/tmp` folders. Target the Simulator by UDID, not
  `booted`, when several are booted.
- A Simulator you create for a retry is deleted when you are done with it.
- One Metro per worktree, on a free port. Do not stop Metro or Hosts that other agents started.
- One Maestro run at a time on the Mac.
- Keep other builds off the Mac while you profile (see [Profiling](../../apps/mobile/AGENTS.md#profiling)).
- Secrets, push tokens and tailnet addresses never enter the repo, a PR comment or a log line.

## Mobile app verification and read-only diagnostics

- **First reserve the shared device lane** through [shared device QA](./device-qa.md). Do not start a separate Simulator, Metro, Host or build outside the assigned batch. The runner may use `node scripts/e2e-mobile-sim.mjs` only when its Simulator/build/Host lifecycle fits the assigned window; it is not a bypass of the queue.
- On a Mac, verify native UI with Callstack's `agent-device` on the iOS Simulator: open the development build, read its accessibility snapshot, act by ref, and save a screenshot. The commands are in [the mobile README](../../apps/mobile/README.md) ("Drive it on the iOS Simulator").
- Regression flows live in [`apps/mobile/.maestro/`](../../apps/mobile/.maestro/) and run with `pnpm --filter @botharness/mobile e2e:ios`. Target elements by their visible text from the snapshot, not by coordinates.
- For a read-only health check of the running dev build, run Expo's experimental agent CLI as `npx --yes @expo/agent-cli@1.0.20 <command>` from `apps/mobile` with `EXPO_NO_TELEMETRY=1`. It assumes it owns the worktree's devices and builds, so on the shared Simulator name both targets explicitly: `status` takes `--device <udid>`, and the `runtime:*` commands and `smoke` take `--dev-server-url http://127.0.0.1:<port>` (`smoke` also accepts `--port <port>`). Without them it reports no device and misses Metro outside 8081–8085.
  - `status --device <udid> --json`: whether the installed build is stale (`rebuild-required` / `hash-mismatch`).
  - `runtime:errors --dev-server-url http://127.0.0.1:<port> --json` and the same flags on `runtime:tree`: runtime errors and the interactive nodes on screen, with their `testID`s.
  - `smoke --ios --no-start --no-reload --port <port> --json`: one exit code for "the app is connected and threw nothing". `--no-start` keeps it from starting Metro, a Simulator or Expo Go.
  - Never run `agents:setup`, `new`, `install`, `deploy` or anything with `--eas`: they rewrite `AGENTS.md`/`CLAUDE.md`, change dependencies or spend EAS credits.
- Native devices and QA Hosts are shared by every agent. Read [shared device QA](./device-qa.md) before builds or device interaction; it routes Mac/iOS and Windows/Android to their own batch queues. Windows emulator/USB phone control and scrcpy evidence use `scripts/android-qa.mjs` from the repo root.
- Screenshots, recordings and release image retention follow [local QA evidence](./qa-evidence.md): index each platform's actual source/build and results in the main checkout, and retain accepted evidence outside disposable worktrees.
- Cloud sessions have no simulator. They use the web screenshots ("Screenshots without a phone") and reach a Mac through Remote Control for native checks.

## Mobile check commands

```bash
pnpm --filter @botharness/mobile typecheck
pnpm vitest run apps/mobile
pnpm --filter @botharness/mobile expo:doctor          # expo-doctor; two checks need the Expo API
EXPO_OFFLINE=1 pnpm --filter @botharness/mobile export
```
