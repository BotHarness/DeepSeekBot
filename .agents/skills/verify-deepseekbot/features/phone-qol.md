# Native mobile quiet feedback, loading and stable history

## Sub-features

- `delivery`: outgoing bubbles remain normal for three seconds per attempt, then mute only while pending; failures retain explicit retry.
- `connection`: transient progress at the correct Channel/environment identity, fixed list geometry, actionable connection failure and retained permitted content/draft.
- `chats-loading`: cold skeleton, retained same-source content during refresh, distinct empty/error results and retry.
- `history-entry`: bottom-shaped loading and first real history frame at the bottom; explicit message focus is an exception.
- `history-retry`: older-page failure and retry preserve the current reading anchor and messages.
- `cloud-open`: loaded Cloud rows respond during directory refresh while current access and navigation intent remain authoritative.
- `creation`: short native blank/import journey, normal DM completion without an extra model banner, and existing receipt recovery. Full source-specific procedure: [Bot creation](phone-bot-create.md).

## How to get to it (user POV)

Open Chats for a paired Computer or an authorized Cloud workspace. Open an ordinary DM or Group Channel, send a fixture message, and scroll toward older history. Use New to create a Bot or enter an existing import flow. Use a designated test Cloud conversation for directory-refresh opening; this path needs an authorized test account and Organization.

## Driving it with verify-app

Native mobile checks use the assigned [shared-device queue](../../../../docs/agents/device-qa.md); Android uses its [Windows lane](../../../../docs/agents/android-device-qa.md). Freeze source and binary identities before starting. The Web Host helper does not drive Expo native geometry. Use a task-owned QA Host and controllable delay/failure transport, never an everyday conversation.

1. Send a uniquely marked message with quick commitment, then with a response delayed beyond three seconds. Record normal → muted → committed appearance without a Sending caption or changed bubble position. Fail a send and use the bubble's retry action; check the new attempt interval. Repeat after virtualization and background return. Read the canonical Channel timeline to establish one committed message with the expected identity/content.
2. Trigger ordinary connect and reconnect at Chats and in an open Channel. Observe platform-native progress to the right of the name inside the correct identity chip (not over its avatar), without a new banner row or list movement. Distinguish progress from Bot work. Trigger unreachable/refused states and operate their recovery actions; retain permitted history and draft, with no reconnect autosend.
3. Open uncached Chats, warm-refresh it, return a successful empty result and fail its first read. Observe skeleton → content or explicit recovery, never simultaneous failure and misleading empty content. Change source/account while reads are pending and check stale results cannot populate the new view.
4. Record the first visible content frame when opening cold/cached long history with variable-height Markdown and late images. Ordinary entry is at the bottom; a message link still targets its message. Repeat short/empty history, keyboard changes and live text resizing. A delayed scroll command or frame-count assertion alone is not proof of native placement. If loading cannot establish placement, exercise the visible Retry action and record the outcome.
5. Scroll into old history during a stream, prepend a page, inject an older-page read failure and tap `history-retry`. Keep the same reading anchor, current messages and draft; inspect canonical history for duplicates. Follow/jump behavior remains controlled by the Human.
6. Tap a loaded Cloud row during directory refresh. Verify immediate source-specific feedback and correct opening. Repeat with failed access, account replacement and rapid newer intent; an old completion must not reveal a different scope or take over navigation.
7. Run [Bot creation](phone-bot-create.md), including blank/Git/Marketplace/Zip confirmation, fixed submitted target, lost-response recovery and leaving progress. Completion shows normal DM chrome; model setup remains reachable through existing settings without an automatic probe. Native iOS and Android controls, real keyboard and Back must work independently.
8. For changed screens, capture matched before/after at default/intermediate/maximum text and light/dark. Verify reduced motion and screen-reader progress: skeleton shapes are noninteractive, hidden history is not separately exposed and transient connection progress does not produce repeated alerts.

## Observable proof

Record the source/head, installed binary, actual actions, visible result and canonical readback for sends/creation. First-frame history behavior needs a recording or equivalent frame evidence. Label each case PASS, FAIL or UNTESTED separately for iOS, Android, Simulator and physical/Human checks. Restore assigned fixtures/settings and verify task-owned processes and ports are released.

## Gotchas

- Code and controlled-transport tests are not native acceptance. Keep the user's reported top overflow and initial jump unconfirmed until reproduced on an identified native build.
- Preserve existing multi-Host, connection setup, import and navigation ownership. Partial All semantics are owned by the currently integrated source lifecycle, not by these indicators.
- Shared-device scheduling and sufficient disk space are prerequisites; the feature map grants no lease or permission to rebuild another owner's app.
- Crop unrelated conversations, addresses and credentials from evidence. Persist task evidence before cleanup.
