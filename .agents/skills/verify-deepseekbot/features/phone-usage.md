# Token usage on the phone

A paired phone shows the current Host's token usage for the last 7 days at the top of Settings, and a Usage screen with the detail. Both read the same `overviewUsage` and `overviewMemory` bridge methods as the Web Client's activity view.

## Sub-features

- `card`: Settings opens with a Usage card: the 7-day total and a bar per day. An idle Host shows an empty week; a failed read shows Try again.
- `detail`: tapping the card pushes Usage inside the same Settings drawer: a Today / Last 7 days switch, the split by kind, the split by PersonaBot (tapping one opens its profile) and each Bot's Memory changes, with Show more on both lists. Tapping a day's bar shows that day's date and tokens in place of the week total; tapping it again shows the week.
- `cli`: `deepseekbot overview-usage --period week` and `deepseekbot overview-memory` read the same Host values without the app.

## How to get to it (user POV)

- In the app, tap the Settings gear at the top right of Chats; the Usage card is first. Tap it for the detail.

## Driving it with verify-app

Preconditions: a model credential, so two Bots can answer a DM and spend tokens.

- **Scripted journey.** `node scripts/e2e-mobile-usage-web.mjs [--skip-export]` exports the app for web, launches an isolated Host, checks the idle week is zero, has two PersonaBots answer a DM, pairs the app through a phone-origin proxy, then checks that the card's total equals the Host's `overviewUsage` week total, that it has a bar for each of the 7 days, that the card opens Usage, that tapping a day's bar shows that day and tapping it again shows the week, and that Today reads the Host again, in light and dark. Evidence lands in `.humanlayer/verify/mobile-usage-web/evidence/`.

## Gotchas

- The Host counts days in its own time zone, so the weekday labels follow the computer, not the phone.
- The web export is layout evidence. Native acceptance: Settings → Usage → back → App icon → back keeps one handle and the same drawer surface. Expand it, scroll content first, then drag the handle to dismiss. Alternate-icon mutation is a separate platform capability.
- Profile usage must agree with `bot-activity-history` reported totals: a model with known and unknown calls retains its reported lower bound and uses the same compact count/`+` format as Settings, without a “partially known” prefix. All-unknown usage is not zero.

## Profile Message and scoped Channel entry (#2799)

Use the shared device queue and record Android and iOS separately. From Usage, open a Bot Profile and tap Message: the Bot DM replaces the Profile presentation, and Back returns to Usage. Repeat from Group Profile. From the Bot's existing DM, open its Profile and tap Message: return to that same DM without a duplicate; Close remains presentation dismissal. Use a nested Profile settings page before returning to Profile to exercise the root navigator boundary.

From Chats and Activity, open a DM/group, move to another Channel, then reopen the original. Verify the original route and Back history are retained. On iOS verify both ordinary row tap and native preview commit; long-press menus remain available. Use two Hosts with the same Bot slug, switch source while a Profile is open and verify stale source refuses rather than opening the new Host's Bot. Preserve drafts and list state. Capture default/intermediate/maximum text in light/dark, TalkBack/VoiceOver and native header/system/gesture Back. Source tests do not replace native qualification.
