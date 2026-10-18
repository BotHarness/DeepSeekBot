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
