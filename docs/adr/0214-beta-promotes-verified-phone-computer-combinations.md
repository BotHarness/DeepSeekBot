---
Status: Accepted
Date: 2026-10-16
Issues: [#1930](https://github.com/BotHarness/DeepSeekBot/issues/1930)
---

# Beta promotes verified phone/computer combinations, not daily builds

DeepSeekBot's phone client depends on capabilities in the Human's computer Host, while the two ends update independently. We choose **internal Nightly candidates, low-frequency opt-in Beta promotion and separately approved production releases**, rather than pushing every successful build to users. Beta reuses the formal mobile identity and the existing computer installation path; a release qualifies a combination of artifacts, not equal version numbers.

This is an accepted target design. The ticket graph owns implementation status. This ADR does not enable schedules, approve a distribution, assert store availability or authorize extra expenditure.

## Cadence, identity and cost

- Nightly is an internal candidate, not a promise to generate or distribute a binary every day. Daily change checks may run; only relevant changes need builds, identical inputs are deduplicated and unchanged qualified artifacts are reused.
- Routine Beta is **at most weekly**, only when worthwhile changes pass qualification. Critical-fix/security exceptions require Human approval and the same cost and safety gates. Product-owned prompts do not repeatedly nag for the same version; store/OS notification behavior is outside that guarantee.
- Use only existing approved plan allowances. Insufficient or unknown remaining allowance pauses work and reports why; no paid overage, credit purchase or automatic plan upgrade. Retries and concurrent jobs count toward the same allowance.
- The mobile app remains **DeepSeekBot**, bundle/package `app.deepseekbot.mobile`, website https://deepseekbot.app. Beta and stable are not separate side-by-side mobile installations. Joining or leaving Beta is not a guarantee of immediate downgrade.
- First delivery uses TestFlight / Google Play binaries, not OTA or EAS Update. The computer reuses the existing artifact/install/update path; a new desktop installer is not a prerequisite.
- Reuse the existing npm release preparation and artifact provenance. Do not move a user-facing prerelease tag to unqualified Nightly output or advance the public stable install identity during candidate preparation.

## Compatibility is per connection

A **Release Combination** identifies the exact phone and computer artifacts and platform pair qualified together. Each end opts into Beta independently. The computer side includes the qualified DSH Profile/Bundle composition and Provider pins; those are DSH-native composition concepts, not a new release-channel authority.

For a new phone build, qualify current stable and the two most recent approved Beta computer releases where such baselines exist. Establish the first mobile-capable baseline explicitly; a stable label alone does not prove that an old release can pair. Record supported, verified and unverified combinations separately.

A compatible connection retains core functionality. Missing optional capabilities disable only their dependent feature with upgrade guidance. A genuinely incompatible protocol refuses the connection with an actionable reason. Unknown versions are not rejected solely for being old, nor accepted as proven compatible solely because their version looks newer. The concrete handshake remains implementation work through the existing owning Host boundary; this ADR invents no upstream DSH API or second persistence owner.

The same mobile binary can reach multiple Hosts on different operating systems. Stores cannot reliably target it by the user's computer OS. Platform-specific qualification may advance independently only when distributing the binary preserves every supported combination it can affect; shared protocol or data-format changes require all affected combinations to pass. An untested combination cannot be protected merely by asking its users not to update.

## Promotion and evidence

The release record binds exact source/configuration and artifact identities, platform combinations, compatibility results, installation paths, recovery constraints and Human approval. Changing artifact bytes or relevant evidence invalidates the approval; silently rebuilding after approval is not promotion of the qualified candidate.

Qualification includes fresh installation and upgrade, pairing, a real message/reply, reconnect, notifications and the promised compatibility combinations. Focused automated checks, native/runtime evidence and Human QA are separate gates. A source checkout or dev build does not prove the packaged candidate.

Preparation, verification, approval, upload, store processing and actual tester installation are distinct outcomes. Cross-store availability is not atomic. Invite-only Beta starts with one actually verified pair; widen coverage after Human QA, without presenting partial coverage as all-platform support.

A Human explicitly approves Beta distribution. Public production release remains a different approval and retains platform-specific enrollment, review and testing requirements. A GitHub milestone, accepted ADR or green CI does not grant either approval.

## User control and recovery

Computer updates require confirmation and do not automatically restart or interrupt active work. A phone update does not authorize a computer update. Beta may use real workspaces, but never automatically performs an irreversible migration: a required migration needs a backup, explicit consent and a verified recovery path, or the candidate remains internal.

Failure stops new distribution and prioritizes a corrected release. Already installed binaries are not recalled by withdrawing a candidate. Native mobile packages, computer artifacts and user data have different recovery limits; do not promise universal immediate rollback. Leaving Beta gives truthful stable-install/recovery guidance and preserves data; it does not silently downgrade or claim a compatible stable replacement exists when none does.

## Feedback without a second telemetry system

Reuse the existing Web/PostHog integration and the responsible session's accepted event and consent/opt-out contracts. The release work supplies minimal artifact/version/platform and compatibility-result context, not a new analytics backend or cross-surface person identity. Verify the current integration and owner before extending it; older region/proxy descriptions are not deployment evidence.

Existing product Telemetry and user-submitted diagnostics remain distinct. Diagnostic packages require preview, redaction and explicit submission. Joining Beta does not authorize chat/Memory/workspace content, paths, credentials, default Session Replay or broader automatic capture. Failure to send feedback must not block product use.

## Alternatives and consequences

- **Every green main build reaches users:** rejected; it conflates build success with compatibility, consumes scarce quota and makes normal use feel unstable.
- **Separate Beta mobile identity:** rejected for the chosen beta-to-production path. Same-identity distribution trades away parallel installation and simple downgrade.
- **OTA-first rapid iteration:** deferred because the Human does not need frequent updates; native store builds are sufficient for v1.
- **Forced lockstep upgrades or universal rollback:** rejected; active Host work, independent store processing and data migrations make those promises unsafe.
- **New analytics or desktop distribution stack:** rejected; reuse existing owners and pipelines.

Delivery is three runnable tracers: [first installed pair](https://github.com/BotHarness/DeepSeekBot/issues/1931), [safe upgrade/feedback/exit](https://github.com/BotHarness/DeepSeekBot/issues/1932), then [quota-gated automation with manual approval](https://github.com/BotHarness/DeepSeekBot/issues/1933). The first slice is a manual end-to-end release rehearsal, not just a schema or CI scaffold. No schedule is enabled until separately authorized after qualification.
