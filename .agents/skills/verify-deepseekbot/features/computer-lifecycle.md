# Container Computer lifecycle

## Sub-features

Behavior `desktop.computer.container-start-frame-stop`: desktop Web + existing CLI,
English/dark, 1440 × 1100. Start one fresh Profile's Container Computer, see its actual
1280 × 800 test desktop in the Computer panel and CLI frame, then stop the same instance.
This is a candidate recipe until a complete exact-source runtime packet qualifies it.
At initial #1977 preflight, Docker Engine returned EOF; that is **blocked**, not pass.

The Computer is shared within its Profile; it is not owned exclusively by a PersonaBot.
The disposable PersonaBot identifies the selected Client panel. Local Computer, desktop
input, takeover, imports/exports, phone WebRTC, model execution and #1833/#1799 are excluded.

## How to get to it (user POV)

Bot mode → select the new **AX Computer …** PersonaBot → **Computer**. Inspect Access off,
then **Enable Computer Access** → **Start** → read **Authorize and start** → confirm.
The target must be **Docker Computer**. The running panel must show the actual test window
**AX Container Computer 1977**, whose text names this task's container. Connecting, a blank
viewer, a reachable port or a running container alone cannot satisfy the image check.

The fixture is a harmless `xmessage` window launched inside this task's new container as
its desktop user, with no input injection. Do not click the fixture's OK button or enable
viewer input. Its existing window utility must be available; do not install missing tools.
Click **Stop** in the real panel. The same container must be stopped and a subsequent
`computer-frame` read must return `not-running` without restarting it.

## Driving it with verify-app

Use a clean committed worktree, locked dependencies, Chromium, an already running Docker
Engine and the existing `lscr.io/linuxserver/webtop:ubuntu-xfce` image. Do not install or
restart shared system services, download a substitute image or switch to Local Computer
when a prerequisite fails. Ask the Human to restore the existing environment. Never
operate a pre-existing container or volume; preparation refuses name collisions.

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/prepare-computer-lifecycle.mjs --name ax1977-your-unique-task
node scripts/verify-app.mjs doctor --name ax1977-your-unique-task
node scripts/e2e-computer-lifecycle.mjs --name ax1977-your-unique-task
```

Preparation uses the pinned native DSH Profile initializer and `verify-app` launcher.
It records absent task names, pins the already present image ID, then writes a normal
Profile Patch selecting Container, a unique container/volume, a free loopback port and
1280 × 800. It preserves native patch rows. It does not create a product test API or enable
Local Computer. Use a fresh name for every independent lifecycle attempt; the path expects
its container to be absent initially. Keep failed attempts and their first failure files.

After the Web actions, existing `computer-status`, `computer-frame`,
`computer-diagnostics` and `computer-logs --plugin computer` record the same Host capability.
Read-only Docker inspection correlates container ID, image and `/config` volume before and
after Stop; it never substitutes for the panel picture. Four Web screenshots/ARIA snapshots,
CLI frame, Client diagnostics, console/HTTP observations and cleanup reads are hash-bound.

Inspect every image and ARIA snapshot, confirm the marker in both panel and frame, then:

```bash
node scripts/computer-lifecycle-report.mjs <attempt> --visual-review pass \
  --reviewer Codex --note "Inspected all four Web states and the CLI frame; the same task marker is visible."
node scripts/verification-report.mjs --computer-run <attempt>
```

Use `--visual-review fail` for a mismatch. No selected attempt is **not-run**; missing
prerequisites are **blocked**; failed actions are **fail**. Missing/changed evidence, dirty
source or a different commit becomes **needs-revalidation**. Shell/API readiness and a
synthetic regression fixture never constitute visual qualification.

The runner stops only the explicitly configured task Computer after a start attempt,
including failures, and closes its own Web browser. Inspect `cleanup-computer.json` and
`cleanup-observation.json`. Stop the launcher's exact owned Host PID after checking its
worktree/Profile identity; retain the Profile, container volume and evidence. Do not use
`verify-app stop`, which deletes the Profile. Do not prune Docker or remove other tasks'
resources. If preparation fails before Host launch, no Host cleanup is necessary.

Publish a reviewed, redacted immutable packet using the [sharing guide](../../../../docs/agents/verification-inventory.md)
and `--computer-evidence-prefix ./verified`. Keep login tokens, credential files, private
paths and unrelated Docker inspection out of it. Human QA follows the same fresh-name
recipe; agent visual inspection, CI, model, native-device and IM results remain separate.

## Gotchas

- A Docker socket returning HTTP 200 with an empty body is not an Engine health result;
  require a parsed server version and successful read-only inventory. The first #1977
  preflight preserved this exact failure without restarting the shared environment.
- Access does not start a Computer. Start confirmation authorizes the ordinary Host action;
  do not set global auto-allow or silently broaden the target.
- If the viewer never becomes live, save the first screenshot, ARIA, diagnostics and HTTP
  errors. A reconnect/retry is a separate attempt, not permission to erase that failure.
- A stopped frame refusal is distinct from Docker missing, Host unavailable or a failed
  capture. Save status before and after the refused read to prove it did not start anything.
- A test window without readable panel/frame evidence is not pass. Review the task marker,
  not only matching screenshot dimensions. Retain failed fixture preparation too.
- Read the [observation guide](../references/observation.md) after any surprise. Do not
  infer Human QA or full Computer capability from this one Container lifecycle row.
