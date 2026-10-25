# #2601 native failure evidence

Actual iOS Simulator action-row crops, personally inspected by QA owner and source owner. They contain only Sign out/Delete account; private full screenshots are excluded. Cropped, not rescaled. EXIF metadata stripped; image data unchanged. Six matched pairs: l/d = light/dark; 1 = large, 2 = accessibility-large, 3 = accessibility-extra-extra-extra-large; b = Before, a = After #2601 (FAIL). Each pair uses identical crop coordinates.

Before: `914bfa57ed04807dc3f94a1ed6a4e678da898591` (Batch56). After: `a1656d18a70f1f115da41092ca159b59e8895f4f` (Batch57, merged #2601). English; iOS27 QA Simulator; full viewport 402 × 874. Manifest records exact source, capture time, crop coordinates, original crop and public image SHA256.

Installed executable SHA256: `55de08577ac5ddb38fb0221427750b8d5096dfe10b55a1561bb438c3bf95807a`. Strict native fingerprint Before `b3e74315f0c2d639dd1c1ff73e56182e0fb86c0e`; After `bf3f308a0826b5b33be4890e4023dbb7e6de4e7b`. QA owner qualified binary reuse: fingerprint difference is expo-router58.0.25 peer-suffix paths; 21 iOS/2 Android files and two config plugins are byte-identical; autolinking differs only in those paths. No rebuild/reinstall. Cold launch and loaded JS check confirmed two tint calls.

FAIL in all six cases: Sign out text changes from blue to red; both icons remain blue, while Delete text remains red. Sign out appears optically left of the trash glyph. These images are failure evidence, not proof of the successor fix.

Observed: correct labels, enabled/hittable rows, readable two-line Delete at maximum text, live theme change. Disabled/loading behavior, callbacks/confirmation and VoiceOver DEFERRED: no safe account fixture; Human actions never clicked. AX cells do not independently prove VoiceOver button traits. No account deletion authorized. Native acceptance remains open under #2581.
