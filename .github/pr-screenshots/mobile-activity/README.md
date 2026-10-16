# Native activity evidence — #1919 / #1928

## Latest: 12pt boundary gap

`gap12-{dm,group}-{light,dark}.png` are the latest captures, taken on the same
single iOS 26.0 Simulator/dev client, English, 1206 × 2622, default text size.
Source: `94a4bc24cfe33b3878354f917f3842b1dcd13003`; integrated batch:
`aa8d57b5cd0dc9446d43624fce8a60fcc362e8f6`.
Before: `aligned-{dm,group}-after-{light,dark}.png` at the 8pt revision below.
Same QA records and latest-message anchor; increasing the gap shifts earlier
content upward. All four new captures were inspected. The shared top gap is now
`space.x4` (12pt), including ordinary new message groups; joined bubbles remain
2pt and bubble internal vertical padding remains 8pt. No interaction changes.

Source mobile tests: 421 passed / 8 skipped; typecheck, changed-file format and
changelog checks passed. Integrated batch: 10 focused tests passed. No native
rebuild, new Simulator, Host restart or phone use. These captures verify layout,
not native touch timing, Android, large text or Human QA. Earlier menu captures
below remain historical interaction evidence, not screenshots of this spacing.

## Earlier interaction and alignment follow-up (8pt)

The earlier images are `aligned-dm-after-{light,dark}.png`,
`aligned-group-{before,after}-{light,dark}.png` and `activity-menu-{light,dark}.png`.
DM before images are the earlier `spacing-after-{light,dark}.png`: same
conversation, records, latest-message anchor and dimensions, before this change.

- Source: `ddab3cfe2f098fef61470bdb160e3028341f21d1`. Integrated native batch:
  `479baef203f10c4e2a7e3892b942051d51edd905`.
- Baseline group: `560205fc2fb00dc1e38a4bfa71c245ac992bbbb3`.
- The collapsed rows are now left-aligned, single-line and ellipsized. Activity
  rows use the same one-sided 8pt boundary gap as new bubble groups, not vertical
  padding inside a centred minimum-height box. Group avatars use the speaker
  gutter; DM recipient avatars appear after the icon, without the current Bot's
  avatar. Reduced content height changes which earlier messages are visible.
- Native accessibility details actions opened the full menu; explicit Open
  memory reached the memory files, Open new Bot reached Cora QA, Open conversation
  reached the read-only Ada/Bob DM, and Copy matched the complete formatted text.
  Native accessibility activation does not navigate directly: it opens details.
- Ordinary touch tap/no-op and long-press handlers are component-tested; a
  coordinate-drive attempt failed with `noWindowsAvailable`, so actual touch
  gesture timing is not claimed as native-verified. Long overflow scroll,
  Android, physical phone and Human QA still need verification.
- One existing Simulator/dev client, no native build or shared Host restart.
  Same dedicated QA records, English locale, 1206 × 2622. Every new image was
  visually inspected. Earlier images below retain their historical provenance.

## Spacing follow-up

`spacing-{before,after}-{light,dark}.png` compares the Human-requested spacing
change: vertical padding `space.x2` (4pt) to `space.x3` (8pt), leaving the
label/detail gap at `space.x1` (2pt). Same Ada QA conversation, latest-message
position, device, dimensions and data; increased content height moves earlier
rows upward. All four raw images were inspected.

- Source fix: `6437df6e820ad0ad50b37c45bd89512d3f69e46f`.
- After integration: `560205fc2fb00dc1e38a4bfa71c245ac992bbbb3`, the frozen
  batch plus only the spacing fix, documentation and regression test.
- Before light: frozen batch `a42bc7ce27d0fd798c680f966a01b85b887fef0f`.
  Before dark: after integration with only ActivityRow's padding temporarily
  restored to `space.x2`; runtime source matches the frozen batch. The fix
  was restored afterward and tracked batch files were clean.
- No native rebuild or Host restart. Metro stopped and queue released afterward.
- Source mobile suite: 415 passed / 8 skipped; mobile typecheck and changed-file
  format passed. Focused integration spacing/style tests: 5 passed.

The older feature captures below retain their original provenance and old
spacing; they are not recaptured evidence for this follow-up.

## Original feature comparison

Captured on one shared iOS 26.0 Simulator, English locale, 1206 × 2622 pixels,
using the existing development client. No native rebuild, second Simulator or
shared Host restart was used for the comparison.

- After: local integration `a42bc7ce27d0fd798c680f966a01b85b887fef0f`, containing
  PR #1928 code `04939de68a954c8c1de5fd80925d3f1be681555f`.
- Before: `6258e7d0943c0693104304c2f561ee8f0e46524f`, the same integration before
  #1928. Other batch inputs are unchanged.
- The same dedicated QA Host and test conversations were used for both versions.
  The Host remained on its prior batch-4 runtime; activity/pairing code matches
  the tested batch. This does not qualify unrelated Computer viewer Host changes.
- DM/group captures are at the latest messages; profile captures start at the
  top of the same sheet. The added rows change content height and background
  scroll position. Light/dark pairs use identical data. Raw captures are uncropped.
- The group posts, Bot DM and memory commits came from real model turns and were
  read through the authenticated Host journal transport. New-Bot activity came
  from the public direct Bot tool, not a model approval flow. Only local QA data
  is shown; no personal conversation, token or machine path is published.

The baseline already filters empty notices (#1920), so these records are absent,
not blank bubbles. Afterward, the DM shows folded posts, DM action, memory and
new-Bot activity; the group shows memory rows; the profile has two local switches.
`bot-dm-readonly-menu.png` shows Copy/Share without reactions or a composer.

The Simulator's old return-to-Settings status-bar text has missing Chinese glyphs.
This also occurs in iOS Settings; English app content is readable. Native Chinese
rendering and live Web/native visual parity remain unverified.

Targeted native checks passed for links, read-only Copy, switch filtering,
restart persistence, group independence and ordinary group reaction add/remove.
The unified e2e launcher separately failed its first pair-screen assertion behind
the Expo development menu. These screenshots do not turn that run green.
Android, second-Host isolation, physical APNs, ProMotion and Human QA are not passed.
