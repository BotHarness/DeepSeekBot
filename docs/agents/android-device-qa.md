# Shared Windows Android QA

Use this lane on Windows 11 before starting an emulator, native build, Metro, QA Host, or
interacting with the shared Android phone. It follows the owner-cut batches in
[shared device QA](device-qa.md); the Mac keeps its own queue. Windows runs **one batch runner
at a time**, including phone checks: the emulator and phone share Gradle, Metro and Host resources.

## Submit and cut a batch

1. Run `pwsh -NoProfile -File scripts/android-qa.ps1 init` from any checkout. It creates the
   queue and machine configuration once, without overwriting existing files. All linked Git
   worktrees resolve the same main-checkout `.humanlayer/device-qa/windows/` directory through
   `git rev-parse --git-common-dir`. Independent clones must use the same explicit `-QueueRoot`.
2. Read `queue.md` there. The Human or requesting session names the queue owner. Agents add
   only their own requests under **Next batch**: issue/PR, branch and head SHA, task/report
   destination, native inputs changed, emulator/phone, feature-map steps and evidence required.
   Mark model, second Host, FCM, camera, haptics and Human prerequisites explicitly.
3. The owner freezes a batch and names one runner. Use local branches
   `qa/windows-batch-<n>` and an assigned worktree, based on freshly fetched `origin/main`.
   Merge open PR heads once. Conflicts return to the PR agents; they are not fixed in the batch.
   New requests wait for the next batch. Record the tested batch SHA and each PR head.
4. The runner claims the resources using its stable task ID and the explicit ADB serial:

   ```powershell
   $runner = '<stable-task-id>'
   $batch = 'windows-batch-1'
   $qa = 'scripts/android-qa.ps1'
   pwsh -NoProfile -File $qa devices
   pwsh -NoProfile -File $qa claim -Owner $runner -Batch $batch -Lane emulator -Serial emulator-5580
   ```

   `active.json` is created exclusively; a concurrent claim fails. Device operations require
   the matching owner, batch and worktree. The serial, lane and Metro port are pinned by the
   claim. The helper checks the real device type before installation, capture or control.
   `claim` records the owner's scheduling decision; it does not infer permission from a PR label.

5. Run the entries in order, report their results, stop only the runner's processes and remove
   only its exact ADB reverse mappings. Then `release -Owner $runner -Batch $batch`.
   To switch to the phone, release and claim again with `-Lane phone -Serial <serial>`.

`status` is read-only. An abandoned lease is **not** reclaimed on a timeout: the queue owner
checks the recorded worktree and task, confirms builds/recordings/Metro/Host have stopped, then
removes that exact `active.json` and records the handoff. Never kill the global ADB server,
Gradle daemons, other emulators or another agent's Host to take a turn.

## Machine configuration and builds

Edit the gitignored `config.json` reported by `init`. It reads `ANDROID_HOME` (then
`ANDROID_SDK_ROOT`), `GRADLE_USER_HOME`, `JAVA_HOME` and scrcpy on PATH for initial defaults.
Existing D-drive locations remain in use; the helper does not move caches or change user/global
environment variables. SDK, Gradle cache, AVD, JDK, device serials and tailnet details stay local.

- `sdk`: the existing Android SDK root, with `platform-tools`, `emulator`, build tools and NDK.
- `gradleHome`: the shared Gradle cache. `javaHome`: the JDK 17 installation (not PATH's Java).
- `avd` / `emulatorPort`: the shared AVD and port, matching the claimed serial. Inventory with
  `& "$env:ANDROID_HOME/emulator/emulator.exe" -list-avds`. Do not create another AVD to skip a queue.
- `nativeRoot`: a short absolute local path for CMake output, such as `D:/bh-ax-native`.
  The helper adds a worktree hash and project name to isolate outputs between checkouts.
- `cmakeVersion`: installed CMake version; its Ninja must support Windows long paths (1.12+).
  The pnpm paths can exceed 260 characters even with short CMake staging. Upgrade from an
  official [Ninja release](https://github.com/ninja-build/ninja/releases), verify its checksum
  and retain the SDK binary backup. Generated native projects remain disposable CNG output.
- `scrcpy`: absolute path to an official **5.0 or newer** executable. PATH may still select an
  older Scoop copy. Use the [official Windows release](https://github.com/Genymobile/scrcpy/blob/master/doc/windows.md),
  verify the asset SHA-256, and run that exact executable's `--version`.

Keep the physical batch worktree root at most 30 characters long (for example `D:/bhqa/1`).
AGP launches `prefab_command.bat` below pnpm's dependency directory through Windows; a 260-character
path failed with `CreateProcess error=2` even though the file existed. Short CMake staging and
Ninja alone do not shorten that launch path. The helper refuses long worktree roots before
prebuild. When relocating a task worktree, stop its emulator first: the emulator can retain the
working directory and prevent Windows from renaming it.

Install the pinned Node/pnpm workspace dependencies in the assigned checkout first. Run these
from that checkout, passing the claim identity on every operation:

```powershell
pwsh -NoProfile -File $qa emulator -Owner $runner -Batch $batch
# Wait until adb -s <serial> shell getprop sys.boot_completed returns 1.
pwsh -NoProfile -File $qa build -Owner $runner -Batch $batch
pwsh -NoProfile -File $qa install -Owner $runner -Batch $batch
# In a separate terminal, keep the same identity and checkout:
pwsh -NoProfile -File $qa metro -Owner $runner -Batch $batch
pwsh -NoProfile -File $qa open -Owner $runner -Batch $batch
```

`build` runs Expo prebuild for Android, then the generated Gradle wrapper with CMake staging
and the **selected device's ABI**. An x86_64 emulator APK does not qualify an arm64 phone.
Keep the Gradle output in the batch's local evidence. One build runs at a time; check D-drive
free space first. Do not delete shared caches or generated files another build uses.

Native input changes (`app.json` native fields, config plugins, Expo/RN or native dependency
versions) require a rebuild; check the batch base as well as its PRs. JS-only batches may reuse
a dev client only after recording its build provenance/native compatibility. `metro` deliberately
sets `CI=1` to disable the watcher that timed out on this Windows checkout: restart Metro after
source changes. It also sets Node's DNS order to `ipv4first`: a Metro listening only on `::1`
left a USB phone stuck loading because ADB reverse targeted IPv4. Check
`http://127.0.0.1:<metro-port>/status` before opening the phone. The claim's `-MetroPort`
(default 8085) must be free; never take another runner's port.
No EAS initialization, Expo account or cloud build is needed for this local debug workflow.
`open` restarts only the development app process before opening its Metro link, so a previous
failed connection is not reused; it preserves app data and pairing credentials.

## Dedicated Host and pairing

Use the existing [verified Host launcher](../../.agents/skills/verify-deepseekbot/SKILL.md)
from the batch worktree, with one named instance such as `windows-batch-1`; run `pnpm build`
first. Record the instance name, home, port, process PID and commit in the local queue.
Use `verify-app doctor` before driving and `observe` after a surprising result. Credentials
follow [AX model setup](ax-model.md); do not copy an old task's patched launcher or credentials.

The helper's `open` reverses only the Metro port. For a USB debug test, additionally forward
the dedicated Host's port with the **configured SDK's** ADB:

```powershell
& $adb -s $serial reverse "tcp:$hostPort" "tcp:$hostPort"
# At cleanup, remove only this batch's mappings:
& $adb -s $serial reverse --remove "tcp:$hostPort"
& $adb -s $serial reverse --remove "tcp:$metroPort"
```

Pair through a fresh one-time offer made by `scripts/e2e-device-pairing.mjs` or Bot settings →
Devices. Deep-link injection is a debug path; it does not verify camera QR scanning. Treat the
offer link as a credential: no command history, screenshots, video, chat or published logs.
ADB reverse disappears on disconnect and proves no external connectivity. Phone tests without
USB need the supported HTTPS route over Tailscale or the
[phone QA tunnel runbook](phone-qa-tunnel.md); keep the Host loopback-bound. Save and restore
existing route state before changing a shared proxy.

## Phone control, screenshots and video

The Human connects/unlocks the phone, enables USB debugging and accepts the RSA authorization.
Use `devices` to distinguish `device`, `unauthorized` and `offline`; the helper never chooses
the first device automatically. Install only the development application ID, preserving the
Human's production app/data. Replacing an existing dev build is part of the device lane.

```powershell
# Run after the phone claim; these commands work in either lane.
pwsh -NoProfile -File $qa mirror -Owner $runner -Batch $batch
pwsh -NoProfile -File $qa screenshot -Owner $runner -Batch $batch -Label chats-light
# Close an existing mirror first. Recording opens its own controllable window.
pwsh -NoProfile -File $qa record -Owner $runner -Batch $batch -Label chat-flow -Seconds 30
```

`mirror` opens scrcpy for keyboard/mouse control. `record` opens one window with control and
H.264 recording, without audio. Use one scrcpy process per device: simultaneous mirror and
recorder connections failed on the QA phone. Add `-ViewOnly` to either command for viewing or
recording without computer input. Both pin the same SDK ADB and serial.
The recorder times out cleanly, finalizing the MP4. `screenshot` saves a binary PNG and a
UI Automator XML snapshot. Capture refuses to start unless DeepSeekBot is the focused app;
finish system prompts before retrying. Evidence and commit/serial manifests live under
`<queue-root>/evidence/<batch>/<lane>/`; lifecycle phases go to bounded JSONL entries in
`events.jsonl`. These are private process evidence, not a second test-status authority.

Drive by accessible labels from the XML using a device automation tool or the existing
Android-compatible Maestro flows; scrcpy supplies the visible control surface and video.
An ADB input command exiting successfully is not proof of a gesture. On the QA phone,
MIUI logged `input event inject fail` while the command still exited zero. Require visible
movement or native scroll events inside the sampled interval before reporting scrolling FPS;
an empty or stationary interval is unqualified. Keep the failure evidence and ask the Human
to try the same gesture on the phone to distinguish injection failure from an app problem.
The iOS `simctl push` journey in `e2e-mobile-sim.mjs` is not an Android test runner. Keep phone
captures inside the QA app, enable the Human's preferred notification privacy, and inspect
frames before sharing. Redact serials, account names, hostnames, paths, personal notifications,
pairing links and tokens. Publish only redacted evidence under the existing PR evidence rules.

On Xiaomi/POCO, ordinary USB debugging can allow video while computer input fails with
`INJECT_EVENTS`. The Human must enable the separate **USB debugging (Security Settings)**
option and reboot, then reconnect and authorize ADB. Until then, `-ViewOnly` still supports
captures while the Human operates the phone; report computer control as untested.

For every [feature-map](../../.agents/skills/verify-deepseekbot/features/README.md) step, record
the action, visible result and canonical Host fact. Report **pass / fail / untested** per lane
with PR head, batch SHA, build ABI/provenance and screenshot/video paths. A successful mirror
or screenshot is tool verification, not proof that the product journey works. Real FCM needs
an appropriately configured build/device; camera, microphone, haptics, background delivery and
notification decisions need their own phone result. Leave system permissions, biometrics and
final approval decisions to the Human. Failures return to the PR and recheck in the next batch.

The pairing screen has a real Android regression journey:
`node scripts/e2e-mobile-pair-android.mjs --serial <serial> --owner <task> --batch <batch>`.
It checks the input and button against the system IME bounds, preserving a screenshot and
machine-readable failure if either is obscured. The field must be empty before this capture.
After a Human scans or pastes a fresh offer from the isolated QA Host, add
`--paired --instance <private-json> --expect-bot <name>` to verify its single live device,
visible Host/Bot roster and app process restart. The paired check does not capture an input
field or generate/type a link. Chinese IMEs can compose ADB hardware-key injection, so do
not rely on `adb input text` for a pairing URL. For USB transport, explicitly map a free
phone loopback port to the isolated Host and use that origin in the offer routes. Keep the
Host and exact reverse mapping for a Human handoff, or stop only that Host and remove only
that mapping after the run. Host restart, revoke and real notifications need separate proof.

Sources: [scrcpy capabilities and prerequisites](https://github.com/Genymobile/scrcpy),
[recording options](https://github.com/Genymobile/scrcpy/blob/master/doc/recording.md),
[ADB device selection / reverse](https://developer.android.com/tools/adb),
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
