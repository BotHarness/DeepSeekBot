# Native Discord binding UI — matched comparison

Baseline: `e363a647876cf7cc41ee649e1de52c0604558ef5`. After: `a457b52b0bbe6bc277ba041b72114b3d9d178c5c`. Both are real installed-package Clients on official DSH RC1 with the same published Provider .20, run serially in one task-owned Profile.

Each pair matches 1280 × 800, locale, theme, the same Bot/App and zero conversations. Language was selected through native Settings; theme uses the native body theme attribute as in the repository's existing UI E2E scripts. The actual hints were read from the DOM and the captures were inspected. No mock UI, replacement text or screenshot fixture was used. Binding/unbinding for capture created no external traffic; the final messages are recorded separately in the [qualification record](discord-package-qualification.md).

Before uses generic DM guidance. After describes server-channel/existing-public-thread mentions and original-location replies, without promising Discord DMs.

## English — light

| State                        | Before                                                                                                           | After                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Discord selected in Bind app | ![Before: Discord selected in Bind app, en/light](../../assets/pr/1123-discord-pairs/base-selected-en-light.png) | ![After: Discord selected in Bind app, en/light](../../assets/pr/1123-discord-pairs/head-selected-en-light.png) |
| Binding ready                | ![Before: Binding ready, en/light](../../assets/pr/1123-discord-pairs/base-ready-en-light.png)                   | ![After: Binding ready, en/light](../../assets/pr/1123-discord-pairs/head-ready-en-light.png)                   |
| Empty conversation list      | ![Before: Empty conversation list, en/light](../../assets/pr/1123-discord-pairs/base-empty-en-light.png)         | ![After: Empty conversation list, en/light](../../assets/pr/1123-discord-pairs/head-empty-en-light.png)         |

## English — dark

| State                        | Before                                                                                                         | After                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Discord selected in Bind app | ![Before: Discord selected in Bind app, en/dark](../../assets/pr/1123-discord-pairs/base-selected-en-dark.png) | ![After: Discord selected in Bind app, en/dark](../../assets/pr/1123-discord-pairs/head-selected-en-dark.png) |
| Binding ready                | ![Before: Binding ready, en/dark](../../assets/pr/1123-discord-pairs/base-ready-en-dark.png)                   | ![After: Binding ready, en/dark](../../assets/pr/1123-discord-pairs/head-ready-en-dark.png)                   |
| Empty conversation list      | ![Before: Empty conversation list, en/dark](../../assets/pr/1123-discord-pairs/base-empty-en-dark.png)         | ![After: Empty conversation list, en/dark](../../assets/pr/1123-discord-pairs/head-empty-en-dark.png)         |

## Chinese — light

| State                        | Before                                                                                                           | After                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Discord selected in Bind app | ![Before: Discord selected in Bind app, zh/light](../../assets/pr/1123-discord-pairs/base-selected-zh-light.png) | ![After: Discord selected in Bind app, zh/light](../../assets/pr/1123-discord-pairs/head-selected-zh-light.png) |
| Binding ready                | ![Before: Binding ready, zh/light](../../assets/pr/1123-discord-pairs/base-ready-zh-light.png)                   | ![After: Binding ready, zh/light](../../assets/pr/1123-discord-pairs/head-ready-zh-light.png)                   |
| Empty conversation list      | ![Before: Empty conversation list, zh/light](../../assets/pr/1123-discord-pairs/base-empty-zh-light.png)         | ![After: Empty conversation list, zh/light](../../assets/pr/1123-discord-pairs/head-empty-zh-light.png)         |

## Chinese — dark

| State                        | Before                                                                                                         | After                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Discord selected in Bind app | ![Before: Discord selected in Bind app, zh/dark](../../assets/pr/1123-discord-pairs/base-selected-zh-dark.png) | ![After: Discord selected in Bind app, zh/dark](../../assets/pr/1123-discord-pairs/head-selected-zh-dark.png) |
| Binding ready                | ![Before: Binding ready, zh/dark](../../assets/pr/1123-discord-pairs/base-ready-zh-dark.png)                   | ![After: Binding ready, zh/dark](../../assets/pr/1123-discord-pairs/head-ready-zh-dark.png)                   |
| Empty conversation list      | ![Before: Empty conversation list, zh/dark](../../assets/pr/1123-discord-pairs/base-empty-zh-dark.png)         | ![After: Empty conversation list, zh/dark](../../assets/pr/1123-discord-pairs/head-empty-zh-dark.png)         |
