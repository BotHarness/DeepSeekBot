# T6 video wallpaper evidence

Web baseline: T5 `70e033b486eee91f0cd4c739461e727e4842b6b5`; after: this PR. Chromium 1440×1000. Generated silent WebM VP9 (960×600, 24 fps, 1.5 seconds), no private media. Actual time wrap and decoded frame counts prove two loops. A different active tab pauses with stable time; focus resumes. Original bytes/poster/crop survive source deletion and reload. A real invalid media source triggers poster fallback; an injected blocked decoder on reload restores the saved poster without changing the accepted record. Live CLI imports/crops/reports state, oversized video and quota failure preserve accepted media, exit unloads the old source. Image T5 journey also passes against this code.

macOS official DSH 0.2.1-rc.2, 2560×1640 captures: native video upload/recrop, repeated loop samples, actual main-window minimize with stable time, restore/resume, real media error and visible saved poster/reason. Original clip deleted, same app storage restarted into a different isolated linked Host, exact bytes/crop/poster restored and video playing again. Window identity was verified by `dsh-app://app/`; the first failed minimize attempt hit a separate welcome window and is not accepted evidence.

62 focused tests across 10 files, lint, root/mobile typecheck, formatting and build passed. CI is separate. Tested codec is VP9 WebM on these two runtimes; other codecs and Windows are not qualified here. No model was needed. Human QA remains pending, PR unmerged, no deployment.

The screenshots show key states, not motion proof; use the timing JSON and reproducible journey. Source clips, original-byte arrays, login URLs and Host/application directories remain private.
