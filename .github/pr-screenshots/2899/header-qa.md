# Header activity — Android QA

Runtime source: 75fb4d646 (PR2899). Release arm64-v8a APK SHA256: 8FC5F38EC595408F7236979608E76B4CA476998E934546831BDE7AC8AC03EC72. New bundled JavaScript; native inputs unchanged. Physical POCO, Android16/API36, dark, font100%. Dedicated synthetic Host and deterministic Bot replay; no external model.

PASS: DM avatar retained; current step replaces name while active; idle name restored. Bottom working row and reserve absent. Opened native keyboard during real streaming; composer remained reachable. DM profile opens and returns. Group identity remains while one active member avatar sits at trailing edge; group profile opens and returns. Accessible DM/group labels retain identities and activity. Existing draft c and pairing retained.

Automated: 99 behavior tests plus 5 style-guard tests pass; mobile typecheck, focused lint/format, bilingual ledger check pass. Tests cover paused/idle name restoration and the three-avatar cap. They do not prove native geometry.

UNTESTED: three simultaneously active member avatars on device, light/default-intermediate-max font matrix, spoken TalkBack, held-history regression for this head, iOS. No FPS or fully smooth line-wrap claim. This removes the independent thinking overlay; it does not animate streaming bubble height.

Evidence: header-before.png (previous baseline), header-after.png (current DM), header-group.png (one active member), header.mp4 (real-time stream + keyboard). Synthetic QA text only. Notification bar cropped; keyboard candidates blacked out in video. Screenshots are from different moments of the same replay content, not performance benchmarks.

Cleanup: temporary QA Activity Header group deleted, owned Host/replay stopped, reverse4365 removed, lease released. No font/theme changes; app data/pairing retained. Candidate remains installed for Human testing. No merge performed.
