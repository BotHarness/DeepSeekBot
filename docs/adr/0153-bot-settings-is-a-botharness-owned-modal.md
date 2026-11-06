---
Status: Accepted
Date: 2026-10-09
---

# Bot Settings is a BotHarness-owned modal; DSH settings only points into it

Every profile-wide BotHarness setting lived on one long page behind a single `settings.section` in DSH's settings modal: six rows rendered by the section itself and eight `botharness.settings.item` entries stacked below, from release notes to profile backup. DSH would let us register more sections, but its nav is flat, ordered across every plugin, offers no grouping, and gives ordinary sections no way to open a specific section, so our entry points clicked DOM buttons by their label text. We decided that **Bot Settings is a modal BotHarness owns, with its own sidebar of Bot Settings sections; DSH settings keeps one "Bot 设置" item that only redirects into it.**

## Decision

- **One owned modal.** Bot Settings is the headless DSH `Modal` primitive widened by a class (about 880 × 640, clamped to the frame), mounted on `shell.overlay` with its own client store, so it outlives whatever opened it. Its left sidebar collapses into a section dropdown in narrow frames.
- **Sections are registered.** `botharness.settings.item` becomes a section slot: each registration is one Bot Settings section with a stable id, label, order and renderer, so platform modules can add their own later. The initial sections are General, Models & execution, Messaging, IM apps, Window companions, Data & privacy, Advanced and About.
- **Scope is profile-wide only.** Configuration of one PersonaBot or one Channel stays a Channel sidebar entry ([ADR-0138](0138-profiles-hold-shareable-identity-and-configuration-lives-in-the-channel-sidebar.md)).
- **Opening is an API, not DOM scraping.** `openBotSettings(sectionId?)` opens the named section, or the last one viewed in this page load, or General. Section ids are the deep-link contract; there are no anchors inside a section. The Bot panel gear, the Window Companion menu and the telemetry notice call it with their section.
- **DSH settings redirects.** The native "Bot 设置" section closes DSH settings on mount and opens Bot Settings, rendering a fallback "Open Bot Settings" button in case the redirect does not happen.
- **IM apps lists what BotHarness can see.** The IM apps section lists every App across platforms with the PersonaBot it is bound to, creates Lark and WeChat Apps, and binds or unbinds them. Credentials for other platforms, credential edits and App removal remain in DSH's native IM Bots section, reached by a "Manage in DSH settings" link that returns to Bot Settings → IM apps.

## Considered Options

- **Several native `settings.section` entries with adjacent orders:** rejected. They are not grouped, any plugin can sort between them, labels and icons must be matched in the DOM, and opening one still needs scraping.
- **Keep one native section and add in-page tabs:** rejected. It keeps the cramped settings shell and still cannot be opened at a tab.
- **Wait for full App CRUD before moving IM apps:** rejected. Listing and binding are available now, and DSH's native form remains the source of App credentials.

## Consequences

- Opening the native Models and IM Bots sections still scrapes the DOM until DSH exposes `openSection` beyond onboarding.
- Our `modal.ts` wrapper exposes `headless`.
- `GLOSSARY.md` replaces **Settings UI** with **Bot Settings** and **Bot Settings section**.
