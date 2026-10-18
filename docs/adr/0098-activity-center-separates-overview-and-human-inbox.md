---
Status: Accepted
Date: 2026-09-30
---

# Activity Center separates overview from the personal Human Inbox

## Presentation superseded by #2026 (2026-10-17)

The accepted [mobile-aligned Activity Center specification](https://github.com/BotHarness/DeepSeekBot/issues/2026)
supersedes the Overview/Inbox navigation and statistics presentation below. Activity Center
now opens Human Inbox directly in both the page and Dock. Its first slice presents Tool
approvals inline, with expandable context beneath the card, explicit selection mode for
batch work, and a short inert exit transition after the owning request disappears. A failed
submission stays retryable. Only the owning Channel approval command can resolve a request;
previewing a card does not advance read positions. Following Human QA, the page and Dock share independently collapsible Needs you, For you
and Other unread sections. Search and filtering use the existing Host query before
pagination; sorting and history live in the header menu. Section counts describe the loaded
window, with a plus sign when more results remain. The projection, identity, read and decision authority
boundaries described below remain in force; the former Overview presentation is historical.

The Bot mode Activity Center has two views: Overview answers what is happening across PersonaBots and Channels, while Human Inbox answers what the current Human has not read and what requires a decision. This extends ADR-0071's first Human Inbox projection without copying Source Event content, Bot Inbox Admissions, DSH Session logs, or usage facts into a second authority. The first delivery slice is local to the existing Human identity; read positions and projections remain keyed by Human identity so later multi-Human support does not share a person's unread state.

Overview shows the count of unresolved explicit Human actions, each PersonaBot's live state, and currently executing Orchestrator and Assignment Sessions. A Bot opens its DM; a Session opens that exact Session in DSH's original mode. Waiting, blocked, and idle Sessions remain visible through status or action attention but are not called active work. Today's Channel chart counts committed messages once per Channel, splits Human and Bot authors, and offers per-author detail. Token usage is shown globally and per PersonaBot, with a seven-day trend; it is never estimated per Channel. Memory activity shows seven-day committed-change counts and a separate current uncommitted-change indicator. These cards consume the owning activity, Channel, usage, and Memory read models; unavailable data is not presented as zero.

Human Inbox separates explicit actions, mentions and replies, other unread Channel activity, informational updates, and handled history. An action is an unresolved question, approval, join or Grant decision, blocked or waiting Assignment, or another typed request that truly requires the Human; a mention or unread message alone does not increase the action count. Action cards are ordered by longest waiting first; mentions and unread Channels by recent activity. A busy Channel folds into one summary with exact links to mentioned or replied-to messages. Native Channels do not yet have Thread grouping; a later Thread view requires a stable source Thread identity and navigation.

Unread is a Human fact, independent of PersonaBot observation and Wake Policy. The expanded Activity Center entry shows only the count of distinct unread Channel Source Events; the collapsed red dot signals unread messages or pending actions, and the accessible name retains both facts; mentions and reports do not double-count the same event. Expanding a summary does not advance the Human's Channel read position. Viewing concrete message content through its position, or explicitly marking it read, advances that canonical position only as far as the content actually viewed or chosen. A Bot DM report that is also unread appears once with a report label; a report without Channel placement stays an informational update.

An action card shows the exact request, choices or response input, a short expandable source context, and an Open source path. The Human can use the same authorized response and decision operation in the Inbox as at the source; an expired or already resolved request cannot be submitted from stale UI. Resolving a card removes it from active actions but leaves a filterable handled view that links the canonical request and answer. One Channel message involving several Bots appears once in Human Channel attention; genuinely distinct requests from those Bots remain distinct action cards. A Group request is answerable by a named Human, or explicitly by eligible Group Humans; the first valid response resolves one shared request across personal projections. Group-answerable does not imply an all-members mention.

## Why

The earlier first slice and issue #126 treated Human Inbox mainly as an action and informational list and did not compute unread totals. In a Slack-like multi-Bot workload the Human also needs personal unread and mention triage, inline answers to many live questions, and a quick operational overview. Keeping Overview and Inbox as separate views under one entry makes those jobs legible while retaining canonical ownership and restart-safe projections.

## Consequences

- Extend #126 through narrow vertical slices, beginning with local-Human Group unread summary, source navigation, and read-position behavior; then add Human mentions/replies and inline actions.
- Give cross-Bot Overview its own issue (#541). Reuse the PersonaBot usage read model (#34/#39) and Group message-count authority (#424), rather than duplicating either statistic.
- Human mentions require a trusted Human target in Channel message provenance; the current ChannelMention type targets only PersonaBots.
- The original Bot Inbox remains each PersonaBot's event and attention timeline. Human Inbox does not mirror every Bot Inbox event.

## Delivered first Overview tracer (#541)

The existing Human attention projection exposes a complete count using the same action predicates as Inbox paging. The Host query joins PersonaBot registry, root Session ownership and current activity with native live Agent status; pending native question/approval requests and idle Assignment asks override stale execution labels. Only live thinking/working roots appear as executing. Client polling is owned by the mounted Overview and rejects obsolete navigation responses. Bot cards open DM; Session rows explicitly leave Bot mode before native Session navigation. Channel activity charts, token trends and Memory trends remain later tracer expansions.

## Activity Center entry and remembered tab (#679)

One responsive entry belongs to the native sidebar. Expanded, unread attention remains reachable outside Bot mode; collapsed, the entry is hidden while Bot mode is off and is excluded from the tab order and accessibility tree. Expanded, an unread chip sits immediately left of the Bot settings gear; collapsed, a 36px icon sits below the matching Bot mode button with a 4px gap. Following Human QA, expanded shows only the unread badge capped at 99+, without a second dot. The entry stays visible while unread exists; otherwise it is hidden and only reveals on hover or keyboard focus while Bot mode is active, matching the settings gear. Inactive, empty expanded entries remain hidden even on hover and are excluded from the tab order and accessibility tree. Hovering the revealed entry keeps it visible and clickable. While Bot mode is active, collapsed hides the number and shows one small top-right red dot when unread messages or pending actions exist. Its accessible name retains the full canonical unread count and action hint, including with zero unread; Overview and Inbox retain their explicit action counts. The control is a sibling of the native button so opening Activity Center never accidentally toggles mode.

Client preferences remember the last Overview or Inbox tab separately from the last visible conversation. Opening a DM, leaving Bot mode or reloading therefore does not erase this choice; explicit tab clicks still select that tab. First visit uses Overview, and storage refusal falls back to the current Client's choice. This preference owns navigation only, with no additional Host store or changes to Human read positions, identity, attention or Wake Policy.

## Compact Inbox interaction (#687)

Inbox filters compose the pinned DSH native Button and selection Menu; the current baseline exports no standalone Select. Each event has one padded row with a short summary, right-side native primary actions and a compact source avatar with a corner navigation arrow. Clicking the row or activating its keyboard button opens the existing detail pane; direct actions and source navigation are separate sibling controls. Source-only entries without a concrete Channel placement expand their projected summary rather than inventing Channel identifiers. Reading a summary alone does not advance the read position; concrete visible messages and explicit read commands keep their existing semantics. Native request cards retain their owning response commands, while detail utilities use native outlined buttons instead of overriding all nested buttons.

The current Client tab preference initializes from storage once, then remains authoritative for that Client when subsequent writes fail; a new Client still reads the last successfully persisted preference.

Human QA clarified that action buttons do not expand or select an event. Only row activation opens the detail pane. Choose workspace loads canonical request context and opens the existing request card’s picker as a compact list action; other reply, question, approval and Assignment forms use an independent native Modal. Cancellation permits another click, and each later opening rechecks canonical request status so another window’s resolution prevents a stale picker. Both native and browse backends keep the same explicit-choice authorization command.

## Detail context and Inbox-only dismissal (#687 Human QA)

The expanded message window uses equal-width controls flush with its upper and lower edges, following the diff context composition requested in Human QA. The upper arrow incrementally reveals older messages; the lower arrow reveals newer messages and can check for arrivals even after reaching the previous end. Channel context uses canonical timeline cursors, while Assignment reports reuse the owning bounded context query at the current edge. Per-message source icons appear on hover or keyboard focus (always available on touch); they retain exact Channel/message navigation. Assignment report icons open the owning native Session because those reports have no invented Channel placement. Routine context-refresh and footer source buttons are removed. Query failure retains a retry path and the reply draft.

The header Dismiss command persistently suppresses the captured item in this Human's Inbox; it does not answer a question, decide an approval, authorize a Workspace Grant, resume an Assignment, advance the Channel read position or mark the item handled. Human attention owns `human_inbox_dismissals` in the existing operational database. The Host validates the current item and source key before recording the preference; no message content is copied. Stable source-key suppression survives refresh, another window and restart. An unread Channel summary captures a placement revision: dismissing it suppresses that batch and leaves later arrivals eligible, including when viewing the source has already advanced read state. A new Assignment report is a new source key and remains eligible. Source request cards in the Channel remain operable, and a subsequently committed response still uses canonical handled history. Inbox paging and its action count exclude dismissed items; the global unread count retains its canonical read-position definition. Repeating dismissal is idempotent. Row activation toggles the same detail closed without a dismissal; independent response dialogs also retain their native close path.

## Overview action and Session tiles (#698)

Overview defaults to PersonaBots with non-idle state or canonical unresolved Human actions; Show idle Bots reveals the remaining roster. Waiting/blocked work stays visible through status/actions without being counted as executing. Each Bot reuses Human Inbox action views in an independent Bot-filtered Client query cache, oldest first, with bounded refresh and continuation through the same Human Attention Bridge. Native question, approval, Grant, Group and Assignment decisions use the existing commands and refresh both the scoped list and global count. Inbox dismissal exclusions apply equally here. No new durable table or action lifecycle is introduced. Executing root tiles use the subscribed native DSH Session list displayTitle; Overview entry/refresh loads that public list and icons distinguish Orchestrator from Assignment. Purpose/role is only an unavailable-title fallback; clicking still opens the exact original Session outside Bot mode.

## Today Channel activity (#703)

The application-defined `botharness/channelActivityToday` query consumes the Channel owner’s SQLite aggregation over committed placements and Source Events, without materializing message histories or maintaining a second counter. It counts distinct Source Events per visible Channel, excluding generated Bot DM attention notices, deleted Channels, Bot-to-Bot DMs and Group history before the local Human’s visible revision. Human/Bot/other author totals reconcile exactly; canonical bridged actors retain their projected labels. Current Human names resolve in each Channel and Bot names resolve through the registry.

The Host local calendar day defines a half-open interval from midnight to the next calendar midnight, including daylight-saving transitions. The response exposes its day, timezone and UTC boundaries. Overview owns one independent mounted query refreshed every 30 seconds, on explicit refresh and at the Host day boundary; it discards results after unmount. Empty visible Channels report zero; unavailable aggregation fails explicitly. Compact shared-scale stacked bars borrow Profile chart hierarchy and token colors, with native expansion and Channel navigation. CSS segments replace chart axes/tooltips for this small comparison: exact numeric totals and sender counts remain visible without hover. Initial rendering is 20 Channels, with continuation of the complete totals. No read, Admission, wake, message or usage command runs while viewing or expanding these statistics.
