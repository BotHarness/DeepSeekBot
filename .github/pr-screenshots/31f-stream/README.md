# Exploratory Android playback result — not a performance qualification

Fixed tested main `31f313fcdaf0d1758e3dd02285e6ba15a91bf884`, Android 16 arm64 Debug APK `DB841DD80BEE8606B18150804CC0788A13761F87477D8138B0C47E745BDC7DC1`. One live official-model reply, keyboard closed, no navigation/gestures/recording during sampling. Not deterministic replay or A/B.

165 independent 2Hz synchronous metadata snapshots, each with one focused conversation, one owner and at most one queue. Cross-snapshot owner-reference identity was not established. Host committed 12,557 text units at 09:54:04.580Z. Sample45 observed received=12557,cursor=5452,pending=7105 during 09:54:04.911–05.482Z. Sample150 still had pending=63 during 09:54:59.414–59.785; sample151 observed complete during 09:54:59.926–09:55:00.331. Full/complete observation envelopes are 54.444–55.420s apart, not exact arrival/completion event timing.

This supports substantial post-receipt playback backlog. It does not establish FPS, network arrival timing or whether layout cost, playback tick limits or probe disturbance caused it. Probe RTT P95≈522ms/max≈1067ms includes all transport/JS/scan/serialization work. The controlled object-call probe was separately refused with protocol code -32600; it was not an app-performance failure.

`narrow.png` is an actual post-completion screenshot crop, captured about 23 seconds later: the text remains an extremely narrow vertical column. This is a visual failure requiring diagnosis; the screenshot does not establish when the layout became narrow or its causal contribution to drain time. System status, Host labels and personal data were cropped away. No product source was changed.

Diagnostic processes exited, object groups released; full device restoration and lease release completed 2026-10-22T10:27:07Z. New PR #2589 is not included in this tested SHA.
