# Android streaming surface — native QA

Runtime source: `5f979e230bf78ad11d66ae12960e44c1f4428f23` (PR #2899 / issue #1806).
Frozen Release APK SHA256: `80D54299F12397EC100569C07C10511E4132D7D0DEDA86F576B9FB6082C139F1`.
Initial six-case matrix build: `4E032E77F3901B7B6C8BA71201EB7B6AAA1487C5F9AEB37D762AFA9511B21E7E`, same product implementation; source manifest matches the committed files. Rebuilt after source freeze, then used the frozen APK for the six performance runs, keyboard/history/completion, rich-table and reduced-motion checks.
Baseline runtime `ded7ade0e`, Release APK `AC907F4322C485114FE217C7F98970C3C15E5B2C3D2DB58CCAC8AC4B485BF48D`.
Physical POCO 24069PC21G, Android 16/API 36, arm64-v8a, 1220×2712. Development application ID and signature preserved; no uninstall/data clear. Expo prebuild regenerated native registration; this is not an OTA-only change. Dedicated synthetic QA Host and deterministic model replay, separate from the mobile runtime source.

## Result

PASS — background and visible text expand together rather than exposing a new line outside the background. One native paint path clips the existing children; Yoga/Fabric keeps final bounds. 120ms, no duplicate text/bitmap, per-frame JS event, measurement or layout request. Interrupted growth continues from its current painted edge.

PASS — actual font settings 1.0 / 1.3 / 2.0 × light/dark, six matched screenshots and recordings. No text outside the bubble or permanently clipped final line observed. `surface-matrix.jpg` crops notification bars only and labels the actual settings.

PASS — final frozen package: stream while opening/closing the real keyboard; scroll to history during output; return to latest; complete through `QA_STREAM_8`; header returns to idle; draft `c` preserved. Two settled history screenshots four seconds apart have exactly identical body pixels (y=320–2300). `surface.mp4` shows the real-time sequence; notification bar removed, keyboard suggestion region masked, no audio.

PASS — deterministic eight-column Markdown with Chinese, emoji, long unbroken text, a URL and inline code renders and commits with both surrounding paragraph markers. Automatic horizontal swipes did not visibly move the table in either this candidate **or the baseline APK**. Horizontal interaction is **not passed** by this run and is not attributed to the new surface (committed messages use the ordinary View). See issue #2850 for the existing table investigation.

PASS — reduced motion: Android `transition_animation_scale=0`, process restarted; expansion immediately settles. The diagnostic edge sequence again has 52px discrete steps instead of animated intermediate steps, as expected. Restored original value 1.0 and restarted. Font restored to 1.0, night mode to original `yes`; animator scale was only read and remains 1.0.

PASS — 148 focused TypeScript/component/viewport tests; 18 Android native unit tests; mobile typecheck, focused lint/format, ledger and diff checks. Native pixel test proves foreground clipping and zero child measurement/layout work during drawing. Tests do not substitute for the physical-device observations above.

## Performance comparison

Same device, dark/font1.0, cold process start each run, same fixed eight paragraphs (408 body characters), 3 graphemes/100ms. No recording or build during measurements. Order A/C/C/A/A/C, three samples each. `gfxinfo` reset before the send and captured after its return plus a 30s settlement period: actual windows **60.899–61.093s**, not 30s. Temperature 31.3–31.4°C. Historical messages/data retained. Numbers below are first process summaries, not duplicated window summaries.

| Run | Frames | Deadline-late | Legacy jank count | Frame p95 / p99 ms | GPU p95 / p99 ms |
| --- | -----: | ------------: | ----------------: | ------------------ | ---------------- |
| A1  |   3512 |             4 |              1232 | 15 / 23            | 6 / 8            |
| C1  |   3518 |             3 |              1194 | 15 / 22            | 7 / 9            |
| C2  |   3488 |             4 |              1166 | 15 / 22            | 7 / 8            |
| A2  |   3558 |             4 |              1184 | 15 / 21            | 4 / 6            |
| A3  |   3524 |             5 |              1160 | 14 / 20            | 8 / 9            |
| C3  |   3514 |             4 |              1238 | 15 / 20            | 4 / 8            |

Pooled deadline-late: A 13/10,594 (0.123%), C 11/10,520 (0.105%). Legacy jank is a different system definition and is retained above rather than hidden: approximately 33.75% vs 34.20%, within individual-run variation. Frame/GPU percentile ranges overlap. **No reproducible end-to-end frame-time/deadline regression observed in this workload**; this is not a claim of 120 FPS, zero slow frames, universal device performance or iOS qualification.

## Visual comparison and rejected experiments

`surface-before.mp4` / `surface-after.mp4` are five-second actual recordings, cropped to the lower bubble, played at real speed, exported at 30fps. Corresponding PNGs are ten frames over one second. Baseline uses an earlier 18-paragraph replay; candidate uses the same paragraph repeated eight times. These are different phases, not frame-aligned performance samples. Selected raw 60fps-decoded boundary probes observed baseline maximum downward step 52 physical pixels vs candidate 18; diagnostic evidence only, not an FPS measurement.

The intermediate childless-background-only experiment had similar frame performance but was **rejected**: 130%/200% text could appear ahead of the background. It is not shipped. Earlier in-flow height animation was also rejected because it competed with scroll placement.

Capture caveat: scrcpy reported an access-violation exit during shutdown **after** writing the final 90-second recording. The media decoded completely (2,700 exported frames at 30fps), all tested interactions are present, and app snapshots confirm completion. This is recorded as a capture-tool teardown failure, not silently treated as a clean tool exit.

## Limits and cleanup

Android surface result only. iOS keeps its existing renderer; iOS native acceptance, three simultaneous group-header avatars and spoken TalkBack are not qualified by this round. Human visual acceptance of the new surface remains pending; keep Draft, no merge.

Raw videos, six frame-stat files, replay timing, source hashes and APK retained in the Windows shared evidence lane `windows-surface-1806`. Public media contains only synthetic QA content; no notification bar, device identifier, pairing secret, real computer name, keyboard suggestions or audio. Existing phone data, pairing, test lists and draft retained. Cleanup complete: owned QA Host/replay stopped, own reverse port removed and device lease released. Original font/theme/animation settings read back and restored; accepted APK retained in the shared lane.
