# Profile pager: physical Android evidence

Final code: `da13d453dbec770fb237c30b92ebb848f5c46116` (PR #3131, issue #3127). Same paired isolated Host, synthetic Bots, Chinese, Android 16 USB phone, 1220 × 2712. Emulator was skipped at the Human's request. iOS native QA belongs to the Mac engineer.

## Matched Release comparison

Both base and final packages are arm64 development-id Release builds. Each half-drag image uses a six-second native left swipe from Memory towards Files, sampled after three seconds. The base body remains stationary; the candidate reveals the adjacent body while the shared header and icon strip stay horizontally fixed. This proves interaction behavior, not a comparative FPS result.

| Files                | Actual source                                    | APK SHA-256                                                        |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `b-l.png`, `b-d.png` | main `f70af356d052014fe12b67aeab3c18c1acb979e5`  | `4ef0f6630d51e2244f4c7cba3ff0e9a0da9ec946e82a176fbe238894eab7d26a` |
| `n-l.png`, `n-d.png` | final `da13d453dbec770fb237c30b92ebb848f5c46116` | `e5e190d397524827268d354a7904b49418b5328c545b57f870c26811f1076587` |

All four use font scale 1.0, density 480 and the same fixture grid. Light and dark are separate actual system appearances. Both final variants also completed twelve actual paging swipes and a 24-MOVE reverse/cancel gesture that returned to Memory. Raw images, trees, action logs and APKs remain in the private main-checkout evidence archive.

## Current verification

- `m10l/d.png`, `m13l/d.png`, `m20l/d.png`: four-image contact sheets (Files / Memory / scrolled Settings / Work) for font scales 1.0 / 1.3 / 2.0 at density 480, both themes. Each cell includes actual tab presses, a Memory-to-Files swipe and Back to the chat. Six Back-button pixel comparisons before and after header collapse match exactly (0 of 20,736 pixels differ per cell). Large-text content wraps; intentionally abbreviated ordinary-size file names remain accessible by their full labels.
- `f-cache.png`: Files segment and the seeded text attachment remain visible after Memory, Work and Settings revisits. The earlier Debug lifecycle probe measured one Files subscription and zero stops across three visits at `fbef9eb2132d`; this probe is separate from final Release interaction acceptance.
- `g-l/d.png`, `p-l/d.png`: group tabs and the Files-only read-only Bot pair, both themes. Actual Back returns to the corresponding conversation.
- Final native checks also cover header-started scrolls (banner / name / status), avatar menu open/cancel, three rapid Work → Settings → Work rounds, real keyboard memory edit/save with canonical CLI readback, nested Back, zero animation scale and system right-edge Back. System animation settings were restored afterwards.
- `v-d.mp4` and `v-d.png`: scrcpy native motion evidence from the final Release, dark, font scale 1.0 / density 480. The clip shows a six-second drag, reversal to the original page and tab presses. The private source has a 33.973-second media duration despite the recorder's 60-second wall-clock limit; the public clip starts at source second 2 and lasts approximately 32 seconds. It is re-encoded at 30 fps for sharing and cannot establish native display FPS.
- Current-code mobile tests: 2,430 passed, 11 skipped; Kotlin module tests: 3 passed. Code CI is green. The separate local Windows whole-repository diagnostic crossed revisions and had platform/timeouts, so it is not acceptance evidence.

## Limits and provenance

Maximum display density 610 combined with font scale 2.0 remains **unqualified**: cold message skeletons prevented UIAutomator from obtaining an idle hierarchy, and a warm configuration change recreated the Activity at the root. Failed attempts are retained. These are not counted as successful large-display Profile checks. iOS, actual TalkBack speech and Human acceptance of this new paging experience remain pending; the Human's earlier haptic confirmation predates this change.

Only deterministic redaction was applied: screenshots mask the top 124 status-bar pixels and native bounds containing private local paths; video masks the top 160 pixels and removes audio/source metadata. Contact sheets resize four real captures and add scene labels. Every published derivative was inspected before publication; no product pixels were generated. `evidence.json` records the public build/scene/hash facts and explicit limits. Private originals, device identifiers, paths, credentials and raw native hierarchies are not published.

Historical `a-l.png` is the first implementation (`fbef9eb2132d`) on the reused Debug native client (`07bf48938474`), retained for initial review history. It is not final Release acceptance and is superseded by `n-l.png`.
