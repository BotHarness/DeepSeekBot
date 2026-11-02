# Mobile press feedback and semantic haptics

## Sub-features

Navigation/custom selection acknowledgment, toolbar and floating-action pressed feedback, attachment removal, accepted tool approvals and choice submissions, and the device-local Haptic feedback setting. These checks distinguish visible feedback, native interaction, and actual felt vibration.

## How to get to it (user POV)

Open Chats and switch to Activity. Open Settings → Interface → Haptic feedback. In a paired conversation, open a pending tool approval or choice card and its full request view; attach an owned fixture to reach its Remove attachment action. Activity also exposes pending decisions.

## Driving it with verify-app

Use the shared-device queue and its designated runner, qualified native client and QA Host. Do not start a separate Simulator, Metro, native build or Host outside that lease. Run iOS and Android separately; a web preview or provider mock cannot qualify either native platform.

1. Freeze exact base/candidate sources, native-binary compatibility, device, locale, theme and OS text size. Capture matching before/after Settings and affected controls. Check both themes and default/intermediate/maximum system text for reachable switches and action labels; keep pairing, drafts and original settings intact.
2. Open the composer attachment menu and Chats native creation menu: each opening acknowledges once (iOS uses the native menu-opening event); closing and choosing a picker source do not add another application haptic. Repeated activation of the already-open creation panel stays silent. Send from compact and expanded composers: exactly one acknowledgment per enabled send; disconnected/disabled send stays silent. Submit a typed custom answer as well as an option choice.
3. Press a toolbar button, the Android floating creation action, and Remove attachment. Confirm immediate pressed/ripple/native response before release and correct action after activation. Slide outside to cancel; no action commits. Back/close do not gain unconditional extra application vibration.
4. Switch Chats ↔ Activity and relevant custom options. Selection responds without waiting for destination data. Actual changes acknowledge once; tapping the current selection or preventing navigation does not. Check native Picker/segmented controls for existing system feedback before adding or accepting any application feedback. Rapid repeated taps must not produce duplicate acknowledgments for one selection change.
5. Exercise Allow, Deny and choice submission from cards, full request views and Activity. With a slow submission, observe immediate busy feedback and no accepted-decision acknowledgment yet. Repeated activation while pending submits once. Once accepted, allow/submit acknowledge once and deny gives distinct warning/rejection feedback. Read the canonical request decision from the QA Host; this proves decision submission, not successful tool execution. Do not call a completed tool a prerequisite for this check.
6. Exercise failed, expired, already-resolved and stale submissions. No accepted-decision acknowledgment fires. Preserve the appropriate visible error/reload/retry path. Navigate away or change the request while a response is pending: a late result must not update or acknowledge a different request.
7. Turn Haptic feedback off. Visual/functional feedback remains complete and all application-added moments are silent: selection, send, allow/deny, choice submit, menu, reaction, pull-to-compose and swipe. Reopen/cold-start and confirm off persists. Re-enable and confirm the agreed moments return. Do not claim the app setting suppresses OS-owned native feedback.
8. A Human checks comfort, timing and duplication on haptics-capable physical iOS and Android devices with system haptics enabled. Record system suppression/unsupported hardware separately. Screenshots, recordings, Simulator/emulator output, successful provider promises and call counts cannot prove tactile acceptance.

## Gotchas

- Settings is device-local and does not require a connected Host. Pending approval/choice scenarios do require a real request under the normal Host authority; no permission or policy bypass is authorized.
- If the queue, compatible binary, physical device or Human is unavailable, record that exact lane as untested. Preserve source-test results separately and leave the PR awaiting native/Human QA.
- Android intentionally uses its system haptic-feedback API; physical strength need not match iOS. Native control feedback is not controlled by the application toggle.
- Save reviewed evidence and source/build metadata in the main checkout's task index before releasing owned resources. Restore the original preference and retain other tasks' QA Hosts, devices and leases.
