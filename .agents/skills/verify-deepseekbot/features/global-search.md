# Global search (quick switcher)

## Sub-features

- S1: Alt+K (Option+K on macOS) opens the search in Bot mode on Web and Desktop; Ctrl+K / Command+K still opens it where the browser delivers the key. On Desktop macOS and Windows, DSH owns Command/Ctrl+K for its own session search and consumes it in the Electron main process, so only Alt/Option+K reaches DeepSeekBot there.
- S2: results list conversations first, then Bot settings sections and rows; choosing a setting opens Bot settings on that section and highlights the row.
- S3: Chinese names match full pinyin, initials and mixed text (`waiguan`, `wg`, `yfb` for `研发 Bot`); the Chinese interface also matches English words (`theme`, `group`, `notifications`). The roster filter in the Channels header uses the same matcher.

## How to get to it (user POV)

Enter Bot mode, press Alt+K (Option+K on macOS), type a query. Enter opens the highlighted row; Esc or the shortcut again closes the dialog. The shortcut can be changed in Bot settings › Keyboard shortcuts.

## Driving it with verify-app

No model is needed. Seed a few group channels with `node scripts/verify-app.mjs rpc botharness/channelCreate '{"name":"外观讨论","members":[]}' --name <n>`, then:

```bash
node scripts/verify-app.mjs shot search-pinyin --name <n> --bot-mode --locale zh \
  --press Alt+K --fill "搜索 Bot、群聊、频道或设置，支持拼音=waiguan"
node scripts/verify-app.mjs shot search-open-setting --name <n> --bot-mode --locale zh \
  --press Alt+K --fill "搜索 Bot、群聊、频道或设置，支持拼音=zhuti" --press Enter
```

The first shows the 外观讨论 conversation and the 界面设置 section under 设置; the second shows Bot settings open on 界面设置 with the 主题 row highlighted.

## Gotchas

- Headless capture cannot prove the Electron key path. On a real Desktop, check that Option/Alt+K opens the search while Command/Ctrl+K opens DSH's own session search.
- Settings rows come from `SETTINGS_INDEX` in `packages/client/src/client/settings-search.tsx`; a new settings row is searchable only by its section name until it is added there.
