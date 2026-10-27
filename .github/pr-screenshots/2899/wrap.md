# Streaming line-wrap experiment — Android

Task: codex/local/01a166ee-4963-7660-9e23-f91eba8f2f5c. Refs #1806, #2899.

Result: **experiment rejected; product source restored**. This does not resolve streaming line-wrap jitter.

- Baseline: PR head e5cacbb88b1ed55d3773057b3d825f1a6d05873c; runtime 9e7a78c74ca2e626db56790b7ac824db8d31eb4f. Release APK SHA256 EF582630977C1294314A2989DE38B905CE374838CD4F712CE86D2F42C412605D.
- Experimental source: same baseline plus five lines adding a streaming-only Reanimated LinearTransition.duration(160) to PressableBubble; disabled for reduced motion. Local patch retained, not a product candidate. Release APK SHA256 B80B1CE8ABA75DA79128CF89DF29A89FFDED1F30D6A84B75EBDA76F3C7B0F84F.
- Physical Android 16/API36, arm64-v8a, font100%, dark. Native dependencies unchanged. New JS bundled for experiment.
- Same isolated Bot, same 18-paragraph/927-character deterministic reply, 3 graphemes/100ms. Baseline and experiment each recorded once; excerpts are real-time, different points in the replay, not synchronized FPS benchmarks. Replies committed (revisions25/27).

## Findings

| Check                                                             | Result                                        |
| ----------------------------------------------------------------- | --------------------------------------------- |
| Real-time streamed Bot reply commits                              | PASS both                                     |
| Baseline discrete line-wrap growth                                | Reproduced                                    |
| Streaming-only layout transition eliminates visible discontinuity | FAIL                                          |
| Direct overlap of bubble and thinking indicator                   | UNCONFIRMED in inspected excerpts             |
| Keyboard/held-history regression on experimental package          | UNTESTED; candidate rejected before expansion |
| Light/large-font/iOS/reduced-motion device matrix                 | UNTESTED                                      |

The experiment makes height growth gradual, but the list corrects its offset to the final content height first. The bubble bottom then catches up, producing a visibly enlarged gap above the thinking indicator which closes again. This is not a successful fix. The next implementation must coordinate content growth and follow offset, not merely animate the bubble independently. Existing keyboard coordination and immediate streaming remain constraints.

A local color-boundary probe helped locate frames; it is heuristic and is not reported as calibrated geometry or FPS evidence. No frame-rate improvement claim.

Recordings crop away the notification bar, environment header, and composer/keyboard region; only synthetic QA conversation remains. No audio. The baseline app was restored in-place, with data/pairing/draft preserved. No device font/theme settings changed. Owned Host/replay and reverse mapping stopped; device lease released.
