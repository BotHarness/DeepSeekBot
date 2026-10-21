# Browser Remote Hosts

The browser pairs a Remote Host as a Paired Device and reads its Host Feed through the shared mobile Host client. This Host remains the management context.

## Sub-features

- `pair`: Add remote redeems the other Host's pairing link.
- `tabs`: the icon strip filters All, This host and each Remote Host; tooltips name the Host, and Chinese uses 全部、本机、远程.
- `open`: a remote row opens a Host-scoped conversation.
- `avatars`: remote Bot portraits and group images/member stacks appear in rows and conversation headers; Bot message authors and live drafts use the same remote portrait.
- `activity-unread`: remote Bot rows display received activity; DM/group unread counts come from their Host Inbox.
- `read`: a visible remote conversation at its latest message marks that message read on its owning Host and refreshes the shared Inbox.
- `upgrade`: existing browser pairings and the selected tab survive the storage-key rename.
- `remove`: removing a Host forgets its rows, stops its Inbox and releases cached avatar object URLs.
- `viewers`: a remote Bot DM opens Browser or Computer when that Bot has access. The shared Host viewer modules read frames and send input to that Host only; closing, switching source or losing the connection tears down the viewer and releases requested control.
- `viewer-control`: queued input belongs to one takeover. Resume or frame loss invalidates it; frame recovery remains read-only even when the Host Feed never disconnected. Remove closes viewers and waits up to five seconds for takeover/release cleanup before revoking the pairing.

## How to get to it (user POV)

Enter Bot mode, then Messages. Open the channel header's add menu and choose Add remote. Paste a link from the other Host's Settings → Devices → Pair a phone. Choose All or the Remote Host icon, then a Bot or group row. Right-click the Host icon and choose Remove to remove it. A remote Bot DM with Browser or Computer access shows the corresponding header button. Open its viewer, choose Pause Bot and take control, interact with the screen or send text, then Resume Bot or Close viewer. Groups have no viewer entry.

## Driving it with verify-app

Launch two independently named instances with `node scripts/verify-app.mjs launch --name <name>`. Run `doctor` for each. Open both local login URLs. Pair from Host A's browser using the link created on Host B. Verify the new tab, All rows, remote conversation header and canonical device record on Host B. Capture tabs and the Add remote dialog in English and Chinese, light and dark. For the rename baseline, run the pre-change Client with the same browser storage, upgrade, and verify the pairing and selected Host remain without another offer.

Read the browser console and run `node scripts/verify-app.mjs observe --name <name>` after startup and relevant actions. For a reply test select `deepseek-v4-pro`, send a uniquely marked message and compare the visible response to Host B's canonical timeline. Inspect the remote timeline in reverse DOM order: newest is first.

For avatars, give Host B one uploaded Bot image, one seeded or composed Bot, a group with those members and a group with an uploaded image. Open each from All and the Host icon. Compare the row, header and Bot message author with Host B's canonical roster and timeline. A direct `bot-tool channel_send` needs an existing trusted Source Event in that Channel; seed a Human group message with the members' wake policies set to silent before the direct call. Inspect the browser's device-authorized avatar GET and CORS response, the loaded object-URL image dimensions and both themes. Equal slugs on Host A and Host B must retain Host B's portrait, including group member stacks. Change Host B's avatar and verify the visible portrait updates; remove the Remote Host and verify its rows and portraits disappear. Streaming draft authors also use the portrait; mark the live-model draft path untested unless driven with the specified model.

For viewers, start a disposable Browser and Computer on Host B through the existing CLI. Open a harmless fixture in each; capture the actual remote frame in light and dark, take control and verify a click/text change against `browser-observation` / `browser-frame` or `computer-frame`. Confirm Host A is untouched, and inspect the gateway requests: frame/input HTTP uses the device header without cookies; the Host Feed mux uses a one-time stream ticket. Close during takeover, switch between same-slug Bots on different Hosts, stop/restart Host B, and revoke the browser's device credential. Frames and input must stop after disposal/revocation; reconnect must not replay input. Preserve actual missing runtime prerequisites as blockers rather than replacing the frame with a fixture response. The Computer may use an isolated container; this does not qualify the Human's local desktop.

For control races, delay an input response, queue text, Resume, then take control again before completing the first response: the old queued text must not arrive. Interrupt only frame requests while the Feed remains online; recovered frames must be read-only and require another takeover. Delay a takeover response after the Host accepts it, then Remove the Host: input stops immediately and release must precede unpair. If cleanup cannot finish within five seconds, removal continues; Browser may require the Host operator to resume it.

Keep the remote screen stationary during frame recovery. The Host must keep its sequence unchanged and answer matching `after` polls with 204 after ten seconds; the viewer recovers by fetching the current frame without that stale cursor, not by requiring a screen change. In both UI languages, inject a frame/input failure: the Web panel must show localized recovery guidance and a reconnect action, while the viewer snapshot retains the original diagnostic notice rather than rendering it as product copy.

## Gotchas

- Remote avatars consume the authenticated image cache; This Host retains its current read adapter.
- With unread messages on both Hosts, compare each row and tab with `channelUnreadCounts`. Open the remote DM/group, verify its count clears on that Host while the other Host stays unread. Keep an active Bot running to inspect its activity indicator. Stop only the task-owned remote Host and verify cached rows/counts remain with an offline tab.
- Activity timestamps are receipt times; they are not authoritative tool start times.
- Remote chat displays text and attachment names; images and cards are not qualified.
- Host looks remain device-local, including each phone's own icon and colour. DSH Desktop and two physical machines over a real tailnet are not qualified by a two-Host local run.
- Control release uses the same device credential. An unreachable Host is retried when this viewer reconnects or reopens; a revoked credential cannot resume a Browser. In that case the Host operator resumes it. The Computer also has its existing Host-side pause lease.
- Dismiss Continue and Skip onboarding overlays before selecting Messages. Retain any failed drive evidence before retrying.
