# Streaming follow — partial improvement, not background-animation acceptance

Runtime source ded7ade0e (product diff identical to the built experiment). Android Release APK SHA256 AC907F4322C485114FE217C7F98970C3C15E5B2C3D2DB58CCAC8AC4B485BF48D. Baseline runtime75fb4d646, APK8FC5F38EC595408F7236979608E76B4CA476998E934546831BDE7AC8AC03EC72. Physical POCO Android16/API36, arm64, dark/font100%. Same deterministic18-paragraph reply,3 graphemes/100ms; new JS bundled, native inputs unchanged.

Changed: settled streaming content growth requests native animated scroll. Unchanged content callbacks do not interrupt it. Initial positioning and IME settlement remain immediate; dragging holds history; reduced motion disables growth animation. No bubble-height transition.

PASS: streamed reply renders and reaches latest; held-history plus native keyboard open/close preserves QA_STREAM_16 bounds [72,137][918,317]; return to latest and draft c retained. 106 focused tests, mobile types, focused lint/format and release ledger pass.

Visual finding: scroll movement is distributed over more frames. A heuristic vertical-text match on selected 10s windows (30fps decoded,610px wide) observed baseline14 moving matches/median30px vs candidate121/median5px; max42 vs12px. Different replay phases and one run each; this is a diagnostic signal, not FPS or a controlled performance benchmark. Actual background expansion on wrap remains perceptible: **the user's full visual requirement is not yet accepted**. Do not label this a complete fix.

UNTESTED: short/empty-chat growth, rich Markdown transitions, full font/theme matrix, reduced-motion device setting, iOS. Keyboard during continuous animated tail growth not fully covered by the first clip; held-history keyboard covered separately.

Raw recordings/measurement JSON remain in the shared local evidence lane. Public follow.mp4 is real-time and cropped/masked for notification bar and keyboard candidates. Only synthetic QA text remains.

Cleanup: owned Host/replay and reverse4365 stopped, lease released, no settings changed. Candidate remains installed, data/pairings/draft preserved. No merge.
