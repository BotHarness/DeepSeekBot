# Local QA evidence and release archives

Use this convention when capturing development screenshots or recordings, handing native QA
between machines, or retaining images for a release. macOS owns iOS Simulator/iPhone checks;
Windows owns Android emulator/phone checks. Follow each machine's
[iOS queue](device-qa.md) or [Android queue](android-device-qa.md) before operating resources.
An archive does not allocate a device or authorize a release.

## Save where the Human can find it

Default to the **main checkout on the machine that ran the check**, outside disposable
worktrees. Resolve that checkout from the Git common directory and the local queue; independent
clones use the queue's configured main checkout. Use repository-relative paths in shared reports,
not a hard-coded macOS or Windows home directory. A Human-selected folder overrides this default;
record its location privately in the task index.

```text
.humanlayer/tasks/<task>/
  README.md                          # clickable local evidence index and current blockers
  screenshots/<platform>/<lane>/<run>/
    raw/                             # original PNGs; private, unchanged
    redacted/                        # reviewed copies suitable for the intended audience
  recordings/<platform>/<lane>/<run>/
  manifest.json                      # source, build and per-step evidence provenance
```

Use `ios/simulator`, `ios/phone`, `android/emulator` or `android/phone` for platform/lane.
Use a short run ID containing the capture date and source SHA prefix. File names describe the
scene, before/after state, locale, theme and OS text size, for example
`composer-after-zh-dark-max.png`. Record the actual OS text-size setting in the manifest;
`max` alone cannot identify the setting. Reruns get new run IDs rather than overwriting evidence.
Keep feature-showcase images under a named scene in the same layout.

Existing tools keep their output contracts. In particular, `android-qa.ps1` writes captures and
private serial manifests under the Windows queue's `evidence/<batch>/<lane>/`; verification
tools may use their own task directories. Add links from the task index to these originals, or
copy selected files and record their source and SHA-256. Do not move live runner output, alter
its manifests, or duplicate a whole build/cache just to follow the display layout.

## Record what each image proves

Before capture, freeze the source and build identity. Alongside each journey record:

- Issue/PR, task and batch ID; full source SHA, base/candidate SHAs, and acceptance SHA when
  assigned. Record every dependency head for an integration batch and any dirty-source diff.
- Platform, simulator/emulator versus phone, device model, OS version, app identity, version,
  build number/profile, native input fingerprint and binary hash/build receipt where available.
  A reused dev client records both binary source and loaded JavaScript source.
- Capture time with timezone, locale, theme, viewport and exact OS text-size setting; route
  type and model identifier when relevant. Use synthetic display names and test content.
- Action, visible result, canonical Host readback when required, and `pass`, `fail` or
  `untested` with a reason. Link each screenshot/recording and record its SHA-256.
- Original-to-redacted mapping, redaction/inspection status and any public evidence URLs.

Keep serials, private paths and environment details in the private manifest only. Keep credentials,
pairing links, QR payloads, account secrets and private keys out of captures and manifests.
Separate automated results, Human QA, Simulator/emulator, physical device and real-network
results. A screenshot does not prove a gesture, notification delivery, persistence or a model
reply; retain the corresponding interaction/recording/readback. iOS evidence never qualifies
Android, and a development binary does not qualify a store binary.

Before sharing, inspect every selected frame for status-bar details, real computer/account names,
paths, keyboard suggestions and unrelated personal content. Keep originals local and produce
separate redacted copies. For full-frame showcase images, prepare synthetic names/data and a
privacy-safe status bar before capture; preserve the original resolution and disclose any
redaction. Generated artwork is presentation material, not runtime QA evidence.

## iOS performance evidence

Follow [iOS performance verification](ios-performance.md) for valid replay, symbolicated traces,
matched physical Release A/B and measurement definitions. Index profiles and traces beside the
visual evidence; video frame counts and JS callback cadence do not prove displayed FPS. Preserve
invalid runs and instrument failures, and separate Simulator diagnostics from device acceptance.

## Preserve a release snapshot

After the release coordinator freezes one acceptance SHA, both machines use that SHA for their
final source/build checks. Each machine retains its own platform evidence under:

```text
.humanlayer/releases/<release>/<acceptance-sha12>/
  README.md
  manifest.json
  ios/                               # retained on macOS
  android/                           # retained on Windows
```

For example, a 1.5.0 run uses `release-1.5.0` as the task slug and `1.5.0` as the release folder.
The shared directory shape is not automatic synchronization: the coordinator's index records
which machine holds each platform and which sanitized report is accessible to reviewers.
Mobile app versions/build numbers remain independent of the npm version and are recorded.

Copy the selected originals, redacted derivatives, necessary recordings and provenance before
cleaning up a task worktree. Verify copied file hashes and open the images from the archive index.
The release manifest maps the accepted commit to the npm tag/package and exact mobile builds,
with separate acceptance and publication statuses; leave unknown or pending fields explicit.
If a fix changes the acceptance SHA, create a new archive directory and identify which checks
were rerun or remain untested. Keep prior evidence as prior-SHA evidence.

Release archives and unresolved QA evidence are retained material, not disposable caches. Keep
them until the Human explicitly authorizes deletion or a verified relocation. Do not copy Host
profiles, credentials, app sandboxes, dependencies or native build folders into the archive.

## Publish selected evidence

For PRs, use reviewed derivatives and the commit-pinned image format in
[UI/UX PR visual evidence](pr-ui-visual-evidence.md); the queue may publish its assigned evidence
branch. Record the public URL and read it back to confirm that it renders. A local path is a
local inspection link, not proof that a GitHub reviewer can open the image.

For release notes or store material, select from the accepted archive, check the intended
audience and attach only the approved public derivatives. Image retention does not authorize
uploading private originals, publishing a GitHub Release, submitting a store build or notifying
testers. Keep local inspection links in the Human handoff and public evidence links in GitHub.
