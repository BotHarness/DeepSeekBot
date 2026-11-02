# Lark file-card qualification

Captured from real T3 browser pages on 2026-10-16 JST, at 1280 × 800, English locale.
PNG crops retain the same message-area rectangle: x=286, y=80, width=664, height=270.
Only the designated QA conversation and synthetic CSV request are shown.

- Before: base `e6abf66710c5f34267e2e5f8a91f6668c5459366`, original filename-only parent descriptor retained in canonical history, with no file card.
- After: candidate file-card code from `83bad0dee7f841ed2ff96e1d3913f2bcc5c3ff2c`, plus standalone CLI correction `975cd8e14746ace38f0aaa4b38b955830444cb37`, installed as `1.3.0-test.1022.5` with Provider `4.32.0-botharness.21`.
- Both sides use the same genuine native Source Event and Channel history. The isolated baseline received a local canonical DB snapshot, Bot memory and its required Content Purge authority; it received no platform credentials, Provider configuration or active receiver. The earlier incomplete snapshot was correctly refused by Content Purge authority and was not used for captures.
- Light and dark pairs use the same viewport, locale, Channel, message, source author and theme. The before state shows the missing file card. The after state retains unknown MIME/size and offers explicit download.
- `download-recovery.mp4` shows the actual existing application menu's query failure, its download fallback, a page refresh and another file-card download. No application was launched; this Host did not provide an application list. It is not a positive native application-launch claim.
- `stop-unbind-refusal.mp4` shows an acquired file remaining downloadable after reception stop, then the visible refusal and Retry after identity unbind. `unbound-refusal.png` captures that state.

The original CSV is 32 bytes: `name,quantity\nalpha,17\nbeta,221\n`.
Browser and installed CLI SHA-256: `e2b2f68acee5d6d6ed8d7353459e202ac1f618ed25a5cd23505e2f6c716f4821`.
Refresh and same-Profile Host restart retained authorized access. After the original Bot turn settled, repeated viewing and lifecycle checks added no Source Event, Admission, settled usage or Outbox.

See [the full verification record](../../../docs/dev/verification/lark-1022-channel-files.md) for failures, recovery, controlled coverage and remaining platform limits.
