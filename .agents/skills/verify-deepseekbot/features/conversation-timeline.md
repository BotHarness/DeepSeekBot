# Conversation timeline

Reading a Bot DM or group: where the timeline opens, how it keeps your place, and how long messages and images display.

## Sub-features

- `new-messages` opens the Channel at the Human's read anchor and draws a `New messages` divider after it when someone else wrote since.
- `keep-place` puts a Channel back at the message you were reading when you switch away and back within the same page.
- `fold` folds a settled message taller than 480px to 300px behind `Show all`.
- `message-time` shows each grouped message's own HH:mm next to its hover actions.
- `file-layout` keeps attachment names and sizes readable while Open and download controls wrap inside narrow message bubbles. Bubbles fit the larger of their prose and attachments; prose stays left-aligned with `text-wrap: pretty`.
- `image-preview` opens a thumbnail in an in-page preview that steps through every image loaded in the Channel.
- `reactions` adds the Human's emoji reaction from the hover bar picker, the long-press menu on narrow screens, or a chip under the bubble; Bots react through `channel_send` `react_to` + `reaction` (empty `body` for a reaction only); chips update live through `channel/reaction` and Bots read them in `channel_read`. The group avatar stays level with the bubble's bottom edge, not the chips.
- `search` opens with Ctrl/⌘+F, lists matches newest first and jumps to one with `openAround`.
- `member-mention` offers icon + label actions in the Channel sidebar member menu. Right-click, Shift+F10, and the member's ellipsis button all offer Mention, which appends one structured Bot mention to the current draft and focuses the composer without opening a DM.

## How to get to it (user POV)

- Enter Bot mode and open a DM that has messages after your last read position: the divider sits about a quarter down the view.
- Scroll up, open another conversation in the sidebar, then come back: the same message is at the same height.
- Send a file with a long name, then narrow the Messages dock panel: the file information and action controls stay inside both Human and Bot bubbles. Open the file menu and download the file.
- Click an image in a message: the preview opens; `←`/`→` or the side buttons step, `Esc` closes.
- Hover a message and click the smiley in its action bar, then pick an emoji; click the chip under the bubble to take it back. On a phone-width page, long-press the bubble and choose `Add reaction`.
- Press Ctrl/⌘+F in an open conversation, type a word, and press `Enter` or click a result.
- In a group Channel, open Members in the Channel sidebar. Right-click a Bot row (or use its ellipsis button / Shift+F10), then choose Mention (`@ TA` in Chinese).

## Driving it with verify-app

Preconditions: a model credential, a Bot with a few replies (one long list), three image attachments sent with `botharness/attachment/upload` and `rpc botharness/channelSend`, and `deepseekbot channel-mark-read <dm> --message-id <id>` on an earlier reply.

- **Divider.** Open the DM; `[data-unread-divider]` exists right after the marked message, and `rpc botharness/channelReadPosition` returns that message before the visit.
- **Keep place.** Record `.bh-chat-body` `scrollTop`, open another DM, return; the value matches.
- **Reactions.** `deepseekbot channel-react <dm> --message-id <id> --emoji 👍` returns `reactions`, and an open page shows `[data-reaction="👍"]` without a reload; `--remove` takes it away and `deepseekbot bot-tool <bot> channel_send --args-stdin` with `{"channel_id","body":"","react_to","reaction"}` reacts as that Bot. In the page, `[data-reaction-picker-trigger]` opens `[data-reaction-picker]`; at 390px wide the long-press menu's `Add reaction` item opens it. A real Bot asked to acknowledge with ✅ calls `channel_send` with `react_to`, which `deepseekbot bot-trace` shows.
- **Search.** `deepseekbot channel-search <dm> --query <text>` lists matches newest first; in the page, Ctrl+F opens `[data-conversation-search]`, and `[data-search-result]` rows jump the timeline to their message.
- **Member mention.** In a group with a Bot member, type a draft, open that member's menu and choose Mention. Check that every action has an icon, `.bh-composer-rich-input [data-bot-id]` identifies the selected Bot, existing text remains and focus/caret are at the draft end. Repeat from the ellipsis and Shift+F10; a second Mention does not duplicate the chip. Send a uniquely marked message and read `botharness/channelMessages`: its Human message must retain the selected Bot's structured `mentions` metadata. No model is needed to verify insertion or submission; a reply requires one.
- **File layout.** Use a long-name text attachment in both a Human and a Bot message. Drag the Messages panel to 320px, 400px and 700px at a desktop viewport; repeat in light and dark themes. The filename has nonzero readable width, and `.bh-message-file` contains its Open and download controls without horizontal overflow. At wide widths, the bubble fits the text or attachment instead of stretching to the filename's uncapped intrinsic width; computed prose `text-wrap` is `pretty` and `text-align` is `left`. At 390px viewport width, repeat on the narrow layout. Open the file dropdown and download the original bytes. The compact Files panel remains a separate layout.
- **Fold and preview.** `[data-message-fold-toggle]` reads `Show all`; clicking a `.bh-message-image-link` opens `[role="dialog"]` named `Image preview: <file>`, with `2 / 3` style position text.

## Gotchas

- **Expo Native Bot mentions (#2160).** Open a group with canonical `mentions` ranges (a Bot reply starting with `@nickname`, and a Human inline mention). The current avatar and primary-colored `@name` share the body text line. A leading mention joins the first supported Markdown paragraph; subsequent blocks keep the existing renderer. Tap the inline name and verify `/dm/<botSlug>` against the canonical ID, including after a rename. Missing IDs retain a readable stored label without navigation; unstructured `@name` stays plain text. Verify cached history, live and optimistic data through `apps/mobile/test/conversation.test.ts`; `apps/mobile/test/message-mentions.test.ts` covers ranges, identities, CRLF, references and streaming first paragraphs. Native checks: default/intermediate/maximum text × light/dark, inline wrapping, per-Bot name colors, long-press copy/reactions and keyboard draft retention. Follow the Human-confirmed inline-size exception in mobile DESIGN; do not restore a 44/48-point block height. The Human-selected presentation has no background: avatar + @ + primary-colored name, inline with body text. Record platforms separately; iOS remains unverified without its native lane. Bot mentions embedded later in Markdown retain Web's plain-Markdown behavior.

- Read positions only move forward. To see the divider again, post a new message so the Bot replies after the anchor.
- Headless Chromium reports `hover: none`, which hides hover-only times and shows the hover actions permanently. Launch it with `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4` to capture desktop hover states.
- `deepseekbot pause` and `resume` have no online adapter; you cannot pause a Bot on a live Host to keep it from answering seeded messages.
