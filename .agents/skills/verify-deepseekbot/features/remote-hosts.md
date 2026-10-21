# Browser Remote Hosts

The browser pairs a Remote Host as a Paired Device and reads its Host Feed through the shared mobile Host client. This Host remains the management context.

## Sub-features

- `pair`: Add remote redeems the other Host's pairing link.
- `tabs`: All, This host and each Remote Host filter the channel list; Chinese uses 全部、本机、远程.
- `open`: a remote row opens a Host-scoped conversation.
- `upgrade`: existing browser pairings and the selected tab survive the storage-key rename.
- `remove`: removing a Host forgets its rows, stops its Inbox and releases cached avatar object URLs.

## How to get to it (user POV)

Enter Bot mode, then Messages. Choose Add remote above the channel list. Paste a link from the other Host's Settings → Devices → Pair a phone. Choose All or the Remote Host tab, then a Bot or group row. Right-click the Host tab to remove it.

## Driving it with verify-app

Launch two independently named instances with `node scripts/verify-app.mjs launch --name <name>`. Run `doctor` for each. Open both local login URLs. Pair from Host A's browser using the link created on Host B. Verify the new tab, All rows, remote conversation header and canonical device record on Host B. Capture tabs and the Add remote dialog in English and Chinese, light and dark. For the rename baseline, run the pre-change Client with the same browser storage, upgrade, and verify the pairing and selected Host remain without another offer.

Read the browser console and run `node scripts/verify-app.mjs observe --name <name>` after startup and relevant actions. For a reply test select `deepseek-v4-pro`, send a uniquely marked message and compare the visible response to Host B's canonical timeline. Inspect the remote timeline in reverse DOM order: newest is first.

## Gotchas

- The Inbox and authenticated avatar cache are scaffold state; rows do not yet display their counts or avatars in Track 0.
- Remote chat displays text and attachment names; images and cards are not qualified.
- The Host look is still per phone. DSH Desktop and two physical machines over a real tailnet are not qualified by a two-Host local run.
- Dismiss Continue and Skip onboarding overlays before selecting Messages. Retain any failed drive evidence before retrying.
