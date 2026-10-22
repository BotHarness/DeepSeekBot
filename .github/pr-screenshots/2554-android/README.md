# PR2554 Android native evidence — PARTIAL

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


## PR2554 — sampled geometry improved; full acceptance remains PARTIAL

Baseline and candidate share the same HarborBot/42 data for row captures. Default/intermediate1.3 and extra2.0 stress light/dark captured. Baseline2.0 places title, time and preview on separate lines. Candidate places title/time on the same horizontal line with preview/status below and real PR2552 trailing menu. At2.0 dark, title/time are still truncated; this is not a full-content-visibility pass.

Actual OEM maximum was selected on the system font slider: label200% maps to Android `font_scale=1.45` on this phone. It is distinct from direct2.0 stress. Matched light/dark OEMmax screenshots with `HarborBot 中文长标题 Native layout` and `NoTime 无时间` show baseline header/time stacking versus candidate single-line title/time and preview second; no-time row has no blank timestamp row. Long title is visually truncated; full accessible name was sampled in XML, not through TalkBack. Baseline light screenshot also shows transient text truncation; no claim of identical animation phase.

Live font changes produced Expo Router linking/navigation warnings in both sources. Warnings remain visible in published full-app crops, with no attribution to these PRs. Some warnings overlap bottom navigation. Long-title row opening, complete accessibility and iOS/Human acceptance remain untested.




Status/system-navigation pixels cropped for privacy. No generated/reconstructed UI. PNGs reviewed individually through labeled contact sheets; recording frames sampled every5s across their full selected interval. No personal notification or credential visible in reviewed frames. Public clips only contain designated QA journeys; raw originals remain private. This sampling is not frame-by-frame privacy certification.

## Restoration and exclusions

Original development APK restored with install-r and pullback SHA256 `51602EFA76CF63081C664BF9F53B857F843F91B377F99EFDCA6DC699C9809766` matching backup. All eight recorded settings and original ADB reverse list matched; own pairings removed and all three issued credentials revoked. Two original offline Host entries remain and phone preferences were all true. Pre-run drawer-host IDs were missing, so exact original-pairing ID comparison is unavailable; earlier `exactMatch=false` was an invalid empty-baseline comparison, not proof of data loss. Original offline Host copies remain pending. No uninstall, pm-clear or production app changes.

Own Host/Metro processes, descendants, ports and recorders were stopped. Lease and heavy slot released07:53:03.733Z. Evidence: restore-device.json, cleanup-runtime.json, recorders-cleanup.json, resource-release.json and pairings-restore-qualified.json. Global ADB untouched.

Telemetry2570 remained BLOCKED: no independent production-egress isolation or dedicated synthetic container. No analytics configuration, interception, statistics-file mutation or personal opt-out operation occurred. Hermes2565, HostSettings2564, grid2574, Video and native splash2579 were excluded. Splash2579 is accepted for a future main batch containing merge55fe0fa36669e21d343bec7e417b2387d239118f and requires a new native APK; old binary/Metro cannot verify it.

Public images are pixel crops removing status/navigation bars only, with hashes and source binding. Raw logs, identifiers, private profiles, XML and unreviewed frames remain private. Public publication status is tracked in the sole queue; local assets alone do not complete PR evidence delivery.

