# #2602 native color and alignment evidence

Twelve actual iOS Simulator action-only crops, reviewed by QA and source owners. No email, computer list or private full screenshot is included. PNG metadata removed; image data is unchanged. b/a = Before/After; l/d = light/dark; 1/2/3 = large/accessibility-large/accessibility-extra-extra-extra-large. Each pair has identical union-boundary crop coordinates, without resizing. Manifest records source and original/public crop SHA256.

Before: Batch57 main `a1656d18a70f1f115da41092ca159b59e8895f4f`. After: Batch58 frozen `f95bca7e34852cf616cab1508bfaa07ea2104fb5`. English; iOS27 Simulator; viewport 402 × 874. Strict native fingerprint `bf3f308a0826b5b33be4890e4023dbb7e6de4e7b` identical across both; installed executable SHA256 `55de08577ac5ddb38fb0221427750b8d5096dfe10b55a1561bb438c3bf95807a` unchanged. QA owner verified cold exact dev app and loaded custom AccountAction/direct foreground/optical offset. No rebuild/reinstall.

PASS, narrow native visual result: both action texts and both symbols red across all six cases; 12/12 icon ROIs have red pixels and zero blue. Correct accessible labels, enabled/hittable rows, no visible overlap/clipping, complete maximum-size Delete wrapping aligned to text start, live theme/size changes observed.

Optical acceptance remains pending Human review. Former left shift is no longer seen. Sign out color-weighted ink centroid minus trash is +0.44/+0.89/+2.12px in light and +0.41/+0.81/+2.12px in dark, versus Before approximately -1.36/-2.48/-2.86px. This is not a SwiftUI slot measurement or a perceptual threshold. Source review keeps the 1.5pt coefficient: different glyph shapes and a centroid residual alone do not justify retuning a validated source revision. No Human optical PASS is claimed.

Measurements use the original action crops, not these union-boundary pairs: per-action vertical bounds; x cutoffs Before 48/68/92 and After 50/82/120; red means R>G+30 and R>B+30, blue means B>R+30 and B>G+10. Before center uses blue weighted by B-R; After uses red weighted by R-max(G,B). These isolate symbols from text, including Before's wrapped red second line. Coordinates are crop-relative and comparable between rows within each image. They are not font metrics.

DEFERRED: disabled/loading/inertness, actual action/confirmation flow and VoiceOver traits. No safe account fixture; Human actions never clicked. AX cell observations do not prove VoiceOver traits. Both-action confirmation and account-bound pairing cleanup are separate functional scope, unchanged by this color PR.

Draft; independent Human merge authorization required. Evidence publication does not modify product/native inputs. Batch58 RELEASED after owned-resource cleanup, not a product release approval.
