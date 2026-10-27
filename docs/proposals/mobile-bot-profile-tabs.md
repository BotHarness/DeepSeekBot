# Mobile Bot profile tabs

Status: agreed design (grilled 2026-10-26), not yet built. Tracked in #2904. Reference: Meta Muse's agent profile.

Every rule in `apps/mobile/DESIGN.md` and `apps/mobile/OVERLAYS.md` still applies. Use native controls wherever they exist: SwiftUI controls with Liquid Glass on iOS 26 (opaque fallback on earlier iOS and with Reduce Transparency), and Material 3 Expressive Compose controls on Android.

## Presentation

- Tapping the title chip in a Bot DM or Group opens the profile as a **full-screen page**, replacing today's form sheet. The avatar and name are a shared element: on iOS 18+ the chip zooms into the header (native zoom transition); Android and older iOS use a scale-and-fade fallback.
- Leading ✕ closes. No trailing action: Share is hidden for now.
- Header: Profile Banner behind the avatar (fades in during the transition), avatar, name, status, then a row of small round buttons for **Browser** and **Computer**, each shown only when the Bot has that access. The old Message button is removed.
- One navigation stack inside the page, as OVERLAYS.md requires.

## Tabs

- Bot profile: **Work / Memory / Files / Routines / Settings**.
- Group profile: **Members / Files / Work / Settings**. Join requests sit in Members.
- Bot-to-Bot DM: Files only, so no tab bar.
- Icon-only tabs (SF Symbols / Material Symbols) with accessibility labels. The icon tab names the content, so a tab does not repeat its name as a heading unless it has a header action (Routines shows its name beside **+**); sections inside a tab keep their own headings ("Daily").
- iOS: native segmented `Picker`, using system springs. Android: M3 Expressive connected button group (`ButtonGroup` + `ToggleButton`) using the connected leading, middle and trailing shapes, with the selected button morphing to a fully round shape on the Expressive spatial spring; see [Button groups guidelines](https://m3.material.io/components/button-groups/guidelines) and [specs](https://m3.material.io/components/button-groups/specs). Reduce Motion and animator scale 0 use fades.
- Scrolling collapses the avatar and name; the tab bar sticks to the top and floats over the content (glass on iOS 26, opaque `raised` elsewhere). Horizontal swipe switches tabs.
- The last tab is remembered globally, once for Bot profiles and once for Group profiles, not per Bot. A remembered tab that the page lacks falls back to the first tab. A Live Activity deep link opens that Assignment's detail instead.

## Work

- One row per **Assignment** (see CONTEXT.md): Assignment Title, Assignment Description and the time, grouped by the day of last activity. Orchestrator turns are not listed; they are already in the chat. Group Work lists the Group's Assignments with the same row.
- The detail page is read-only: status, Title, Description, latest Assignment Report, and a timeline of MAIN (the Assignment Agent) and SUBAGENT 01, 02… showing public summaries only, never raw tool input. Stop and archive stay with the Orchestrator; the Human asks the Bot in chat.
- Depends on ADR-0262 (Assignment Title and Description).

## Memory

- Two pinned cards: `SOUL.md` and `MEMORY.md`, each with a short "About this file" note.
- Everything else is a folder-style grid: each folder and file is an icon with a title. Tapping a folder opens its grid.
- A file opens in Markdown read mode. ✏️ switches to editing the Markdown source; Save uses `memorySave` with `expectedHead`, and a concurrent Bot edit shows a conflict and reloads.
- The phone edits only the latest version. The Memory tab's **Changes** view lists the repository's commits by day and opens each one's per-file diff, read only; restore stays on the computer.
- v1 edits existing files only: no create, delete or rename.
- A Bot without the Memory service shows an empty state that explains why.
- This replaces "Identity and Memory stay read-only for now" in DESIGN.md.

## Files

The Bot's DM channel. A native segmented control switches **Media / Files**: media is a three-column image grid, files a list with type icons. Reuses the channel-files data and image viewer.

## Routines

Grouped by frequency (Daily, Weekly, One-off), with + to create. Each row shows the title and next run. Swipe offers Run now, Pause and Delete; tapping opens the existing routine detail.

## Settings

A native grouped list (iOS inset grouped, Android Expressive grouped surfaces), in this order:

1. **Overview**: runs this week, tokens and memory commits; opens the existing activity statistics.
2. **Permissions**, each a child page:
   - **Approval history**: the Human's own approve and deny decisions, newest first.
   - **Always-allow rules**: revocable. Each rule shows "auto-approved N times", which needs a new Host counter.
   - **Workspace grants**.
   - **Computer and browser access** switches.
3. **Bot**: model, chat background, notifications and channels.

## Out of scope

- A log of what apps and sites the Bot visited while using a computer. There is no data source yet, so it needs Host capture first.
- Share Bot.

## Delivery

Three PRs, each with light and dark screenshots on iOS and Android:

1. The new shell (full screen, zoom transition, tab framework), with today's content moved in, including the Group profile.
2. Assignment Title and Description end to end: database, tools, CLI, then the Work tab and its detail page.
3. The Memory grid with editing, and the Permissions pages in Settings.

Every new Host method ships its `deepseekbot` CLI command in the same change (CLI parity).
