# ADR-0220: One Sessions panel with explicit Bot or Channel scope

- Status: Accepted
- Date: 2026-10-17
- Issue: [#2034](https://github.com/BotHarness/DeepSeekBot/issues/2034)
- Partially supersedes: ADR-0183's separate Work tab presentation; retains its Assignment authority and routing.

## Context

The Work and Sessions panels can open the same Assignment Session. Their separate entry points imply two task systems after ADR-0203 replaced the old sidebar layout with Dock panels.

## Decision

Keep one `sessions` Dock panel. A PersonaBot DM fixes the scope to its Bot. A Group defaults to Current channel and allows explicit selection of an accessible member Bot. Scope is a browser-local preference per Channel, independent of history filters and workspace grouping. An invalid member choice is cleared, with a fallback to Current channel.

Default-following Sessions headers omit a redundant scope label. Group scope choices live in the existing view-options menu; only an explicit member-Bot override shows `Bot · name` in the header.

Reuse the application-defined Host `sessions(slug)` and `channelAssignments(channelId)` queries, existing authorization, original Source Event ownership, native Session catalog and Session navigation. No Host contract, Bot tool, CLI command, durable task entity or execution lifecycle changes. Channel results retain their original Bot ownership even after a Bot leaves the Group. Channel reads are capped at 200, with a visible limit notice. Status grouping uses the existing Session row projection; report state remains distinct from actual execution state.

A Group's explicit Bot query has panel-local state and cancels stale results when its scope changes. It never overwrites the active conversation's shared Sessions projection. Panel visibility and scope changes are reads, not execution requests.

Retire Work's registration and shortcut command. Layout v3 keeps Sessions geometry when present, otherwise replaces an open Work in place, and never reopens two closed panels. Rewrite parked neighbors and deduplicate control order. Keep one pre-migration layout backup. Migrate a valid Work custom binding only when Sessions has no explicit override and no other command conflicts, using DSH's revision-checked edit. Preserve explicit unbinding. On refusal, keep accepted bindings and show a dismissible notice in Keyboard shortcuts. DSH rejects edits for unregistered commands, so the old override stays dormant; a Client completion marker prevents repeated import after a Human resets Sessions.

## Consequences

- Activity Center retains attention and approval. This merge does not add cross-Bot task control or unlimited history.
- The first runnable slice covers scoped reads, stable navigation and local preference migration; it does not change the mobile app or native DSH sidebar grouping.
- A code rollback leaves Host data intact. To restore the old layout, copy the saved `.before-sessions-v3` value back to `botharness.bot-mode-layout`; local post-upgrade geometry is then replaced. Native shortcuts can be reset in their existing settings page.
- Verify legacy layouts, custom bindings/unbinding/conflicts, late responses, Group/DM switching, real Web navigation and actual macOS dispatch separately.
