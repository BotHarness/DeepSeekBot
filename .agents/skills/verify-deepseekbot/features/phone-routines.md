# Routines on the phone

A paired phone runs, pauses, resumes, deletes, creates and edits a PersonaBot's routines (Bot Schedules) from the Bot profile. Every change is a Host bridge call as the Human, so the desktop Schedules entry shows the same state.

## Sub-features

- `detail` pushes a page inside the profile drawer from its Routines section: its trigger in plain words, the next run (or Off) and the last five firings from `scheduleHistory`.
- `run-now` calls `scheduleRunNow`; the manual firing shows under Recent runs.
- `pause` calls `scheduleUpdate` with `enabled`; the button flips between Pause and Resume.
- `delete` asks in place, then calls `scheduleDelete`.
- `author` uses a nested Edit or New routine page inside that same drawer, and creates (`scheduleCreate`) or edits (`scheduleUpdate`) a daily, weekly or every-N-hours routine, previewing the next runs with `schedulePreview`. Minute, once and cron triggers say the phone cannot edit them and open the full client.

## How to get to it (user POV)

- In the app, open a Bot's DM, tap its name to open the profile, then tap a routine under Routines, or **New routine** at the end of the section.

## Driving it with verify-app

Preconditions: no model credential is needed.

- **Scripted journey.** `node scripts/e2e-mobile-routines-web.mjs [--skip-export]` exports the app for web, pairs it through a phone-origin proxy, creates a daily and a cron routine through the API, then checks Pause and Resume on the Host, Run now in the Host history, Delete after confirming, the cron routine's full-client note, and a new weekly routine whose preview matches the Host's `schedulePreview`, in light and dark. Evidence lands in `.humanlayer/verify/mobile-routines-web/evidence/`.

## Gotchas

- Native acceptance: open a routine, pause it, push Edit, save a renamed title, return to refreshed detail, then return to the profile list. New routine must open immediately with the same handle/back header. A failed save retains the draft; Delete asks in place and returns to the refreshed list only after success. Use only task-owned routines, schedule them safely in the future, and remove them after the journey.
- The web export is layout evidence. The native keyboard over the form and the sheet's safe areas need a development build on a phone.
- Weekdays are ISO, Monday 1 through Sunday 7, as the Host's Schedule rules take them.
