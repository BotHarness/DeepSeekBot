---
Status: Accepted
Date: 2026-09-28
---

# Computer Target is profile-scoped: local by default, container for headless hosts

The Computer a profile's PersonaBots share gets a **Computer Target**: `local` (default) or `container`, set once per profile in Bot settings. A **Local Computer** is served by the machine running DSH itself — the same pinned `cua-driver` binary, installed on the host under `~/.botharness/`, spawned directly over stdio MCP, with no Docker involved. A **Container Computer** is today's Docker desktop stack (Selkies viewer, export/import, idle stop), and it is the recommended target when the host has no interactive desktop (a headless VPS), because maintaining a containerless X/desktop stack on such a host would duplicate the container's packaging, supervision, and isolation for no user-visible gain.

Per-PersonaBot **Computer Access** stays in that PersonaBot's Channel sidebar and remains orthogonal: Access decides whether one Bot may use the Computer; Target decides where the Computer is. The single official `ctx.computerUse` slot stays with the BotHarness-owned provider (ADR-0079); the target is an internal driver-target strategy, never a provider swap. The host driver path follows the container's rules: pinned version and checksum, telemetry and update checks off. macOS ships first; TCC (Accessibility, Screen Recording) is surfaced as guidance and verified by `cua-driver doctor` rather than silently retried. A Local Computer has no viewer: the Human is at the machine, so model login requests stay in the DM and the Human acts on their own screen.

The VPS deployment path is a decoupled installer — dependencies, profile (with `deepseekbot` and `@botharness/computer`, target `container`), and a persistent service — where remote access is an optional step (Tailscale, Cloudflare Tunnel, a reverse proxy, or a plain port), following the remote-access research rather than baking in one vendor.

## Why

- Most users run no Docker; a container-only Computer is unavailable to exactly the audience the product targets, while a desktop install already has a computer.
- Headless hosts invert the argument: their default has no display at all, so the container is the cheaper way to have a desktop, and the VPS path should choose `container` explicitly.
- A Computer is profile-scoped and shared (ADR-0051); a per-PersonaBot target would fragment sharing, logins, and the one provider slot.
- The official experimental native provider adds an experimental dependency, the global-slot problem, and a terminal activation failure for the same driver binary our provider already speaks to (ADR-0079).

## Considered options

- **Container-only** — rejected: excludes no-Docker users and contradicts the requested default.
- **Per-PersonaBot target** — rejected: fragments the shared Computer and its login story.
- **Containerless desktop stack on headless hosts** — rejected: duplicates the container with more operational surface, no user-visible gain.
- **Official experimental native provider for local** — rejected for the same reasons as ADR-0079.

## Consequences

- The desktop geometry becomes a configuration value with a low default (1280×800 first choice, 1024×768 the floor): the measured ~530 MB framebuffer cost is the image's `MAX_RES` maximum geometry, while the actual resolution drives Selkies encoding CPU and model screenshot payload.
- The computer bundle must not require Docker on the local path; Docker is probed only when the target is `container`.
- Local permission failures surface through the settings row and `doctor`, never as silent retries.
- Existing profiles keep any explicit target; fresh installs default to `local`.
- The installer and its access-method variants become their own deliverable (tracer), not part of this package.

## First macOS delivery

The Bundle supplies `target: local` for fresh compositions. The schema fallback remains `container` for legacy saved Computer config objects that predate the target field, because a Patch replaces the whole config object. Explicit selections are persisted through DSH configForms as a volatile Profile value. `loader/volatile-update` triggers the owning runtime to close the old driver and stop the old target, reset the cached tool catalog and session grants, then select the new internal strategy. Approval decisions carry an opaque target revision so a decision awaiting Human input cannot authorize a newly selected desktop.

The pinned macOS universal binary and its runtime libraries are checked against committed SHA-256 values before execution. Its `mcp --direct --embedded` process inherits the DSH Host app's TCC identity; there is no standalone daemon or separate driver permission grant. `doctor --json` verifies installation, while `check_permissions({prompt:false})` reads Accessibility and Screen Recording. These checks do not prove direct screenshot capture readiness: the first real observation/action must still succeed, and native failures are not retried. Local setup is explicit through **Check permissions**, with no Docker probe, idle-stop policy, viewer or archive routes in the local path.

## Linux and Windows delivery (#1632)

The Human's direction supersedes "container for headless hosts" as the only Linux path: a Windows or macOS Host is usually the Human's own computer, a Linux Host is usually a server, and all three use the Local Computer directly. Container Computer stays available and is still the choice when the Human needs a watchable, isolated desktop.

Each supported Host pins one upstream `cua-driver-rs` build (`darwin-universal`, `linux-x86_64`, `linux-arm64`, `windows-x86_64`, `windows-arm64`) with the release archive SHA-256 and the SHA-256 of every file kept from it; any other Host is refused before download. Readiness is per OS: macOS reads Accessibility and Screen Recording; Linux needs a reachable X11 or Wayland display; Windows needs no grant because UI Automation is unprivileged. Only the macOS driver accepts the `prompt` argument of `check_permissions`.

A Linux Host started without `DISPLAY` or `WAYLAND_DISPLAY` gets a private desktop owned by the Local Computer: Xvfb on a display it picks itself, a D-Bus session bus so AT-SPI trees are populated, and the first available window manager, because foreground input to Chromium needs an active window. The driver child and the apps it launches receive that `DISPLAY` and bus address; closing the driver stops the desktop. A Host without Xvfb or a window manager is refused with one install line rather than a partial desktop. A Host whose `DISPLAY` is a bare X server, such as a server Xvfb shared with the Bot Browser (no `XDG_CURRENT_DESKTOP` or `DESKTOP_SESSION`), is reused rather than duplicated: the Local Computer starts a window manager on that display, plus a D-Bus session when none is set, and if a window manager is already running there it leaves it alone. Both stop with the driver. A real desktop session (Wayland, or X11 with a desktop name) is used as is. That desktop has no viewer yet, so a login a Bot needs on a Linux server is still a gap the Human has to solve another way.
