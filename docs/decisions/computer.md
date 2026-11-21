# Computer decisions

How PersonaBots use a desktop: the shared Computer, who may act on it and how the Human takes over, where it runs, how its data is stored and moved, and how the Human watches it from the phone. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); who answers an approval is in [Approval decisions](approvals.md); the managed browser is in [Browser decisions](browser.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0050, 0051, 0052, 0055, 0058, 0062, 0079, 0080, 0082, 0083, 0209, 0210 and 0245, and each section lists the ADRs it absorbed.

Two rules run through every section:

- **The isolation boundary is the profile, never a PersonaBot.** One Computer serves every PersonaBot of a profile, with one set of files, browser sign-ins and CLI credentials. Window ownership scopes what a Bot sees and does; it never separates one Bot's permissions from another's.
- **Pause is Computer-wide and blocks screenshots as well as actions.** Input and screenshots are desktop-wide, so when the Human takes over, every PersonaBot on that Computer stops, and no Bot sees the screen until the Human hands it back. On Windows and macOS the pause is durable and only an explicit resume ends it; on the Linux local target it is a 30-second lease that lapses when the phone stops polling (section 5).

## 1. An optional package on the official computer-use seam

<a id="adr-0050"></a>
<a id="adr-0079"></a>
_Formerly ADR-0050 and ADR-0079._

`@botharness/computer` is an optional standalone package. It registers its own provider, `botharness-computer`, on the official `@deepseek-ai/dsh-computer-use` seam, and drives the desktop through a version-pinned `cua-driver` over stdio MCP. The model sees a curated tool set (`computer_list_windows`, `computer_get_desktop_state`, `computer_get_window_state`, `computer_launch_app`, `computer_click`, `computer_type_text`, `computer_press_key`, `computer_hotkey`, `computer_scroll`, `computer_verify_state`), not every tool the driver exposes. A profile without the package has no Computer and loses nothing else.

Why: the official seam keeps the tool, prompt and approval wiring that DSH already maintains. Owning the provider keeps the driver pin, the curated catalog, audit, pause and per-Bot Access in BotHarness, where the product rules live.

Enforced by: `packages/computer/test/computer-tools.test.ts`, `driver-lifecycle.test.ts`, `local-driver-contract.test.ts`.

## 2. One Computer per profile, with Access per Bot and Authorization per Session

<a id="adr-0051"></a>
<a id="adr-0080"></a>
<a id="adr-0083"></a>
_Formerly ADR-0051, ADR-0080 and ADR-0083._

A **Computer** is a durable resource of the profile. Every PersonaBot of the profile shares its files, its one browser process and its sign-ins, so "help it log in" happens once. A Bot's work surface is its **Bot Screen**: the windows it opened. The tool layer scopes observation and action to those windows, and the audit attributes every action to its Bot. A shell inside the Computer can still see more, which is why window ownership is a visibility scope and not a security boundary. Per-Bot virtual displays were recorded as an experimental opt-in and are not built: XFCE unmaps windows on workspaces that are not shown, so several Bots on one display work one after another, not in parallel.

**Computer Access** is a per-PersonaBot preference on its record, off by default. When it is on, the Computer tools and guidance are registered only in that Bot's own Sessions. **Computer Authorization** is per Session and Human-owned: the first Computer call in a Session asks the Human, unless the `autoAllowActions` setting is on. Changing the Computer Target revokes earlier grants.

**Audit** records each call's Bot, Session, role, tool, a short summary, outcome and duration. The summary never contains typed text or a screenshot: `type_text` records `chars=N`, and `verify_state` records the predicate length only.

Why: a Bot's value is handing work to another Bot without repeating sign-ins or moving files. Per-Bot desktops, browser profiles, OS users or microVMs would make every Bot sign in again and still could not hide shared credentials. Per-Bot Takeover was rejected because the Human's typing would stay visible to every other Bot.

Enforced by: `packages/computer/test/computer-audit.property.test.ts` (for any arguments, no tool's audit summary contains the typed text or predicate, and `type_text` records only its length), `computer-tools.test.ts` (Access, Authorization, pause refusals), `permission-settings.test.ts`.

## 3. Local by default, container for headless hosts, under hard bounds

<a id="adr-0055"></a>
<a id="adr-0082"></a>
_Formerly ADR-0055 and ADR-0082._

The **Computer Target** is a profile setting. `local` (the default) drives the Human's own Mac, Windows or Linux desktop through a host `cua-driver` installed under `~/.botharness/`, using the operating system's Screen Recording and Accessibility grants. `container` runs the upstream `lscr.io/linuxserver/webtop:ubuntu-xfce` image for headless hosts, pulled as is, with these bounds: 2 CPUs, 4 GiB memory with swap equal to memory (no extra swap), 512 MiB shared memory, 4096 pids, and an idle stop after 30 minutes (configurable). The Host checks a running container against the bounds and recreates it when they differ. The local target has no container, no volume and no export.

Why: most Humans want a Bot to use the apps and sign-ins they already have, so local is the default. The container exists for VPS hosts and for Humans who want the Bot off their own screen. The upstream image avoids maintaining a desktop image of our own. The hard bounds stop a runaway browser from taking down the Host. Memory rose from the original 2 GiB because Chromium and XFCE ran near that limit.

Enforced by: `packages/computer/test/docker-provider.test.ts`, `local-computer.test.ts`, `idle.test.ts`, `local-display.test.ts`.

## 4. Settings are runtime settings; storage is a named volume; export quiesces the browser

<a id="adr-0052"></a>
<a id="adr-0058"></a>
<a id="adr-0062"></a>
_Formerly ADR-0052, ADR-0058 and ADR-0062._

The Human-editable Computer fields (`target`, `exportDir`, `idleStopMinutes`, `autoAllowActions`) live in the `botharness-computer` settings namespace, with the plugin config as the base layer. They are read at call time, so an edit applies without a restart. Fields that shape the machine (image, resources, hardening) stay plugin config. The Computer's rows render in the BotHarness settings section through the `botharness.settings.item` child slot, so `@botharness/client` never imports the Computer. The export directory is picked with the Host's own directory picker.

The container's live store is a Docker named volume by default. A bind mount is used only when the Human sets `dataDir` and the Host runs Linux; on other platforms `dataDir` is ignored with a notice and the named volume stays. Durable work lives in `~/workspace`, which is on that store. **Computer Export** sends Chromium a SIGTERM and waits up to about 10 seconds; the quiesce is best effort, so the export continues if Chromium is still running after that. It then stops the container, writes one archive of the named volume to the export directory, and starts the container again. **Import** creates the named volume if it is missing and extracts the archive into it without clearing what is already there. Export and import always work on the named volume, so they do not cover a Linux `dataDir` bind mount; data there is moved by hand. Both need explicit authorization, and the Host refuses archive names that leave the export directory. Computer data is profile-scoped, so it travels with a profile backup or transfer, never with a single PersonaBot export.

Why: bind mounts on Docker Desktop and Colima pass through a file server where `flock` and SQLite WAL are unreliable, and Chrome's profile databases corrupt there. The quiesce makes the stopped snapshot consistent, because `docker stop` signals PID 1, which does not reliably stop Chromium. An export or import is a choice a Human makes while looking at the feature, so it must not need a restart.

Enforced by: `packages/computer/test/archive.test.ts`, `export-dir.test.ts`, `transfer-io.test.ts`, `transfer-tokens.test.ts`, `settings-rows.test.ts`, `settings-import-menu.test.ts`.

## 5. Watching and taking over from the phone

<a id="adr-0209"></a>
<a id="adr-0210"></a>
<a id="adr-0245"></a>
_Formerly ADR-0209, ADR-0210 and ADR-0245._

**Container target.** The container streams through Selkies over WebSockets. When the Host has a tailnet address, the container is also configured for WebRTC. A phone call to `/api/computer/webrtc/signaling` switches it to WebRTC for the length of the call. The Host relays media on the tailnet address only and drops senders outside `100.64.0.0/10`; there is no STUN or TURN server. Closing the last call switches back to WebSockets. Every refusal (`not-running`, `tailnet-unavailable`, `tailnet-changed`, `media-port-busy` and others) tells the phone to keep the WebSocket viewer.

**Local target on Windows and macOS.** The Local Computer video owner serves WebRTC video from a supervised Electron 44.9.3 helper. There is no JPEG or PNG fallback: when video fails, the viewer shows an unavailable or reconnecting state with retry and TURN guidance. The Human may configure their own TURN; the project supplies none. Observation, control and pause are separate lifetimes:

- **Observation** admits a viewer without pausing Bots or granting input.
- **Control** belongs to at most one viewer. Each grant has a fresh generation that the Host checks when an input runs, so a late input from an old grant is refused, not replayed. A lost control connection keeps its reservation for at most 30 seconds; after that, control is released and Bots stay paused.
- **Pause** applies to every PersonaBot on the Computer and blocks their screenshots as well as their actions. A **Takeover** (taking control) first writes the pause atomically to a durable record and drains Bot calls already running; if either step fails, the Human gets no control. The pause survives control release, helper failure and Host restart, and only an explicit resume ends it. Continuous scroll is capped at 200 px/s on each axis.

On this target the old frame, takeover and input routes refuse, so a bare `active: true` request cannot bypass the owner.

**Local target on Linux.** The phone still uses the screenshot stream. `GET /api/computer/frame` long-polls single-flight captures of at most 1600 px, sent as JPEG at quality 70. `POST /api/computer/takeover` pauses every Bot and drains running calls for up to 10 seconds. `POST /api/computer/input` works only while paused. That pause is a 30-second lease renewed by polls and input.

In every mode, Human input is recorded as a `computer-action` with its kind and character count, never the typed text, and frames are never stored. A Bot that needs the Human asks with a non-blocking [Takeover Handoff](../../GLOSSARY.md) (`takeover_request` with target `computer`), which requires Computer Access.

Why: a Human who is away from the desk needs to sign in or answer a captcha without installing a separate remote-desktop app. Video separates watching from controlling, so watching never pauses a Bot. A durable pause means a closed app or a crashed helper cannot hand the desktop back while the Human is typing a password. Dropping the image fallback avoids a second transport lifecycle and silent image traffic through Connect.

Enforced by: `packages/computer/test/computer-audit.property.test.ts` (for any write sequence, the pause record reads back the last value written and leaves no temporary file; any other file content is refused, never read as a pause state), `local-video-owner.test.ts`, `local-video-owner-scroll.test.ts`, `local-video-client.test.ts`, `desktop-view.test.ts`, `viewer.test.ts`, `viewer-state.test.ts`, `macos-scroll.test.ts`.
