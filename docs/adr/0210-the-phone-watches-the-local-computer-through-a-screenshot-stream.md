---
Status: Accepted
Date: 2026-10-14
Issues: [#1832](https://github.com/BotHarness/DeepSeekBot/issues/1832), [#1833](https://github.com/BotHarness/DeepSeekBot/issues/1833)
---

# The phone watches the local Computer through a screenshot stream

> Amends the living architecture's "the local target has no viewer": the Host now serves one to the phone.

> Design update (2026-10-22): [ADR-0245](0245-local-computer-video-separates-media-control-and-pause.md) replaces the planned Local Computer video migration with video-only viewing, optional user-configured TURN, exclusive control and a pause that survives control expiry and Host restart. This ADR remains the history of the screenshot implementation; its expiring-pause behavior is not the new viewer's target behavior. The design update does not claim a completed runtime migration.

A Bot that uses the local Computer Target drives the Human's own Mac, Windows or Linux desktop through `cua-driver`. When it needs the Human (a login, a captcha, a confirmation), the Human may be away from that desk with only the phone. The container target already has a Selkies viewer; the local target had none. A separate remote desktop app (RustDesk, VNC) would need another install, another pairing and an app switch at exactly the moment the Bot asks for help, which the owner ruled out.

## Decision

The Host serves the local desktop to the phone itself, in two steps.

1. **Screenshot stream (#1832, this change).** `GET /api/computer/frame?after=<seq>` long-polls the existing driver's `get_desktop_state`: captures are single-flight and paced (150 ms), capped at 1600 px on the long edge in the viewer's own driver session (so a Retina screen is not sent at full size, and the phone's coordinates map back without touching the Bot's session), a changed frame is re-encoded as JPEG (quality 70) before it is sent, a frame identical to the last is not republished, and the route answers 204 after 10 s without a change. `POST /api/computer/input` sends click, scroll, type and key input through the driver's desktop-scope tools. The mobile app's **Computer** button opens a native screen that reuses the Browser viewer's stage; **Pause Bot and take control** enables input. The routes have `deepseekbot computer-frame`, `computer-takeover` and `computer-input` commands.
2. **WebRTC helper (#1833, later).** A hardware-encoded video track for moving content, once the screenshot stream's limits matter in practice.

No new port or permission: the stream goes over the phone's existing Host connection, and the capture reuses the driver's Screen Recording and Accessibility grants. The JPEG step uses `sharp`, which the Host already installs for attachments; if it cannot load, frames stay PNG.

## Evidence

The A/B test in [the research note](../research/2026-10-14-local-computer-frame-stream-ab.md) measured glass-to-glass latency with a clock drawn on screen:

- On a mostly static screen the stream runs at about 6 fps, 165 ms p50, 1.5 Mbps. That is enough for a Human to read a prompt and click.
- On a moving screen it drops to 1.5 fps, 650 ms p50, 13 Mbps (about 1 MB per PNG). WebRTC on the same scenes ran at 28–34 fps and 30–80 ms p50, at the cost of 25–100% of a core for encoding. That gap is why #1833 stays open.

## Consequences

- **Take control pauses the Bot.** `POST /api/computer/takeover` sets a pause that refuses every Bot Computer tool call, screenshots included, so the Bot cannot move focus or read the screen while the Human types a password. Taking control waits (up to 10 s) for Bot calls already in progress to finish, and a Bot call that finishes after the pause started is refused, so a screenshot taken in that window never reaches the Bot. Human input is refused unless the pause is on. The pause is a lease: frame polls and input renew it, and it lapses 30 s after the phone stops, so a closed app cannot leave the Bot stuck. The Computer is shared by the profile, so the pause applies to every Bot.
- The phone has a password keyboard. It is a secure text field: no echo, no predictive text, and the system can offer saved passwords. Characters go straight to the driver's `type_text`.
- Every input is recorded in diagnostics as a `computer-action` with its kind and character count, never the typed text.
- Frames are not stored. The Host keeps only the latest one in memory while a viewer polls.
- The stream sends whole frames, not video. On macOS a downscaled Retina capture barely shrinks as PNG (about 2 MB at 1600 px), so frames go out as JPEG, about one fifth the size. A busy screen on a slow uplink will still lag further than the measured numbers, which exclude network transfer.
