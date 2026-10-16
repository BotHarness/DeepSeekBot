# Explicit Beta choice for one computer

Refs #1932. This bounded slice stacks on the busy-release guard. It does not complete #1932,
qualify #1931 artifacts, or activate #1933 automation. No automatic prompt policy ships here.

## Contract

- The existing application-defined Release Service owns `stable | beta` for the active DSH Profile.
  Persistence uses atomic replacement of `botharness/release-channel.json` under the native
  `profileContext.dir` (verified against pinned DSH `0.2.0-rc.2` ProfileContext). Different Profiles
  remain independent even under one DSH home. One running Host owns a Profile; concurrent processes
  mutating the same Profile are not a supported coordination mechanism.
- The authenticated bridge exposes `releaseChannel()` and `releaseChannelSet({ channel })`.
  The Typert method takes a named `channel` argument. CLI parity is `release-channel` and
  `release-channel-set beta|stable --confirm`. Missing Profile context cannot save enrollment.
- Default and malformed/unreadable state select stable, never inferred from package version.
  Failed persistence does not change process-local choice or report success. The file contains
  only the channel; it does not share consent with telemetry or store enrollment.
- Stable discovers non-prerelease `latest`; Beta also discovers `beta`, selecting the newest.
  `next` is ignored. Registry tags are candidates, not artifact qualification or promotion approval.
  Existing exact-version explicit installs remain the install path; prereleases additionally need
  Beta opt-in. Compatibility preflight and activity refusals remain in force.
- Saving invalidates cached/in-flight checks, preserves staged updates, and refuses during an
  install/restart. Leaving changes future selection only. It never downgrades, deletes data,
  cancels a staged update or promises an immediately compatible stable replacement.
- Web prerelease installation also requires confirmed Beta enrollment, including against an older
  Host without the new RPC. Prerelease failures never suggest the legacy hardcoded `web` Profile
  command. Reads started during a save cannot overwrite its confirmed result; a changed choice
  read from another client invalidates the displayed candidate. Stable manual fallback is unchanged.

## Assigned-batch verification

Follow [shared device QA](device-qa.md). Do not restart the shared Host with pending approvals.
This slice has no native changes; #1931 still needs a separately authorized rebuilt native app.

1. On an assigned disposable Profile, run `release-channel` through the authenticated CLI.
   A fresh choice is stable, including when the running package is Beta. In Web Settings, confirm
   the same choice. Capture matched before/after at the base and exact head, English/Chinese and
   light/dark. The existing SettingsRow and outline Button patterns own appearance.
2. Join Beta in the Web page, read it through CLI, then restart only the disposable Host in its
   assigned window. Confirm persistence. Check a second Profile under the same home and a second
   saved Host: neither may change. No phone enrollment or statistics setting should change.
3. With controlled registry fixtures, compare stable/latest, beta, and a newer next candidate.
   Beta may offer beta, never next. A prerelease latest is not offered as stable. A blocked notes
   request completed after leaving must not resurrect the Beta offer, including concurrent checks.
4. Leave Beta through CLI and refresh Web Settings. If installed Beta is newer than stable, no
   downgrade is offered; recovery text must remain visible. A staged Beta stays staged. Selecting
   a channel must cause no install/restart calls. No actual package mutation is authorized here.
5. Exercise storage failure and missing Profile context, old/unsupported Host RPC, invalid channel,
   and concurrent install/restart. Expect a coded refusal or disabled control, no false success.
   Restore access and retry explicitly. The save-failure alert must remain visible.
6. Report exact source and integrated batch SHAs, pass/fail/untested, sanitized screenshots and
   CLI results on the PR. Focused tests are not local DSH E2E, packaged upgrade proof or Human QA.

At this source slice, live CLI, real UI captures, installed phone/computer combinations and Human
QA remain queued. Do not move registry tags, install a production package, enable automation,
publish, merge, spend or take over another task's telemetry work.
