# Once-per-version Beta update cards

Refs #1932; stacks on the explicit Profile choice and busy-release guard. This slice changes
the existing Settings card, not a global notification, mobile store enrollment or telemetry.
See [ADR-0215](../adr/0215-beta-reminders-are-claimed-once-per-profile-before-display.md).

## Contract

Automatic checks on opening Settings request `releasePrompt({ version })` instead of trusting
the browser's cached choice. A current stable Host returns `not-beta`, permitting only a stable
candidate card without consuming history. For Beta, the Host rechecks the selected candidate and channel revision, pending release
mutation and activity, then saves the version before returning `claimed`. A second request for
that version or an older one returns `suppressed: already-prompted`, including after restart,
rejoining Beta or registry tag rollback. Profile-local storage is the sole reminder authority.

An unknown activity probe or damaged/unwritable record returns `failed` with a coded reason.
The Web stays quiet and leaves manual checks usable; it never reports a reminder as displayed
or qualified merely because the record exists. There is no display acknowledgement or automatic
retry. Lost responses after commit can lose a card. One live Host per Profile is required.

Later and leaving Settings hide the card without install/restart. Explicit Check for updates
can show it again without claiming another automatic reminder. Joining/leaving Beta still
refreshes candidates as an explicit user action. Stable cards on current Hosts and installed
release notes retain their existing behavior. Older Hosts without the claim API suppress automatic
cards, but manual checks remain available. Registry discovery is not proof of a tested phone/computer combination.

## Assigned-window verification

Follow [shared device QA](device-qa.md); do not restart the retained Host with pending approvals.
This slice has no mobile/native changes. The combined #1931 candidate still needs its native build.

1. Use an assigned disposable installed Profile with a newer controlled registry candidate;
   never move public tags or install packages to manufacture evidence. Capture the base and
   candidate Settings in English/Chinese, light/dark. The existing card and outline Button
   composition own appearance; no new styles or dependencies are added.
2. Opt into Beta. Open Settings from two independent browsers/controllers. Exactly one automatic
   claim may show the card; the other retains compact status and manual checks. Click Later.
   Reopen Settings, reload the page and restart only the disposable Host: do not repeat that card.
3. Run `deepseekbot release-check` repeatedly: no reminder is consumed. On a fresh candidate run
   `deepseekbot release-prompt <version> --confirm`: `claimed` consumes its automatic reminder.
   Repeat: `suppressed` / `already-prompted`. Missing confirmation fails before reaching the Host.
4. Verify independent Profiles; leave/rejoin, newer version and tag rollback; damaged history,
   unwritable storage, missing activity services, stale candidate and old Host RPC. Manual checks
   stay available. CLI failures exit nonzero with `release-<reason>`; suppressed outcomes exit zero.
5. While a real Agent/Job is active, the automatic claim must not consume history. After idle,
   reload Settings for a new check. Verify closing Settings or changing channel during a delayed
   response cannot resurrect the card. Pending installed updates still show restart guidance.
6. Confirm all checks/Later/claims cause no install, restart or telemetry action. Capture results
   with source and integrated batch SHAs. Source/HTTP fixtures are not live DSH, native or Human QA.

No full #1932 acceptance, installed upgrade/data-preservation proof, physical/Android coverage,
store upload, release automation, package promotion or spend is established by this slice.
