# PR2551 Android native evidence — PARTIAL

Actual run: 2026-10-22, Android 16 arm64 physical phone, 1220 × 2712 screenshot pixels. This is development-native behavior, not Release performance, iOS, TalkBack or Human acceptance.

## Exact inputs and provenance

- Baseline main: `897e9334768baf26547eb155f9ab1b3e7a0ee61f`.
- Combined candidate: `8e09ba57d367dff346a4ab5f3c5d53e5c32c90e6`.
- PR2551: `5df949ff7fad82f128609a858277f161df484bcb` (tests/docs; streaming fixes already on baseline).
- PR2552: `a0a3f17af55af20e48a8c4bb1d47430bda7b7b99`.
- PR2554: `571b4437b4a5c323d243a56e79d25d5bf85f82b8`.
- Both independently computed native fingerprints: `2cde0026048320af2a7fdcafdc10b68875aadd75` (211 sources). Expo58.0.17 / RN0.88.0 / React19.3.0. Reused compatible arm64 development APK, SHA256 `B3A5DF7CA0D0F1C393523BE945FD49EF7263110A6DAA5B89726073759CA9ED3A`, 115259560 bytes. Historical native-build Node24.16/24.21 provenance uncertainty remains; actual Host/Metro runtime explicitly Node24.21.0. No new native build in this run.
- Preparation: 20 files / 163 tests and mobile typecheck passed. Separate baseline/candidate root builds passed; one sequential Metro and isolated QA Hosts. These source/build results are not native acceptance.
- Official provider/model: `deepseek-official` / `deepseek-flash`, verified with actual phone composer → Host → visible reply, not API-only. USB loopback QA route does not prove tailnet or QR scanning.


## PR2551 — PARTIAL; first-reply visibility observed, performance/history unresolved

PASS sampled: baseline fresh DM Human at06:59:56.644Z → canonical `42` at07:00:01.644Z and visible phone reply. Candidate fresh DM `6*7` at07:18:33.567Z → canonical `42` at07:18:37.517Z, visible below Human and above composer with keyboard. Both use non-Connect QA Bots. Baseline actual input was transformed by the existing Chinese IME to `QAbaseline瘦肉汤。Whatis6times7？`; candidate was `6*7`. Fixtures/keyboard states differ, so these are separate successful journeys, not a pixel-matched causal before/after comparison.

Candidate long first reply: Human `2551` at07:20:07.657Z; canonical13,101 characters at07:20:31.701Z. The final40-item ordered-list tail was eventually visible above composer/keyboard, without a wholly blank final reply. Observations at07:21:15.278/07:21:32.936/07:21:56.704 showed progressive tail positions; the last observation is +85.003s after canonical commit, not an exact completion timestamp or FPS measurement. Full low-latency acceptance is not established.

History attempt: second Human at07:22:53.601Z, canonical12,662 characters at07:23:14.289Z. First drag also dismissed the keyboard: old reply39/40 initially anchored, later screen showed second reply15/16. Reading-position retention did not hold in that combined scenario; keyboard transition confounds attribution. A second drag after canonical commit, with keyboard already closed, held33–35 across later snapshots; that proves sampled post-commit hold only. Jump-to-latest then continued gradually. Cross-commit keyboard-preclosed hold remains untested.

UNTESTED: matched long baseline/candidate playback, complete history/keyboard matrix, multiline caret and draft growth, TalkBack, iOS, Release FPS and Human acceptance. UIAutomator idle refusal during playback is recorded, not interpreted as permanent lockup.

Independent research report and M0 are private under `.humanlayer/tasks/stream-performance-research-20261022/`. Historical merged optimizations remain in both inputs. M0 actual Node24.16 confirmed each final body is one large40-item loose ordered list plus introduction; second intermediate prefixes can become a whole-document fallback. Hypothetical ideal-clock14.3–15.0s cursor completion is not actual phone arrival/render timing. Large-list work → delayed playback ticks remains a hypothesis. M1 not allocated.


Recordings: before-short.mp4 is source seconds35–58; after-short.mp4 is37–58; long.mp4 is50–149 (99seconds, real speed). Short clips cover separate actual native send/reply journeys, not identical prompts/keyboard states. Long clip shows continued local presentation after canonical commit; it is not an FPS measurement. History concern is illustrated by hold-before/hold-after stills; full private120s recording retained.

Status/system-navigation pixels cropped for privacy. No generated/reconstructed UI. PNGs reviewed individually through labeled contact sheets; recording frames sampled every5s across their full selected interval. No personal notification or credential visible in reviewed frames. Public clips only contain designated QA journeys; raw originals remain private. This sampling is not frame-by-frame privacy certification.

## Restoration and exclusions

Original development APK restored with install-r and pullback SHA256 `51602EFA76CF63081C664BF9F53B857F843F91B377F99EFDCA6DC699C9809766` matching backup. All eight recorded settings and original ADB reverse list matched; own pairings removed and all three issued credentials revoked. Two original offline Host entries remain and phone preferences were all true. Pre-run drawer-host IDs were missing, so exact original-pairing ID comparison is unavailable; earlier `exactMatch=false` was an invalid empty-baseline comparison, not proof of data loss. Original offline Host copies remain pending. No uninstall, pm-clear or production app changes.

Own Host/Metro processes, descendants, ports and recorders were stopped. Lease and heavy slot released07:53:03.733Z. Evidence: restore-device.json, cleanup-runtime.json, recorders-cleanup.json, resource-release.json and pairings-restore-qualified.json. Global ADB untouched.

Telemetry2570 remained BLOCKED: no independent production-egress isolation or dedicated synthetic container. No analytics configuration, interception, statistics-file mutation or personal opt-out operation occurred. Hermes2565, HostSettings2564, grid2574, Video and native splash2579 were excluded. Splash2579 is accepted for a future main batch containing merge55fe0fa36669e21d343bec7e417b2387d239118f and requires a new native APK; old binary/Metro cannot verify it.

Public images are pixel crops removing status/navigation bars only, with hashes and source binding. Raw logs, identifiers, private profiles, XML and unreviewed frames remain private. Public publication status is tracked in the sole queue; local assets alone do not complete PR evidence delivery.

