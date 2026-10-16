# Qualify one phone/computer Beta pair

Implements the local qualification path for [#1931](https://github.com/BotHarness/DeepSeekBot/issues/1931)
under [ADR-0214](../adr/0214-beta-promotes-verified-phone-computer-combinations.md).
This is not a publisher, schedule, store approval, or runtime qualification report.

## First combination and current blockers

The first target is **iOS TestFlight + macOS arm64 using the existing npm product packages**.
It is a target, not an approved baseline. Android, Windows and Linux remain unqualified.
No previous stable or Beta computer version is assumed mobile-capable.

The earlier iOS build `a536bd0b-a6eb-4613-afe5-03a4c994d5a6` and Android build
`59ab9f72-7966-45de-8ad5-e3083a301baa` predate this implementation. They are not evidence for
this code. Their current store processing, eligibility and installation are not established
here. Do not reuse their build IDs in a new qualification record.

Before a new build: inspect the existing EAS plan's remaining allowance and the shared Mac's
disk/QA queue. Unknown allowance means **pause**, not a paid build or retry. Do not enable OTA,
daily builds, auto-submit, npm tags, or production releases. Routine approved Beta updates are
at most weekly and only for worthwhile changes.

## Runtime compatibility contract

The owning paired-device module registers `GET /api/botharness/devices/compatibility` through
the existing authenticated Connection fetch service. A phone uses the existing Device-authenticated
gateway at `/botharness-device/api/botharness/devices/compatibility`. No new credentials or
database authority are introduced. The matching agent command is:

```sh
deepseekbot device-compatibility --host <isolated-host-origin> --token-file <private-token-file>
```

Schema 1 reports `{ protocol: { min, max }, host: { version, source, platform, arch },
features: { push } }`. Application-defined phone protocol 1 describes the current RPC/live-stream
contract, not the pairing-link schema or DSH's version. Bump the supported interval only after
testing the relevant wire contract; unknown future schemas are not silently accepted.

- Matching protocol: connect; show Host version/source in Settings. This is **not** artifact qualification.
- Disjoint protocol: stop before roster RPC/live streams, show `protocol-incompatible` with an update
  path, preserve the pairing credential and allow explicit retry after updating. Do not ask to pair again.
- Known unsupported push: keep chat working, hide notification controls with guidance; the push
  transport also checks compatibility before registration, settings, preference changes or a test.
  Unregister remains possible for cleanup.
- Legacy HTTP 404: mark compatibility unverified and preserve the old connection/push behavior.
  Network errors, 401, 5xx and malformed contracts are not legacy-compatible successes.
- Reconnect probes again. No handshake response can mark a pair Human-approved; that remains
  exact-artifact release evidence outside the Host's runtime data.

## Build identities

Local development retains `DeepSeekBot Dev` / `ai.botharness.deepseekbot.dev`.
The `store-test` profile sets `DEEPSEEKBOT_APP_VARIANT=store`, selecting **DeepSeekBot** /
**`app.deepseekbot.mobile`**, owner `deepseekbots-team`, and the existing EAS project. Beta and
future production use this same formal identity; there is no separate Beta app ID.

EAS uses **remote build numbers** with auto-increment. Before the first build from this configuration,
with the store variant selected, inspect/synchronize the remote iOS and Android versions using
`eas build:version:get` / `eas build:version:set`. Compare against both stores and every finished or
pending build; do not reset a counter. Earlier observed numbers (iOS 3, Android 5) are not a current
maximum. The app reads native installed version/build numbers with `expo-application`, not a stale
Expo config value. This native dependency requires a new native build.

After quota and explicit build authorization, from `apps/mobile`:

```sh
DEEPSEEKBOT_APP_VARIANT=store npx eas-cli@24.14.0 build --profile store-test --platform ios
```

Use a clean committed source, preserve its full SHA and the immutable EAS build ID, and retain the
downloaded IPA/AAB checksum. If using `EAS_NO_VCS=1`, set `EAS_PROJECT_ROOT` to this worktree root and
`BOTHARNESS_BUILD_SHA` to its **verified clean full SHA**; review the archive so secrets and unrelated
work do not enter it. The displayed short source stamp is a diagnostic, not a checksum proof.

Prepare the computer packages using the existing `scripts/product-artifacts.mjs` and packaged-profile
qualification flow. Preserve **all** package tarballs plus `artifacts.json`, full source SHA, the
product version and existing install instructions. Do not build a new installer or point `next` at
an unqualified Nightly candidate. Never auto-restart the tester's Host.

## Exact artifact record

Keep a sanitized JSON record with these fields (replace descriptions with observed values):

```json
{
  "schemaVersion": 1,
  "mobile": {
    "platform": "ios",
    "appId": "app.deepseekbot.mobile",
    "version": "0.0.1",
    "buildNumber": "observed positive integer as a string",
    "buildId": "immutable EAS UUID",
    "source": "full 40-character source SHA",
    "sha256": "64-character downloaded artifact checksum",
    "installUrl": "https://testflight.apple.com/join/actual-invitation"
  },
  "computer": {
    "format": "npm",
    "platform": "darwin",
    "arch": "arm64",
    "version": "2.0.0-beta.1",
    "source": "full 40-character source SHA",
    "manifestSha256": "64-character SHA-256 of artifacts.json",
    "installUrl": "https://github.com/BotHarness/DeepSeekBot/releases/tag/exact-version"
  },
  "evidence": [],
  "baselines": []
}
```

This template is deliberately not a passing record. The example product version is not a published version.

```sh
node scripts/release-combination.mjs --id pair.json
node scripts/release-combination.mjs --check pair.json \
  --mobile-artifact /private/path/app.ipa --computer-artifacts /private/path/packages
```

The checker hashes phone bytes, verifies the existing qualified npm set (including every package's
integrity), and binds witnesses to a hash of the exact pair. Exit 1 means invalid identities/evidence;
exit 2 means matching artifacts but missing/blocked qualification; exit 0 means **evidence recorded**,
not permission to publish. It does not inspect IPA signing, independently verify statements on linked
pages, or authenticate the approver. Human review must check EAS/store/native identity and the linked
evidence; a JSON assertion is not a signature or an authorization system.

Each evidence entry is `{ check, combination, status, by, at, url }`: `combination` is the `--id`
result, `status` is `passed` or `blocked`, `at` is an ISO timestamp, and `url` links to sanitized
reviewer-visible evidence. Required checks are `identity`, `fresh-install`, `upgrade`, `pairing`,
`dm-reply`, `reconnect`, `notifications`, `store-upload`, `store-processing`, `tester-eligibility`,
`store-install`, `shared-binary-safety`, `quota`, `human-qa`, `distribution-approval`.
Human QA and distribution approval must follow the qualification evidence. A changed artifact/source
invalidates the old witnesses. Do not include tokens, personal tester addresses or workspace content.

Both approvals also carry `reviewedEvidence`, obtained with
`node scripts/release-combination.mjs --approval-digests pair.json`. First record Human QA with its
digest after reviewing all non-approval evidence, baseline dispositions and install URLs. Then compute
the digests again and record distribution approval, which also binds the Human QA witness. Changing
any reviewed content invalidates approval even when timestamps and binaries remain unchanged.
Computing a digest does not grant approval; only record the named Human's actual decision.

Enumerate `stable`, `beta-1`, `beta-2` baselines once each with
`{ kind, status, reason, evidenceUrl, mobileSha256, combination? }`. Status is `tested`, `blocked`, or
`not-established`; tested requires an exact combination ID. `not-established` needs a documented
registry audit, not an assumption that old stable supports phones. Existing incompatible/untested
baselines are `blocked`, never `not-established`. All supported Host OS/architecture combinations a
shared mobile binary can reach need linked evidence in `shared-binary-safety`; store tracks cannot
restrict a phone build by computer OS.

## Native and Human gate

Follow [shared device QA](device-qa.md), with the exact branch/head and installed package identities.
Only the assigned runner touches the shared Simulator, iPhone and QA Host. Use the packaged computer
Profile, not a source-only Host, and the actual TestFlight app for final acceptance:

1. Fresh install and upgrade; preserve pairing/workspaces, back up real data, refuse irreversible migration.
2. Pair, send a real DM, see a real PersonaBot reply, disconnect/reconnect and receive/open a notification.
3. Check About against the native version/build and computer artifact record; copy both diagnostic IDs.
4. Capture light/dark compatibility guidance, unsupported notifications with working chat, and the
   incompatible update/refusal path. Automated fixture coverage alone is not native visual proof.
5. Separately record upload, processing, tester eligibility, invitation and actual installation.
   Export-compliance answers and any agreements must be completed truthfully by the Human.
6. Obtain Human QA, then separate distribution approval; leave #1931 open until those gates pass.

No Android device is available on this Mac. Mark Android native testing unrun. Do not start #1932,
expand platforms, submit/upload, invite testers or publish merely because local checks are green.
