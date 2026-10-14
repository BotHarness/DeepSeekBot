# Conversation timeline

Reading a Bot DM or group: where the timeline opens, how it keeps your place, and how long messages and images display.

## Sub-features

- `new-messages` opens the Channel at the Human's read anchor and draws a `New messages` divider after it when someone else wrote since.
- `keep-place` puts a Channel back at the message you were reading when you switch away and back within the same page.
- `fold` folds a settled message taller than 480px to 300px behind `Show all`.
- `message-time` shows each grouped message's own HH:mm next to its hover actions.
- `image-preview` opens a thumbnail in an in-page preview that steps through every image loaded in the Channel.
- `reactions` adds the Human's emoji reaction from the hover bar picker, the long-press menu on narrow screens, or a chip under the bubble; Bots react with their `channel_react` tool; chips update live through `channel/reaction` and Bots read them in `channel_read`. The group avatar stays level with the bubble's bottom edge, not the chips.
- `search` opens with Ctrl/⌘+F, lists matches newest first and jumps to one with `openAround`.

## How to get to it (user POV)

- Enter Bot mode and open a DM that has messages after your last read position: the divider sits about a quarter down the view.
- Scroll up, open another conversation in the sidebar, then come back: the same message is at the same height.
- Click an image in a message: the preview opens; `←`/`→` or the side buttons step, `Esc` closes.
- Hover a message and click the smiley in its action bar, then pick an emoji; click the chip under the bubble to take it back. On a phone-width page, long-press the bubble and choose `Add reaction`.
- Press Ctrl/⌘+F in an open conversation, type a word, and press `Enter` or click a result.

## Driving it with verify-app

Preconditions: a model credential, a Bot with a few replies (one long list), three image attachments sent with `botharness/attachment/upload` and `rpc botharness/channelSend`, and `deepseekbot channel-mark-read <dm> --message-id <id>` on an earlier reply.

- **Divider.** Open the DM; `[data-unread-divider]` exists right after the marked message, and `rpc botharness/channelReadPosition` returns that message before the visit.
- **Keep place.** Record `.bh-chat-body` `scrollTop`, open another DM, return; the value matches.
- **Reactions.** `deepseekbot channel-react <dm> --message-id <id> --emoji 👍` returns `reactions`, and an open page shows `[data-reaction="👍"]` without a reload; `--remove` takes it away, and `--bot <bot-id>` reacts as that Bot through the `channel_react` tool code. In the page, `[data-reaction-picker-trigger]` opens `[data-reaction-picker]`; at 390px wide the long-press menu's `Add reaction` item opens it. A real Bot asked to acknowledge with ✅ calls `channel_react`, which `deepseekbot bot-trace` shows.
- **Search.** `deepseekbot channel-search <dm> --query <text>` lists matches newest first; in the page, Ctrl+F opens `[data-conversation-search]`, and `[data-search-result]` rows jump the timeline to their message.
- **Fold and preview.** `[data-message-fold-toggle]` reads `Show all`; clicking a `.bh-message-image-link` opens `[role="dialog"]` named `Image preview: <file>`, with `2 / 3` style position text.

## Gotchas

- Read positions only move forward. To see the divider again, post a new message so the Bot replies after the anchor.
- Headless Chromium reports `hover: none`, which hides hover-only times and shows the hover actions permanently. Launch it with `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4` to capture desktop hover states.
- `deepseekbot pause` and `resume` have no online adapter; you cannot pause a Bot on a live Host to keep it from answering seeded messages.
