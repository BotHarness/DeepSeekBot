# Conversation typography — Expo Web preview

Base: `484083d35` (the PR branch's starting main revision).

Matched screenshots: 390 × 844 CSS pixels, DPR 2, zh-CN, identical synthetic rows,
light and dark appearance. `b-*.png` is before; `a-*.png` is after.

The temporary Expo entry renders the actual `ConversationRowFrame`, `SourceName`,
`ConversationGroupAvatar`, `Text` and design theme from each revision. It uses an
isolated component fixture with a simple heading, not the full Chats shell or a
paired Host. All avatars are the built-in group placeholder. No private data,
model calls or device credentials are involved. Existing web-preview adapters
provide the web interface preference and symbol rendering. Production entry,
configuration and dependency manifests are restored before commit.

The browser measured names at 17px/600 before and 18px/400 after, previews at
13px before and 15px after. Timestamps remain 13px. Colors are unchanged semantic
foreground/muted/subtle roles. Both themes rendered without page errors.
Web uses the iOS base type scale; Android's native baseline is 14px names and
12px previews. Web evidence does not qualify native fonts or system text scaling.

Native acceptance remains pending: iOS and Android default, intermediate and
maximum system text size × light/dark, including long titles/previews, unread
badges, timestamps, no-time rows, source marks and opening Bot/group chats.
The Human authorizes merging after CI and scheduling Android checks on latest main.

Task-local export/capture scripts and full measured results are retained in
`.humanlayer/tasks/2890/` in the PR checkout. No preview route ships in the app.
