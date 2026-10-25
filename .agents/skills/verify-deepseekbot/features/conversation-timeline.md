# Conversation timeline

Reading a Bot DM or group: where the timeline opens, how it keeps your place, and how long messages and images display.

## Sub-features

- `memory-display` keeps the per-Bot elsewhere-memory visibility switch and adds Compact / Detailed in the existing action menu and Channel settings. Compact retains the Bot and origin, omits commit metadata and opens the same full diff on click. The preference is local to this browser; unset values stay Detailed.
- `new-messages` opens the Channel at the Human's read anchor and draws a `New messages` divider after it when someone else wrote since.
- `return-latest` shows an opaque icon-only return button above the composer at its right edge whenever the timeline is away from the latest messages; new live messages add a numeric badge. Hover and press change colour without transparency. It hides at the bottom and follows multiline composer height.
- `bidirectional-pages` opens a bounded window around the read anchor, then loads cursor pages at the top/bottom while preserving the reading anchor. Holding an edge must not start an unbounded loading loop.
- `keep-place` puts a Channel back at the message you were reading when you switch away and back within the same page.
- `fold` leaves messages expanded by default; with Auto-collapse long messages enabled, a settled message taller than 480px folds to 300px behind `Show all`.
- `message-time` shows each grouped message's own HH:mm next to its hover actions.
- `file-layout` keeps attachment names and sizes readable while Open and download controls wrap inside narrow message bubbles. Bubbles fit the larger of their prose and attachments; prose stays left-aligned with `text-wrap: pretty`.
- `image-preview` opens a thumbnail in an in-page preview that steps through every image loaded in the Channel.
- `reactions` adds the Human's emoji reaction from the hover bar picker, the long-press menu on narrow screens, or a chip under the bubble; Bots react through `bot_send_message` `react_to` + `reaction` (empty `body` for a reaction only); chips update live through `channel/reaction` and Bots read them in `channel_read`. The group avatar stays level with the bubble's bottom edge, not the chips.
- `search` opens with Ctrl/⌘+F, lists matches newest first and jumps to one with `openAround`.
- `member-mention` offers icon + label actions in the Channel sidebar member menu. Right-click, Shift+F10, and the member's ellipsis button all offer Mention, which appends one structured Bot mention to the current draft and focuses the composer without opening a DM.

## How to get to it (user POV)

- Open Bot settings → Messaging to enable Auto-collapse long messages. Long messages start expanded; when folding is enabled, Show all reveals the full body.

- In a Bot DM with Memory updates from another conversation, open its Channel menu → Show what this Bot did elsewhere → Memory display: Compact / Detailed. The same choice is under Channel settings → Show what this Bot did elsewhere → Memory display. Hide Memory updates to disable the choice; show them again to restore it.
- Enter Bot mode and open a DM that has messages after your last read position: the divider sits about a quarter down the view.
- Scroll up, open another conversation in the sidebar, then come back: the same message is at the same height.
- Send a file with a long name, then narrow the Messages dock panel: the file information and action controls stay inside both Human and Bot bubbles. Open the file menu and download the file.
- Click an image in a message: the preview opens; `←`/`→` or the side buttons step, `Esc` closes.
- Hover a message and click the smiley in its action bar, then pick an emoji; click the chip under the bubble to take it back. On a phone-width page, long-press the bubble and choose `Add reaction`.
- Press Ctrl/⌘+F in an open conversation, type a word, and press `Enter` or click a result.
- In a group Channel, open Members in the Channel sidebar. Right-click a Bot row (or use its ellipsis button / Shift+F10), then choose Mention (`@ TA` in Chinese).

## Driving it with verify-app

Preconditions: a model credential, a Bot with a few replies (one long list), three image attachments sent with `botharness/attachment/upload` and `rpc botharness/channelSend`, and `deepseekbot channel-mark-read <dm> --message-id <id>` on an earlier reply.

- **Memory display.** Use a task-owned Bot with an existing Group-caused Memory commit mirrored into its Human DM. Read `botharness/channelMessages` for that DM and keep the notice ID, SHA and origin Channel as canonical evidence. In the real Client, choose Compact from the Channel menu and verify only the icon, Bot, origin and update action remain; choose Detailed to restore the subject, SHA and file summary. In Channel settings choose Compact, close settings, refresh, hide/show Memory updates and switch away/back: the chosen style survives and the setting is disabled while hidden. Click the compact line and verify the diff SHA matches `botharness/memoryGitCommitDiff`; return to Chat. Capture both modes in light/dark, Chinese/English, narrow width and zoom with long Bot/origin names. Original Group notices and local DM commits keep Detailed. No model is required to render existing canonical notices.
- **Divider.** Open the DM; `[data-unread-divider]` exists right after the marked message, and `rpc botharness/channelReadPosition` returns that message before the visit.
- **Keep place.** Record `.bh-chat-body` `scrollTop`, open another DM, return; the value matches.
- **Reactions.** `deepseekbot channel-react <dm> --message-id <id> --emoji 👍` returns `reactions`, and an open page shows `[data-reaction="👍"]` without a reload; `--remove` takes it away and `deepseekbot bot-tool <bot> bot_send_message --args-stdin` with `{"channel_id","body":"","react_to","reaction"}` reacts as that Bot. In the page, `[data-reaction-picker-trigger]` opens `[data-reaction-picker]`; at 390px wide the long-press menu's `Add reaction` item opens it. A real Bot asked to acknowledge with ✅ calls `bot_send_message` with `react_to`, which `deepseekbot bot-trace` shows.
- **Search.** `deepseekbot channel-search <dm> --query <text>` lists matches newest first; in the page, Ctrl+F opens `[data-conversation-search]`, and `[data-search-result]` rows jump the timeline to their message.
- **Member mention.** In a group with a Bot member, type a draft, open that member's menu and choose Mention. Check that every action has an icon, `.bh-composer-rich-input [data-bot-id]` identifies the selected Bot, existing text remains and focus/caret are at the draft end. Repeat from the ellipsis and Shift+F10; a second Mention does not duplicate the chip. Send a uniquely marked message and read `botharness/channelMessages`: its Human message must retain the selected Bot's structured `mentions` metadata. No model is needed to verify insertion or submission; a reply requires one.
- **File layout.** Use a long-name text attachment in both a Human and a Bot message. Drag the Messages panel to 320px, 400px and 700px at a desktop viewport; repeat in light and dark themes. The filename has nonzero readable width, and `.bh-message-file` contains its Open and download controls without horizontal overflow. At wide widths, the bubble fits the text or attachment instead of stretching to the filename's uncapped intrinsic width; computed prose `text-wrap` is `pretty` and `text-align` is `left`. At 390px viewport width, repeat on the narrow layout. Open the file dropdown and download the original bytes. The compact Files panel remains a separate layout.
- **Fold preference.** Long messages are fully expanded by default, with no `[data-message-fold-toggle]`. Open Bot settings → Messaging; `Auto-collapse long messages` is off and searchable by its label. Enable it: settled long messages show `[data-message-fold="folded"]` and `Show all` expands them. Reload and verify the choice persists through the native `botharness-client` settings scope (`autoCollapseMessages: true`). Turn it off and verify the full body returns immediately and remains expanded after reload. Streaming output and interactive cards stay expanded with either choice. Repeat in light and dark themes. Select the switch by role as well as its accessible name: its surrounding SettingsRow group has the same name, so clicking that group does not toggle the switch.
- **Image preview.** Clicking a `.bh-message-image-link` opens `[role="dialog"]` named `Image preview: <file>`, with `2 / 3` style position text.

- **Return and large unread history.** Run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-timeline-navigation.mjs`. It seeds 260 messages using the real direct `bot_send_message` Bot tool (no model), marks message 120 read, and opens the 140-unread DM through the real Client. It records the canonical read position, opening around request, visible divider, older/newer cursor requests, one request per edge visit, idle no-loop intervals, retained prepend position, ordered unique rows, ordinary history return control, three live messages, bottom hiding, multiline draft without submission, actual light/dark appearance, and read-complete reopen. A second 150-message DM with 140 unread verifies that Return to latest loads the latest window when the newest message was outside the opening page. `BH_TIMELINE_BASELINE=1` expects the missing ordinary-history button and saves comparable before captures. `BH_SCREENSHOT_DIR` selects the evidence parent directory. The caller owns the Host; the journey closes its own browser in `finally`.

### Single-message feedback (#2811)

Use an isolated Host with synthetic messages only. Right-click a saved Human or Bot message →
**Give feedback**. Verify rating/tags/comment are described as the only PostHog submission fields.
Review the local diagnostic scope, deselect categories, expand files, and download the ZIP without
submitting. Submit a synthetic rating, inspect the receipt, and download again: the archive remains
local and its filename carries the feedback ID. Outbound request inspection must show no chat,
Session, Inbox, delivery content or archive bytes. No dedicated receiver is needed.
`packages/core/test/message-feedback.test.ts`, `packages/core/test/feedback-posthog.test.ts` and
`packages/client/test/message-feedback.test.ts` cover these seams. A model failure is a valid
no-response case but does not prove normal Bot replies.
Mobile: pair the Expo Web export with this isolated Host, open the synthetic DM, long-press the
saved message and choose **Give feedback**. Change evidence scope, verify stale material cannot
submit, refresh, rate and submit; inspect the receipt. Long-press → **Select messages**, toggle
another saved message, copy, open **Screenshot** and inspect the preview, then cancel. Switch
Channels and verify selection clears. Web previews are layout/browser evidence only; native
capture/share, keyboard and accessibility checks remain tracked in #2811 for both device lanes.
Desktop: right-click has **Select messages** and **Give feedback**, no **Locate this message**;
the selection toolbar directly offers Copy/Screenshot/Cancel and quoted replies still jump.
Automated seams: apps/mobile/test/message-feedback.test.ts,
apps/mobile/test/message-feedback-form.test.tsx, apps/mobile/test/message-menu-feedback.test.ts,
apps/mobile/test/message-selection.test.ts, packages/client/test/message-selection-bar.test.ts.

## Gotchas

- **Expo Native Bot mentions (#2160).** Open a group with canonical `mentions` ranges (a Bot reply starting with `@nickname`, and a Human inline mention). The current avatar and primary-colored `@name` share the body text line. A leading mention joins the first supported Markdown paragraph; subsequent blocks keep the existing renderer. Tap the inline name and verify `/dm/<botSlug>` against the canonical ID, including after a rename. Missing IDs retain a readable stored label without navigation; unstructured `@name` stays plain text. Verify cached history, live and optimistic data through `apps/mobile/test/conversation.test.ts`; `apps/mobile/test/message-mentions.test.ts` covers ranges, identities, CRLF, references and streaming first paragraphs. Native checks: default/intermediate/maximum text × light/dark, inline wrapping, per-Bot name colors, long-press copy/reactions and keyboard draft retention. Follow the Human-confirmed inline-size exception in mobile DESIGN; do not restore a 44/48-point block height. The Human-selected presentation has no background: avatar + @ + primary-colored name, inline with body text. Record platforms separately; iOS remains unverified without its native lane. Bot mentions embedded later in Markdown retain Web's plain-Markdown behavior.

- Read positions only move forward. To see the divider again, post a new message so the Bot replies after the anchor.
- Headless Chromium reports `hover: none`, which hides hover-only times and shows the hover actions permanently. Launch it with `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4` to capture desktop hover states.
- `deepseekbot pause` and `resume` have no online adapter; you cannot pause a Bot on a live Host to keep it from answering seeded messages.

- The pinned DSH Menu renders one submenu level. Memory display choices are flat labelled rows inside the existing action submenu; do not encode a third menu level in MenuItem data. Settings uses the existing Select.
