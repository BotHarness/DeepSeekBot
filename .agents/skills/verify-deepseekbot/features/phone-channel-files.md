# Phone Channel files

## Sub-features

- Existing Desktop/Web Channel files parity: per-Computer, per-Channel history pages; sender, time, type and size; exact-reference deduplication; no file downloads while listing.
- On-demand image preview and system sharing for other files, including HTML without an in-app execution context.
- Return to the original message through the existing DM/Channel focus route; load history or show an unavailable message.
- Page failure retry, reconnect baseline, live redaction and device revocation; stale requests cannot restore removed entries or open a share sheet after leaving.

## How to get to it (user POV)

Open a Human/Bot DM or Channel → header folder button (**Channel files** / **会话文件**). Tap an image to preview it, or another file to download and share through the system. A row's More menu offers sharing and **View message** / **查看原消息**. **Load older files** / **加载更早的文件** reads the next history page.

## Driving it with verify-app

This is a native journey. Use the assigned queues in `docs/agents/device-qa.md`; do not claim native proof from Web, source tests or the file metadata alone. The queue owner starts the isolated Host through `scripts/verify-app.mjs` and supplies a matching Expo development client. No model is required for neutral owned attachment fixtures.

1. Prepare more than 100 confirmed messages in a disposable Channel with files on older pages, two different files with the same filename, an image, a PDF and an HTML file. Open Channel files and scroll/load older until all known files are found. Verify names, type/size, sender and time; listing must not fetch each file body.
2. Open an image, zoom and close it; share a file through the native system sheet and cancel. HTML goes to the system share/open route and never executes in an authenticated app WebView. Open a row's anchored More menu and select View message for a cached attachment, revisit the same target, and then select an uncached older attachment. Each explicit View message request must position the exact original message even when the mounted chat's content dimensions do not change; the existing history owner loads missing pages without remounting the composer. After viewing message A, scroll to B, open files and use ordinary Back: keep B. Only a fresh View message action carries a new navigation request and returns to A.
3. Interrupt the next page request, verify visible rows stay and the Retry button succeeds. During same-source reconnect/manual retry, retain loaded rows with actions disabled until the current baseline is confirmed. End only the roster follower during a pending page: its reattach must release the loading state, and an old completion must not settle a new page request. Remove a fixture through the existing authorized purge path while its row is visible; require row removal and preview dismissal. Revoke only the disposable pairing during a slow download; no share sheet may appear afterward.
4. Switch to a second test Computer with a same-named Bot and return to a retained file route: it must show the source-changed state, never another Computer's files. Leave the screen while paging/downloading and check no delayed navigation or share sheet occurs.
5. On iOS and Android, check light/dark, English/Chinese, default/intermediate/maximum text, VoiceOver/TalkBack labels, native menu dismissal, list scrolling, back navigation and existing composer draft retention. Capture matched before/after evidence through the queue owner, with neutral filenames and no credentials or unrelated conversations.

## Observable proof

The visible filename and original-message destination agree with the canonical Channel journal's attachment reference. An exact Host attachment request supplies the preview/share bytes; same-name fixtures stay distinct. Purge/revocation removes access, a page retry preserves existing rows, and navigation retains Computer/Channel/message identity. Source tests cover these transport and share boundaries; native rendering, system-sheet delivery and Human acceptance require separate device results.

## Gotchas

- No new artifact store, editable HTML surface or version history is introduced. Memory is separate.
- Host authorization remains authoritative for every file read. This screen's projection is discarded when it closes or changes source.
- Pending native iOS/Android checks remain **UNTESTED** until the shared-device owner supplies evidence. Do not boot a competing Host, Metro or simulator from this feature branch.
