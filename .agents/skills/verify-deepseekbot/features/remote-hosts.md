# Browser Remote Hosts

The browser pairs a Remote Host as a Paired Device and reads its Host Feed through the shared mobile Host client. This Host remains the management context.

## Sub-features

- `pair`: Add remote redeems the other Host's pairing link.
- `tabs`: the icon strip filters All, This host and each Remote Host; tooltips name the Host, and Chinese uses 全部、本机、远程.
- `open`: a remote row opens a Host-scoped conversation.
- `avatars`: remote Bot portraits and group images/member stacks appear in rows and conversation headers; Bot message authors and live drafts use the same remote portrait.
- `upgrade`: existing browser pairings and the selected tab survive the storage-key rename.
- `remove`: removing a Host forgets its rows, stops its Inbox and releases cached avatar object URLs.

## How to get to it (user POV)

Enter Bot mode, then Messages. Open the channel header's add menu and choose Add remote. Paste a link from the other Host's Settings → Devices → Pair a phone. Choose All or the Remote Host icon, then a Bot or group row. Right-click the Host icon and choose Remove to remove it.

## Driving it with verify-app

Launch two independently named instances with `node scripts/verify-app.mjs launch --name <name>`. Run `doctor` for each. Open both local login URLs. Pair from Host A's browser using the link created on Host B. Verify the new tab, All rows, remote conversation header and canonical device record on Host B. Capture tabs and the Add remote dialog in English and Chinese, light and dark. For the rename baseline, run the pre-change Client with the same browser storage, upgrade, and verify the pairing and selected Host remain without another offer.

Read the browser console and run `node scripts/verify-app.mjs observe --name <name>` after startup and relevant actions. For a reply test select `deepseek-v4-pro`, send a uniquely marked message and compare the visible response to Host B's canonical timeline. Inspect the remote timeline in reverse DOM order: newest is first.

For avatars, give Host B one uploaded Bot image, one seeded or composed Bot, a group with those members and a group with an uploaded image. Open each from All and the Host icon. Compare the row, header and Bot message author with Host B's canonical roster and timeline. A direct `bot-tool channel_send` needs an existing trusted Source Event in that Channel; seed a Human group message with the members' wake policies set to silent before the direct call. Inspect the browser's device-authorized avatar GET and CORS response, the loaded object-URL image dimensions and both themes. Equal slugs on Host A and Host B must retain Host B's portrait, including group member stacks. Change Host B's avatar and verify the visible portrait updates; remove the Remote Host and verify its rows and portraits disappear. Streaming draft authors also use the portrait; mark the live-model draft path untested unless driven with the specified model.

## Gotchas

- Row activity/unread remains a separate slice. Remote avatars consume Track 0's authenticated image cache; This Host retains its current read adapter.
- Remote chat displays text and attachment names; images and cards are not qualified.
- Host looks remain device-local, including each phone's own icon and colour. DSH Desktop and two physical machines over a real tailnet are not qualified by a two-Host local run.
- Dismiss Continue and Skip onboarding overlays before selecting Messages. Retain any failed drive evidence before retrying.
