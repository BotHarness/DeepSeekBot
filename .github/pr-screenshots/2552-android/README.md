# PR2552 Android native evidence — PARTIAL

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

## PR2552 — PARTIAL; native operations and canonical ownership sampled

PASS sampled: full left swipe exposed actions and left canonical roster unchanged. Explicit native pin/mute/unpin/unmute changed the intended DM canonical fields. Native Android overflow menu also opened for a group. Empty section chooser worked; actual soft-keyboard pinyin composition selected `测试`, followed by `2552`; field and create control remained visible above keyboard. Create+assign produced exactly one `测试2552` section with the intended DM; pin was retained per this frozen PR's original contract. Later group assignment added the group to the same canonical section. Unpin/unmute preserved section membership.

Capture qualification: at07:31:47.306Z, about1.4s after create tap, the create sheet showed the selected name and a `重试` button without a visible error; the07:32:25 snapshot was back on Chats and Host state was successful. Source selects the Retry label whenever `state.selected` exists, including intermediate assignment. This early frame alone neither proves a persistent failure nor verifies the deliberate failure/retry journey. Preserve it as a transient-state observation.

Host switch: unsent draft `255299` on QA Host A was dismissed by switching to the other owned QA Host. That Host chooser exposed only `Baseline Only`; canonical state showed no `255299` section on either Host and no cross-Host assignment. This is an unsent-draft switch case, not delayed in-flight create/refusal verification.

UNTESTED: controlled create-success/assignment-failure retry, refresh failure, offline draft retention, in-flight Host refusal, TalkBack/hidden-rail focus, Reduce Motion, unread mark-read, full font/theme/rotation and form-caret matrix. Native labels sampled only. New organization design, Organize mode, Pinned grid and unpin-on-assign are excluded; original pin-preserving behavior cannot qualify the newer spec.

cjk.mp4 is the first59seconds of actual soft-keyboard composition at original speed. It ends before submission and does not prove successful create/assign; Host facts and subsequent snapshots establish that separately. created.png is the early selected-name/Retry intermediate state; it must not be captioned final failure or final success.

Status/system-navigation pixels cropped for privacy. No generated/reconstructed UI. PNGs reviewed individually through labeled contact sheets; recording frames sampled every5s across their full selected interval. No personal notification or credential visible in reviewed frames. Public clips only contain designated QA journeys; raw originals remain private. This sampling is not frame-by-frame privacy certification.

## Restoration and exclusions

Original development APK restored with install-r and pullback SHA256 `51602EFA76CF63081C664BF9F53B857F843F91B377F99EFDCA6DC699C9809766` matching backup. All eight recorded settings and original ADB reverse list matched; own pairings removed and all three issued credentials revoked. Two original offline Host entries remain and phone preferences were all true. Pre-run drawer-host IDs were missing, so exact original-pairing ID comparison is unavailable; earlier `exactMatch=false` was an invalid empty-baseline comparison, not proof of data loss. Original offline Host copies remain pending. No uninstall, pm-clear or production app changes.

Own Host/Metro processes, descendants, ports and recorders were stopped. Lease and heavy slot released07:53:03.733Z. Evidence: restore-device.json, cleanup-runtime.json, recorders-cleanup.json, resource-release.json and pairings-restore-qualified.json. Global ADB untouched.

Telemetry2570 remained BLOCKED: no independent production-egress isolation or dedicated synthetic container. No analytics configuration, interception, statistics-file mutation or personal opt-out operation occurred. Hermes2565, HostSettings2564, grid2574, Video and native splash2579 were excluded. Splash2579 is accepted for a future main batch containing merge55fe0fa36669e21d343bec7e417b2387d239118f and requires a new native APK; old binary/Metro cannot verify it.

Public images are pixel crops removing status/navigation bars only, with hashes and source binding. Raw logs, identifiers, private profiles, XML and unreviewed frames remain private. Public publication status is tracked in the sole queue; local assets alone do not complete PR evidence delivery.
