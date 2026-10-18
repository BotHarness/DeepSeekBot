# Compact workspace drawer — native evidence

Final drawer source `dc15ffd3a7003ef0c0f4110f834f02f15a990e6c`, integrated `1376b50b1f8358d9d9b22c89e55901fb5a141d24`; retained native `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`. No native dependency/config changes. Real shared iOS Simulator screenshots, 402 × 874, English.

`before-*` is the prior title/X + mixed Add iteration at source `59fc97fd7bada6d54cbae1feacc4d93d032e4c82`. The same empty-computer/signed-out-UAT fixture, viewport and themes are used. The exposed screen behind the drawer differs; compare the drawer only. These are not screenshots of the PR base branch. Earlier base evidence remains in `../2174-drawer-tabs/` and is superseded for final appearance.

`*-default-*`, `*-intermediate-*`, `*-max-*`, `join-direct` and `pair-direct` use the final source. `cloud-max-scrolled-dark` shows the address after a swipe in the constrained middle list; the footer stayed at x0/y757.6667/w342/h78.3333. A duplicate footer under the backdrop was found during review, removed, and these final screenshots recaptured.

Naming screenshots use source `f2d0f4af3ebeecfe5df9f25d2bc1a3636340531d`, integrated `9e77d9810ad642388ed8ac8bcd9a4b9725f181c0`; naming code is identical in the final source. Native edit changed the display name to `TOB UAT`, saved, survived cold restart, then restored `tob-instance-uat` and cold-read it back. No login, credentials, Host identity or organization name changed. `pair-name*` only verifies the optional input; no pairing was redeemed. Driver keystroke injection opened Expo's development menu, so native clipboard Paste was used for this nonsecret test name.

Local checks: typecheck, focused lint/format/source-policy/release-ledger checks; 74 affected focused tests plus 14 host-look/pairing-telemetry tests at f2d0 (counts overlap). After the backdrop-only fix: typecheck and 19 drawer/style tests passed. CI status is recorded in the PR, separately from these runtime checks.

Limits: no Android/physical/VoiceOver/Human acceptance; no signed-in org/guest fixture or actual named-computer pairing in this run. The previously observed Pair-modal → cloud-services root-drawer overlay issue remains unqualified; the normal cold-open path works. This is not a full navigation or authentication pass. No production change or merge.
