# Android offline notice placement

Issue #3257; runtime source2d0ec0b9a01be230db7306a9a9009fd639c3f83e, base e9a575aea7ece480682a45cf386865efc8439c1c. Physical Android16 phone,1220x2712, Chinese/dark/font1.3, fixed121-message test conversation. Release arm64/Hermes; APK SHA25629057DF41A7D10B1F20BA961A059B6C6870F0AD40C4F675F641EC266BFB0ADEA. Installed hash and development signer verified. No artificial delay or instrumentation.

Before b.png: base APK7400A60518FABCBB1F3BA3FD8031D24FE52A358B1B9948D424E9FB18B73BB4E4. Message114 y378 before outage,487 offline,378 recovered. All six checked messages114–119 shift109physicalpx.
After a.png: candidate message114 y347 in all three states; all six exact message/text bounds unchanged. Initial gesture settles31px differently between runs; comparison is each run against its own pre-outage anchor, not equality of unrelated scroll positions. Same fixture, screen, locale, font, theme and workflow. Retry and draft32760009 remain visible. Automatic reconnect succeeds without pairing or manual retry.

Workflow: open fixture, type unsent numeric draft, dismiss keyboard, scroll up, background app, disable Wi-Fi8s, resume offline10s, restore Wi-Fi, observe recovery. Both cropped frames are at recording PTS43s. Status bar removed; no synthetic UI.

Captured-frame follow-up:101 recorded frames in PTS33–58, unique message114 header template stays y348 at2physicalpx sampling resolution (XML reports347). Injected +/-4px shifts correctly detected. No observed movement in those captured frames; not all native presented frames, FPS, or a speed measurement.

k.png: candidate keyboard expanded, bottom-following; latest message remains above notice, retry and composer above real keyboard. Draft retains exact text. Latest bounds before[936,1025][1136,1096], offline[936,916][1136,987], after[936,1025][1136,1096], consistent with reserving109px for notice. Initial12s recovery snapshot still offline; later observation automatically recovered. Do not claim a12s reconnect bound. Own unsent draft cleared after checks; Wi-Fi restored.

74 related tests +5 style guards, typecheck, changelog, feature-map checks passed. Native red coordinate check fails on parent and passes on candidate. No transport changes or new scrolling commands. Web preview cannot exercise the Android-only KeyboardStickyView/list-origin layout; native captures are primary. iOS placement unchanged but no new iOS native run. Default/max text, light theme, accessibility service, other notice types and Human QA remain pending; this draft does not close #3257 or claim3x loading. HTML omitted: a linear component placement change is explained by the PR tree and this evidence.
