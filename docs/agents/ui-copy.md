# UI copy

Use this guide when you write or change text a person reads in the product: the web client, the desktop app and the mobile native app. It covers labels, buttons, placeholders, empty states, errors, notifications, permission prompts and the small dimmed hint, footer and caption lines under controls. English and Chinese follow the same rules.

## Design before copy

Apply the shared [UI design standard](ui-design.md) ([中文](ui-design.zh.md)) before adding explanatory text. Layout, icons, controls and interaction carry the task; descriptions supplement necessary facts. Keep meaningful labels, accessibility names and decision-critical consequences visible.

## Names

- Call a PersonaBot **Bot** in the UI: "New Bot", "Search Bots and Channels", "搜索 Bot 和频道". `PersonaBot` stays the domain term in [CONTEXT.md](../../CONTEXT.md), code, ADRs and developer docs; only the visible text says Bot.
- Use the other product nouns from CONTEXT.md as they are (Channel, Memory, Orchestrator, Assignment), with the casing the surrounding screen already uses.
- Keep internal ids, protocol names, config keys and error codes out of the UI. Show them only where the reader needs them to act, such as a copyable diagnostic.

## Keep it short and plain

Write for a reader who glances at the screen. They should understand the line on first read.

1. **Say the one thing the reader needs.** What happens, or what to do next. Drop edge cases, internal mechanics and anything the screen already shows.
2. **One short sentence per caption, two at most.** A dimmed hint under a control is a reminder, not documentation. If a rule needs a paragraph, it belongs in the docs site, linked from the screen.
3. **Plain words.** "This phone only", not "Persisted per device; push notifications are unaffected". Prefer everyday verbs and the reader's nouns.
4. **Keep the facts that protect the reader.** Privacy limits, what is or is not revoked, irreversible actions and security risk stay, stated briefly. A confirm dialog for a dangerous action may be longer than a caption; do not cut its risk statement.
5. **No repetition.** Do not restate the title or the label in the hint.
6. **Errors say what failed and what to do.** "Could not save. Try again." Not a stack of causes.

Examples:

| Before                                                                                                                                                                                                         | After                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Choose what the navigation number includes. Each pending item or unread conversation counts once. This device only; push notifications are unchanged.                                                          | Choose what the badge number counts. This phone only.                       |
| Get a notification when a Bot needs you or replies to you. It shows the Channel, what the Bot needs, and a short preview of the command, question or message. Private input requests never show their content. | Get notified when a Bot needs you or replies. Private input is never shown. |
| 仅把这个文件夹授权给此 Bot；不开启项目写入，不更改事项权限或审批规则。                                                                                                                                         | 只把这个文件夹授权给此 Bot，其他权限不变。                                  |

## Chinese

- Write natural Chinese, not a word-for-word translation. Keep it as short as the English or shorter.
- Keep product names that the UI shows in English (Bot, Orchestrator, Assignment, provider) in English; do not mix in a second translation for the same thing.
- Use full-width punctuation and no space between Chinese characters and punctuation; keep one space between Chinese and Latin words.

## Platform differences

Copy is shared by iOS and Android. It differs only where the platforms' own conventions differ:

- **Capitalization (English).** iOS buttons, alert actions, menu items and navigation titles use Apple's title case; everything else, and all of Android, uses sentence case. Write strings in sentence case; the mobile controls apply title case on iOS (`controlCase` in `apps/mobile/src/ui/platform-copy.ios.ts`).
- **The tap verb (Chinese).** iOS says 「轻点」 and Android says 「点按」, as each system does. Use `tapVerb` instead of writing either one. Leave the verb out when the control already makes the action clear.
- **Platform-only names.** Lock Screen, Live Activities, Dynamic Island and other one-platform features appear only on that platform.

## Please and failures

- Leave out 「请」 and "Please" in labels, hints, empty states and errors. Keep 「请」 only when the reader must go outside the app, for example 「请在系统设置中允许通知」 or 「请在电脑上复制新的链接」.
- Say what failed, then what to do: 「保存失败，再试一次。」 rather than 「无法保存，请重试。」 Keep 「无法」 for what cannot be done at all (「无法撤销」).

## Where copy lives

- Mobile: `apps/mobile/src/ui/strings.ts` (English and Chinese), `apps/mobile/locales/` and the permission texts in `apps/mobile/app.json`. See [apps/mobile/DESIGN.md](../../apps/mobile/DESIGN.md).
- Web and desktop: `packages/client/src/client/locale.ts` (English and Chinese) in the client plugin. See the `dsh-ui` skill.

Fix existing text that breaks these rules when you touch it.
