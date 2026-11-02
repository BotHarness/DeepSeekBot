# Pair modal → Cloud services → Workspaces

Batch 27, iOS Simulator, English, 402 × 874, default large text, signed out.
Before: main `9e73993308cf01e5d89f1be9a504ca657166aefa`.
After source/integrated: `127ccaa4c66fa08aadbd7125092c9cb84f08efa9`.
Retained native binary: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`.
Later evidence/docs commits do not change the tested runtime.

Both sides show the same action: enter Pair from the workspace drawer, select Cloud services,
then tap Workspaces. Before, the native modal covers the opened drawer. After, the modal is
removed and the drawer is visible and operable. The service URL shown is the public UAT test
endpoint; no credentials or signed-in user data appear.

The same native AX assertion (both Computers and Cloud buttons visible) failed on baseline
and passed after the fix. Actual tab selection, Manage cloud services, left-swipe dismissal
and Back were also exercised. Normal cold entry and first-entry replacement (no prior Cloud
services target) passed. Developer-menu overlay interference and stale AX references were
driver failures, resolved before the product assertions; they are not feature passes.

690 mobile tests passed / 8 skipped; mobile typecheck and focused format passed.
No login, pairing redemption, Host writes, deployments or production changes occurred.
Only empty pairing forms were tested. In-progress pairing/input preservation, existing paired
Computer return, Android, physical iOS and VoiceOver remain unverified. Human QA is pending.
Intermediate (`accessibility-large`) and maximum (`accessibility-extra-extra-extra-large`) iOS
text sizes in both themes, plus live default → maximum → default resizing, were not run in
Batch 27. These remain explicit follow-up cases in #2186; default `large` screenshots do not
qualify them.
The shared checkout, original Documents/preferences, appearance, text size and locale were
restored; the runner driver and Metro were stopped.

Reproduce using the native steps in
[phone-pairing.md](../../../.agents/skills/verify-deepseekbot/features/phone-pairing.md#pair-modal-to-cloud-services-regression).
