# Android application dialogs — native comparisons

Six matching theme/font cases for Unpair and Host menu, plus dark/light default-font Create and Disband comparisons: 16 pairs / 32 native screenshots.

Before ran `c7dc11fddfde5432c597671cce17422fe4283b93`; its dialog implementation matches merged main `ccfcbd17175df2eb019cf5e71b2e038ddd41d14f`. After ran `704fa745bd190d57b491b9b6e56589ffdfbc908b`; app behavior is unchanged at `50d810da197c748fabcb92bf38b6e25a3d5fd0d0` (formatting/test-file isolation only). See `provenance.json` for environment and limits.

Each image is a fixed matching dialog-focused crop of the real Android frame: x0/y650/width1220/height1500. All dialog panels and actions remain inside the crop. It omits the system status bar and developer chrome; no pixels inside the dialog were edited. Full frames and XML remain private. A development-client Expo Router duplicate-linking warning appeared outside this crop during ADB font-scale changes in both baseline and new runs; the normal cold reopen was separately verified. These images do not establish that warning was fixed.

`native-matrix.json` records all six native Unpair cases: panel bounds, minimum48dp actions, equal-width normal/intermediate actions, stacked large-text actions, and cancel/Back/backdrop dismissal with the Host drawer and pairing retained. Create cancellation also passed in both themes. `native-extra.json` records group confirmation cancellation, real search-keyboard dismissal on opening a menu, and cold-open retention of the original Host and QA group. No shared Host was unpaired, group disbanded, member removed, message sent or pending request answered.

Logical tests cover explicit confirmation, single execution while pending, refusal/retry and stale-request isolation. Native destructive submission and native failure injection were not exercised on shared data. iOS native, TalkBack gestures and120FPS remain unqualified. The UI adapter retains iOS system alerts/action sheets and does not replace OS-owned permission prompts.

`original-speed.mp4` is a real native menu → confirmation → Cancel recording, cropped to the same dialog region and scaled to616px wide, without audio or frame interpolation. It retains227 source frames at their original timing (21.64s). `half-speed.mp4` retains those same227 frames with doubled presentation timestamps (43.13s). The recorder's35s wall-clock limit includes idle time that the variable-frame-rate stream does not encode after its final changed frame. These clips establish interaction presentation, not an FPS benchmark.
