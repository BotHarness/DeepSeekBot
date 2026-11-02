# Tob Channel management evidence

These are real DSH 0.2.0-rc.2 captures from isolated synthetic Web and macOS Desktop profiles. No private conversations or authentication URLs are included.

Product source: `edaf1b9d747db7f97a4be3861d81360abcc6a8f1`. Later commits change verification/evidence only. Web viewport: 1440 × 900; macOS renderer capture: 2522 × 1640; dark theme, Chinese locale.

The PR's Before images are the archived Bot-management entry point already delivered by #2113 at base `47a2fbf4553e7760480fe10f3c47c1bd5cb3ef19`. They are context for the previous supported workflow, not a same-data Group screenshot or a layout comparison. This PR adds scoped Group operations without replacing the existing UI.

The After images show groups created through a real Tob native Shell CLI operation, followed by a reviewed invitation and canonical accepted membership under the existing default-on automatic acceptance policy. The members panel shows the same two Bot identities as the CLI readback. A third invitation is denied through the visible approval control and leaves membership and invitations unchanged.

The independent Human CLI checks replay the same operation key/payload, reject conflicting reuse and protected Tob invitations, and read the same group/invitation after restart. Earlier explicit opt-out runs also exercised actual invitee decisions; that compatibility branch is not the default user flow.

First failures were retained locally: a late onboarding dialog, an outdated Human CLI build, a previous-launch native token, parked hidden panel selectors, and an overly strict turn-start timestamp check. None count as passing runs. The timestamp fix still requires a new CLI call, completed turn, handled Human message and actual reply. Full local testing also exposed two outdated contract assertions (new bridge method and empty-group support), both fixed and rechecked.

The existing main Desktop is restored after native checks. Human QA and merge remain pending. CI status is recorded on the PR, separately from these runtime captures.
