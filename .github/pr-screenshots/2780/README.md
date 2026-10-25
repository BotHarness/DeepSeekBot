# Group and Bot appearance evidence

Issue: [#2780](https://github.com/BotHarness/DeepSeekBot/issues/2780).
Base: `4f0044dd1248e9dada5377b3fee7c8953666acb4`.
Captured UI source: `11a0da057585fcd8b490359a989940c95dad24a9`.
Captured 2026-10-25, Expo SDK 58 Web export, Chromium, 390 × 844 CSS px, 2× scale, default browser text.

## Actual interactions

Prepare synthetic Nova and Design studio fixtures through a real isolated DSH 0.2.1-rc.3 Host and its public loopback pairing API. The group includes Nova; the two avatars deliberately use different repository image fixtures.

- **Bot DM profile:** click the large portrait, select an image through the real browser chooser, and require the saved image to decode visibly. Existing `botAvatarSet` saves the Bot identity used in the profile, Chats and group member rows. Reload and require the image to remain.
- **Group profile:** use Change avatar and the real chooser. Existing `channelGroupAvatarSet` changes only that group. Read both records and require each avatar to survive changing the other.
- **Background:** open Chat background from each profile and require the existing editor and Choose wallpaper action. Backgrounds retain phone-local Host/Channel scope. This Web run does not qualify native local-storage persistence.
- Host API readback and formal `show` / `channel` CLI commands confirm both avatars. Chinese light/dark and English light runs have no page error after the preview adjustments below.

## Images

Each pair matches data, viewport, theme and locale. Before has no editable Bot portrait and labels the group avatar row Choose a photo; after names Change avatar explicitly and keeps Chat background separate.

| Pair                 | Before    | After     |
| -------------------- | --------- | --------- |
| Group, Chinese light | `gzb.png` | `gza.png` |
| Bot, Chinese light   | `bzb.png` | `bza.png` |
| Group, Chinese dark  | `gdb.png` | `gda.png` |
| Bot, Chinese dark    | `bdb.png` | `bda.png` |
| Group, English light | `geb.png` | `gea.png` |
| Bot, English light   | `beb.png` | `bea.png` |

`bg.png` shows the separate background editor reached from the Bot. The group reaches the same component with its own Channel scope. Images are unchanged copies of reviewed captures with synthetic names and repository artwork. Private originals, hashes, failed attempts and provenance are indexed in the machine main checkout.

## Preview adjustments and limits

1. Both exports hit pre-existing `Appearance.setColorScheme`, absent from React Native Web. The local server makes only that layout call optional, identically for base and candidate.
2. Native Image sends the existing Device header; Web Image does not. The local proxy supplies the task paired header only for Bot-avatar requests. The initial blank-image run was rejected in visual review; final captures require actual image decoding.

Neither adjustment changes committed production source, avatar actions, image selection/conversion, Host authorization or background settings. Pairing is fixture setup; these captures do not qualify encrypted pairing.

iOS/Android system pickers, crop UI, permissions, Back, large OS text and native background persistence remain untested and use the shared-device journey. No native dependencies or configuration changed.

## Checks

- 70 focused tests pass: Bot/group avatar entries, removal, cancellation, pending guards, failures/retry, background scope/entry, new-DM resolution, existing Host actions and styling.
- Lint, source policy, CLI parity, feature map and Release Ledger pass.
- Expo Web and iOS/Android Hermes exports pass; export is separate from native compilation and device acceptance.
- Full repository and mobile typecheck pass in the normal machine environment. Earlier restricted-run diagnostic failures are retained as failed attempts, not current PR failures.

Production mobile sources are unchanged after the captured UI source commit; later changes contain evidence and test assertions only.
