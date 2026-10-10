# BotHarness Product Context

A DeepSeek Harness plugin layer that gives LLM agents a persistent product identity: PersonaBots — bots whose identity, Git-backed Memory, and execution ownership outlive any Session, Chat, or Workspace.

## Language

### PersonaBots

**PersonaBot**:
A first-class bot entity owned by the Host: a durable identity with a Git-backed Memory Repository that spans Sessions, Chats, and Workspaces and can hold several Sessions at once. Its Soul is optional content within Memory, not the identity itself.
_Avoid_: bot (bare), agent, assistant, robot

**Archived PersonaBot**:
A PersonaBot whose new admissions, wakes, Session execution, and external actions are disabled while its identity, ownership, history, and audit attribution remain intact. Archiving first closes those gates, then stops its Orchestrator, Assignment Sessions, and owned Subagents; it completes only when that execution tree is quiescent. Reactivation never resumes old execution automatically.
_Avoid_: deleted bot, paused UI, purged bot

**PersonaBot Deletion**:
The Human-confirmed end of a PersonaBot’s active identity, retaining historical attribution and its Memory Repository unless the Human explicitly selects Memory erasure. It is distinct from reversible archiving and from Messaging Content Purge.
_Avoid_: archive, hide, automatic Memory purge

**Bot as a Person**:
The principle that a PersonaBot remains one product identity across Sessions, with durable learned continuity coming from its Memory Repository rather than Session history.
_Avoid_: session-scoped identity

**PersonaBot ID**:
The stable, Host-generated identity of a PersonaBot. It is filesystem-safe and never entered, chosen, or used as the visible mention label by a Human.
_Avoid_: Bot slug, display name, handle, username

**Display name**:
The Human-facing name of a PersonaBot and the primary label shown by an `@` picker. Names may repeat; the selected mention token retains the PersonaBot ID.
_Avoid_: identifier, slug, username

**Bot Tag**:
One of zero or more Human-facing labels shown beside a PersonaBot's display name, such as a job or a speciality. Bot Tags are descriptive only and never grant authority or identify the PersonaBot. They travel with the PersonaBot when it is shared.
_Avoid_: role badge (historical), tag (bare), 职位, permission role, category

**Bot Bio**:
An optional Human-authored self-introduction of at most 160 characters that explains who a PersonaBot is, what it does, or what it is good at. It travels with the PersonaBot when it is shared.
_Avoid_: Bot description (historical), bio (bare), Soul, Bot Tag, system prompt

**Profile Banner**:
The wide header image of a PersonaBot Profile, shown behind its Avatar. It is either a generated pixel scene saved as a recipe of scene and seed, first seeded from the Display name when the PersonaBot is created, or a Human-supplied image. It travels with the PersonaBot when it is shared; a Group has none.
_Avoid_: cover, header, background, wallpaper

**Soul**:
A PersonaBot's character, voice, and standing instructions, kept in the root `SOUL.md` of its Memory Repository and delivered to each Session's system prompt from a snapshot frozen at that Session's first prompt assembly, together with its Core Memory. It has no write protection: an authorized Agent or Human may revise it; an edit reaches new Sessions or the next compaction, not a running prefix.
_Avoid_: Persona, PERSONA.md, system prompt, character sheet, profile

**Bot state**:
The current presentation of one PersonaBot, projected from its owned Orchestrator and Assignment Session activity. Active Orchestrator work is shown unless it is waiting on Assignments; concurrent Assignment tool kinds collapse to one matching effect or generic `working`, while waiting and blocked attention remain independent indicators rather than configurable priorities.
_Avoid_: status, mood, presence

**Avatar**:
A PersonaBot's shared visual representation across its Bindings: deterministic Blobatar media, Human-supplied image media, or a composed Avatar Appearance inside one Bot-state Activity Frame. Animated media expresses shared activity facts without changing saved appearance; custom images remain still while the frame carries activity, and each renderer consumes the same state.
_Avoid_: profile picture, skin

**Avatar Family**:
A category of Avatar forms with compatible appearance choices that a Human can combine. Each family expresses the same Bot state in its own visual language; an appearance choice is shared across families only when it is explicitly compatible.
_Avoid_: Soul, Bot type, mode, skin

**Avatar Appearance**:
A PersonaBot's saved visual choices: its Avatar Family, Avatar Species, compatible parts including Custom Parts, colors and editable geometry. The same choices apply across Bindings and return after temporary motion or deformation; they are independent of Persona and current Bot state.
_Avoid_: Soul, pose, mood, skin

**Avatar Species**:
A base within one Avatar Family's rig, such as human, elf, goblin or an anthropomorphic animal, that sets its head silhouette, ears, nose or muzzle and suggested colors, and decides which parts it accepts. It shares the family's motion and anchors; a different skeleton or visual language is a different Avatar Family.
_Avoid_: race, Family, Bot type, skin

**Custom Part**:
A bounded pixel part a Human draws for one Avatar Appearance slot, whose cells reference the appearance's color choices or fixed colors. Applying it embeds a copy in the Avatar Appearance, so it travels with a shared PersonaBot; it is data, never markup or an executable renderer.
_Avoid_: sticker, skin, upload, custom SVG

**Part Library**:
A Human's reusable collection of Custom Parts in the current DSH Profile, each marked by its origin: drawn here, from an imported PersonaBot, or from an imported part file. Importing either adds its parts; editing a library part never changes appearances that already embed a copy.
_Avoid_: asset store, marketplace, catalog

**Window Companion**:
A Human-selected Binding that keeps one PersonaBot's Avatar present across pages within the Harness window and presents selected activity and messages. It retains the existing PersonaBot identity and is independent of Channel pinning and the active conversation.
_Avoid_: desktop pet, Channel pin, separate bot

**Companion Visibility**:
The Human-selected Channel scope for a Window Companion's PersonaBot-authored messages: the Human–PersonaBot DM, Channels shared by both, or every Channel the PersonaBot has joined. It is separate from message-kind playback choices and does not change Channel membership or execution authority.
_Avoid_: Channel pin, Channel membership, Agent Scope

**Model Preset**:
A reusable, deployment-local Human-authored model plan for PersonaBots: one Orchestrator provider, model, and reasoning effort, plus allowed Assignment models and efforts with a default. Applying it copies the plan to a PersonaBot; later preset edits do not update that copy.
_Avoid_: DSH Agent preset, SoulSnapshot

**PersonaBot Model Plan**:
The PersonaBot-local snapshot of a Model Preset or Human custom choices that governs its Orchestrator route and future Assignment model selections. It is operational configuration, not Soul or Memory.
_Avoid_: Soul, DSH Agent preset, model usage

### Support and execution

**Harness**:
The platform layer — BotHarness — that owns PersonaBot identity, Memory lifecycle, execution state, and Workspace authorization, exposing product capabilities to other Plugins.
_Avoid_: framework, runtime, kernel

**Host**:
The single DSH process that runs the plugin and every PersonaBot.
_Avoid_: server, instance, node, worker

**Agent**:
The DSH executor inside one Session. Never a PersonaBot.
_Avoid_: using this word for PersonaBot

**Subagent**:
A DSH child agent and child Session that a Session starts for bounded work; it inherits the parent Session's PersonaBot ownership but belongs to that parent work, never becoming an independent Assignment Session.
_Avoid_: sub-bot, worker, helper

**Session**:
One run of work or conversation for a PersonaBot — DSH's execution unit, with its own progress and working directory.
_Avoid_: conversation, context window, thread

**Session ownership**:
The exclusive, durable relationship between a Bot-mode Session and at most one PersonaBot; a non-Bot DSH Session may remain unowned, and ownership changes only through explicit repair.
_Avoid_: binding, workspace mapping, cwd inference, session membership

**Assignment**:
A Human-meaningful continuing line of activity that a PersonaBot's Orchestrator chooses to advance independently. It has no separate durable identity or lifecycle; its canonical runtime identity is the DSH Session id of its Assignment Session.
_Avoid_: Work, work item, task entity, job entity, worker

**Assignment Session**:
A PersonaBot-owned independent root Session that executes exactly one Assignment in exactly one working directory in v1, created and managed by its Orchestrator without requiring the Human to open another Conversation. A PersonaBot may have several at once, and a DSH Subagent never counts as one.
_Avoid_: Work Session, Worker Session, Executor Session, task Session, child Session

**Assignment Agent**:
The DSH Agent executing inside one Assignment Session. It reports only to its PersonaBot's Orchestrator through that Session, has no Channel messaging capability, and is neither a durable identity nor a PersonaBot.
_Avoid_: worker, PersonaBot, Orchestrator, Assignment Session

**Assignment Directory**:
The PersonaBot-scoped durable read model through which its current Orchestrator explicitly lists and addresses owned Assignment Sessions, including purpose, Continuity Key, Workspace, DSH-derived activity/last-run facts, dependencies, latest semantic report, and aggregate descendant activity. It keeps execution facts separate from reported outcomes, is rebuilt from Session Ownership and DSH facts, and is queried when needed rather than injected wholesale into every turn. Listings use filtered, ordered, opaque-cursor pagination and never flatten DSH Subagents into top-level Assignment rows.
_Avoid_: task list, AgentHandle map, cwd scan, Orchestrator memory

**Continuity Key**:
A stable PersonaBot-local key explicitly assigned to one continuing line of work. It names at most one resumable Assignment Session and may select it only when ownership, Workspace mapping, model, and dependency requirements still match. An active holder must first become idle/completed or be explicitly stopped and superseded before the key moves.
_Avoid_: title similarity, cwd, most-recent Session, global id

**Assignment Request**:
A durable, addressed, auditable Orchestrator message to one owned Assignment Session, optionally correlated to an Inbox Admission or earlier report. Its semantic mode is `context-update`, `next-step`, or `next-turn`; Assignment Runtime maps that to DSH injection, steer, or follow-up without interrupting the current step.
_Avoid_: Channel message, Subagent prompt, broadcast, inferred Session

**Assignment Delivery Intent**:
The minimal BotHarness-owned durable bridge used while creating a DSH Assignment Session or delivering an Assignment Request across the SQLite/DSH transaction boundary. It carries a stable id for idempotent acceptance and bounded restart reconciliation; it is not a general workflow or retry engine.
_Avoid_: exactly-once delivery, task queue, workflow, AgentHandle state

**Assignment Report**:
A durable Session-origin Source Event by which an Assignment Session proactively or responsively returns meaningful progress, blocked or waiting state, results, and artifact references to its PersonaBot's Orchestrator. Full execution history remains in DSH SessionPersistence; each report stays immutable while unobserved repeats may share one Attention Unit.
_Avoid_: direct Channel reply, copied Session log, ephemeral callback

**Assignment Ask**:
An Assignment Report variant that declares the Assignment is waiting for an Orchestrator reply before continuing. The Assignment ends its turn while it waits, and the Orchestrator's addressed Assignment Request resumes the Session; it is not a blocking call, a Channel message, or a separate lifecycle.
_Avoid_: blocking call, direct Orchestrator message, question queue

**Assignment Lifecycle Notice**:
A durable Host-origin Source Event emitted only for a meaningful execution boundary such as settled, error, or cancellation. It carries DSH-derived last-run facts, a concise safe summary, and report/artifact references when available, but remains distinct from content the Assignment Agent authored.
_Avoid_: Assignment Report, fabricated agent message, per-turn directory snapshot

**Assignment Concurrency Limit**:
The profile-wide maximum number of independent Assignment Sessions allowed to execute concurrently. It is a single Human-configured BotHarness setting in v1; a create or wake attempt beyond the limit fails immediately with machine-readable fields and an LLM-readable explanation, without creating a queue, intent, or DSH Session.
_Avoid_: dispatch queue, per-Bot quota, hidden model budget, total Session count

**Workspace**:
A single host directory a Session works in; it maps one-to-one to a DSH workspace. Several workspaces may be grouped in the UI, but a workspace never spans directories.
_Avoid_: project, multi-root folder, group

**Workspace Grant**:
A durable, revocable, application-defined authorization for one PersonaBot and one resolved Workspace. Its Orchestrator may read that Workspace and may write it only when the Human explicitly enables Orchestrator write access; an Assignment selected under the Grant may read and write it. The Grant is neither a DSH Workspace nor a per-Assignment prompt.
_Avoid_: Service Grant, Workspace, one-time approval, cwd inference

**Tool Approval Rule**:
A Human-saved, revocable instruction to answer future DSH approval requests automatically for one PersonaBot role and Workspace Grant scope. An exact rule matches the native tool name and complete input; an all-opaque rule covers every opaque native tool in that scope. Each matching call still receives its own DSH approval decision and audit event.
_Avoid_: Workspace Grant, provider Service Grant, sandbox preset, inferred command similarity

**Assignment Access Preset**:
A Human-controlled per-PersonaBot choice applied when a new Assignment is created. The default is DSH workspace-write with ask; dangerous full access is an explicit opt-in to DSH danger-full-access with never. The chosen mode is frozen in each Assignment's permission snapshot, while its selected Workspace Grant remains required.
_Avoid_: Workspace Grant, in-place Session mode switch, Orchestrator permission

**Delegation**:
Handing responsibility to a PersonaBot from a Chat or the Roster. Its Orchestrator may answer directly or create or reuse one or more Assignment Sessions.
_Avoid_: direct Session creation, task entity, job entity

**Binding**:
A PersonaBot's connection to a surface it takes part in — a Channel, a Chat, the sidebar, or a renderer.
_Avoid_: integration, connector, channel binding

**Orchestrator Session**:
The PersonaBot's long-lived dispatch root Session: at most one is active, consuming the Bot Inbox and deciding replies, dispatch, and new Assignment Sessions. Its working directory is always the PersonaBot's Memory Repository; it is the PersonaBot's social voice, not a Human-managed Conversation or an Assignment row. Ordinary Session output remains execution history; only an explicit Channel messaging command authorized from trusted Session ownership and Channel membership speaks to a Human-facing Channel.
_Avoid_: main agent, brain, supervisor

**Developer Mode**:
A Human-owned Bot-mode preference that reveals diagnostics surfaces (operational log views, verbose states) otherwise hidden by default. It gates Human visibility only — never agent capability: an agent with shell access can always reach the same underlying data, so Developer Mode must never be described or relied upon as a read boundary.
_Avoid_: debug flag, admin mode, agent permission, read boundary

### Computer

**Computer**:
A profile-scoped Linux desktop that every PersonaBot of one profile shares, with one persistent volume holding its files, browser profile (cookies and logins), and CLI credentials. Its isolation boundary is the profile, never a PersonaBot.
_Avoid_: machine, VM, sandbox, desktop, host

**Bot Screen**:
The private work surface one PersonaBot uses on a Computer — the windows and tabs it opened, placed on their own desktop workspace while the Human watches; per-PersonaBot virtual displays are an experimental opt-in. Observation and action are scoped to its owned windows; it is a visibility scope, not a security boundary.
_Avoid_: display, virtual screen, workspace, desktop

**Computer Provider**:
The Provider that runs one Computer and answers its lifecycle, viewer, and transfer operations; exactly one is registered at a time.
_Avoid_: driver, backend, sandbox, tool provider

**Computer Tool Provider**:
The Provider registered on DSH's computer-use seam that supplies the observation and action tools PersonaBots use on one Computer; exactly one is registered at a time.
_Avoid_: driver, backend, computer provider

**Takeover**:
A human session on a Computer that pauses every PersonaBot acting there and disables model-facing screenshots for its duration. It is initiated from one Bot Screen but always applies to the whole Computer.
_Avoid_: handoff, screen sharing, per-bot takeover

**Computer Export**:
A portable archive of one Computer's persistent volume, produced by an explicit export action and restorable on another Host. It is a profile-scoped facet, never part of a PersonaBot export.
_Avoid_: PersonaBot export, backup file, disk image

**Computer Target**:
The profile-scoped choice of where a Computer lives: the Local Computer (default) or a Container Computer. It is set once for every PersonaBot, while Computer Access only decides whether one PersonaBot may use the Computer.
_Avoid_: device, driver, provider, backend

**Local Computer**:
The Computer served by the machine running DSH itself — the Human's own desktop, or the host of a deployment with an interactive desktop. Every PersonaBot shares the Human's real desktop and logins; it offers no isolation beyond that machine.
_Avoid_: host machine, personal computer, native target

**Container Computer**:
The Computer served by the profile's Docker desktop, recommended when the host has no interactive desktop (a headless VPS). It is optional: a profile without Docker uses the Local Computer.
_Avoid_: sandbox, VM, docker computer

**Computer Access**:
The per-PersonaBot opt-in, off by default, that makes the Computer tools and their guidance available to that PersonaBot's Orchestrator and Assignment sessions. It never grants another PersonaBot or a Human session access.
_Avoid_: permission, grant, feature flag, developer mode

**Computer Authorization**:
The once-per-session Human approval before a PersonaBot's first action on the Computer; a profile-level auto-allow setting can skip asking. Access decides whether the tools exist; Authorization decides whether they may run.
_Avoid_: takeover, consent dialog, per-action approval

**Computer Audit**:
The durable, redacted record of Computer observations and actions attributed to the PersonaBot and session that performed them; it never contains typed text or screenshots.
_Avoid_: logs, history, screenshot trail

### Browser

**Bot Browser**:
The dedicated browser a profile runs for its PersonaBots to drive — one instance per assigned browser profile, each with its own persistent profile of cookies and sign-ins, shared by the PersonaBots assigned to it. Its isolation boundary is the browser profile, never a PersonaBot.
_Avoid_: user browser, personal browser, headless browser, Chromium

**Bot Tab**:
The background tabs one PersonaBot owns on the shared Bot Browser — its work surface as listed in the Browser entry, where the Human previews the focused tab. Observation and action are scoped to its owned tabs; it is a visibility scope, not a security boundary.
_Avoid_: agent window, session tab, borrowed tab, tab group

**Browser Access**:
The per-PersonaBot opt-in, off by default, that makes the Bot Browser tools and their guidance available to that PersonaBot's Orchestrator and Assignment sessions. It never grants another PersonaBot or a Human session access.
_Avoid_: permission, grant, feature flag, extension toggle

**Browser Authorization**:
The once-per-session Human approval before a PersonaBot's first action on the Bot Browser; a profile-level auto-allow setting can skip asking. Access decides whether the tools exist; Authorization decides whether they may run.
_Avoid_: Browser Access, consent dialog, per-action approval

**Browser Pause**:
A Human pause on one PersonaBot's tabs that stops that PersonaBot's browser actions and disables model-facing screenshots for its duration; the Human can always operate the local Bot Browser window directly. Page observation stays available while paused; Resume restores actions and model screenshots, and the Bot re-observes before acting. This is independent of Browser Access and Browser Authorization.
_Avoid_: Computer Takeover, handoff, screen sharing, access gate

**Browser Takeover**:
A Human explicitly taking control of one PersonaBot's browser viewport through the viewer: it pauses that PersonaBot's actions and enables Human input for its duration. Releasing resumes the Bot unless a handoff link is still pending. It is narrower than Browser Pause (control, not just a stop) and narrower than Computer Takeover (one Bot's viewport, never the whole machine).
_Avoid_: Browser Pause, Computer Takeover, handoff, screen sharing

**Browser Watch**:
Opening a PersonaBot's browser viewer without pausing it: the Human observes the live viewport while the Bot keeps acting. Watching never interrupts; only Browser Takeover pauses.
_Avoid_: Browser Pause, Browser Takeover, screen sharing

**Browser Audit**:
The durable, redacted record of Bot Browser observations and actions attributed to the PersonaBot and session that performed them; it never contains typed text, page contents, or screenshots.
_Avoid_: logs, history, browser history

### Memory

**Memory**:
Persistent knowledge in the PersonaBot's checked-out Memory Repository working tree. Ordinary files, including code and binary files, become current Memory as soon as Git or a file tool changes the worktree; no additional acceptance step is required. The Orchestrator explores it through native file, search, Shell, and Git capabilities within its access boundary.
_Avoid_: knowledge base, vector store, RAG, database, context

**Memory Repository**:
A PersonaBot-owned ordinary Git repository, created automatically with the PersonaBot and used as its Orchestrator Session's working directory. Git controls branches, merges, and file history; archive, export, restore, and purge remain explicit PersonaBot operations.
_Avoid_: optional attachment, Session memory, generated index, project Workspace

**Managed Git**:
A portable Git that BotHarness installs into the Profile, at the Human's request, when the Host has no usable system Git. The Host then uses it for every Memory Repository operation and exposes it to Sessions.
_Avoid_: bundled Git, embedded Git, built-in Git

**Core Memory**:
A PersonaBot's always-present memory, kept in the root `MEMORY.md` of its Memory Repository: mostly a one-line-per-entry index of what it remembers, plus a few key facts. It enters each Session's system prompt from the same frozen snapshot as the Soul, within a Human-set per-PersonaBot character limit; how it is organized emerges between the Human and the PersonaBot.
_Avoid_: memory tree, pinned memory, generated index, USER.md

**Topic file**:
A Memory file devoted to one subject — a customer, a process, a decision — inside a Memory Repository. It is a convention, not a restriction on repository file types.
_Avoid_: note, document, page, record

**Customer profile**:
The north-star topic file: one per customer, holding timeline, key facts, commitments, and links to related Attachments.
_Avoid_: CRM record, account, contact sheet

**Memory Service**:
The application-defined capability that owns repository identity and lifecycle, trusted Session access, Host-to-Client file and Git queries, and audit/recovery checkpoints. It does not define a second admission gate for current repository contents or expose model-callable Memory CRUD Tools.
_Avoid_: Memory tool, filesystem watcher, Git event source, generic repository

**Memory Commit**:
An ordinary Git commit in a Memory Repository. Git authorship and topology remain intact. BotHarness may record the HEAD observed after a trusted operation with its own actor and cause; the record is an audit/recovery checkpoint, not permission for the file to become Memory.
_Avoid_: accepted commit, file save, filesystem event, auto-save

**Memory Observation**:
A trusted record of repository state seen by the Host, optionally in the context of an owned Orchestrator Session and Source Event. It describes when the state was seen, not who authored Git content; observation does not stage, commit, reject, or hide current working-tree files.
_Avoid_: commit acceptance, filesystem watch, background distillation

**Memory Recovery Checkpoint**:
A recoverable record of one observed Memory Repository branch, HEAD, index, and working tree. Its origin names the observation or explicit command context, not an inferred file author; restoring it requires a Human confirmation and preserves the pre-restore repository.
_Avoid_: accepted commit, auto-save, Git author, ordinary Inbox observation

**Attachment**:
A Host-managed real file received with a Source Event, with identity independent of its current bytes and the sender's upload-source file. Referencing messages show its current contents after external edits; independent uploads remain independent, and a PersonaBot owns a Memory or Workspace copy only after explicitly preserving it.
_Avoid_: upload, provider URL, per-Bot inbox copy, database blob

### Sharing

**SoulSnapshot**:
Historical: an immutable, content-addressed package of selected Memory files, including the Soul when present, with a `bot.md` manifest and setup instructions; the unit the registry was to store, list, and import. Full Memory repository sharing (ADR-0131) supersedes it as the sharing unit.
_Avoid_: export, backup, bot zip, image

**PersonaBot Export**:
Historical (retired by ADR-0134): an immutable, versioned transfer package that always contained one SoulSnapshot and could contain explicitly selected operational Export Facets. A single Bot is now shared as its Memory Git repository (ADR-0131), and a whole Profile moves through Profile Backup.
_Avoid_: SoulSnapshot, database copy, live clone, registry version

**Export Facet**:
Historical (retired with PersonaBot Export): a dependency-closed, schema-versioned optional part of a PersonaBot Export, such as Source Events and Attachments, Inbox and attention facts, Triggers and Wake Policies, a Messaging Archive, disabled Service Grant declarations, or provider account references awaiting rebind.
_Avoid_: arbitrary table dump, credential bundle, active permission

**Messaging Archive**:
A versioned, portable, read-only export of selected Messaging facts, with optional per-Channel NDJSON views derived from the same snapshot. It is not a second authority and contains no credentials.
_Avoid_: Channel authority, database backup, live inbox

**Rebinding Request**:
An inactive imported reference describing a provider account or authority the Human may reconnect and reauthorize locally; until then it cannot admit events, wake a PersonaBot, or execute a Service Action.
_Avoid_: credential, Service Grant, automatic reconnect

**Bot Marketplace**:
The hosted catalog the harness opens to browse, search and install shareable Bots. It lists only Indexed Repositories; there are no accounts or uploaded Bots (ADR-0131, ADR-0135).
_Avoid_: store, hub, Soul registry

**Indexed Repository**:
A public GitHub repository carrying the `botharness-bot` topic that the Bot Marketplace lists by reference and refreshes on a schedule. Installing it creates a fresh PersonaBot from its Git URL; it is not a SoulSnapshot, Listing or Version.
_Avoid_: submission, Listing, SoulSnapshot, mirror

**Bot Zip**:
A `.zip` of one PersonaBot's Memory files, with its `.botharness/bot.json` descriptor and avatar, that a Human exports and hands to someone else; importing it creates a fresh PersonaBot. It holds files only unless the whole Bot is exported with Git history. It never holds identity, Sessions, bindings or credentials (ADR-0135).
_Avoid_: PersonaBot Export, SoulSnapshot, backup

**Soul registry**:
Historical (ADR-0019/0020): the planned hosted service that would store, version, and serve SoulSnapshots. The Bot Marketplace (ADR-0131) replaces it.
_Avoid_: hub, store, database

**Listing**:
A bot's presence in the Soul registry: one `@handle/slug` namespace, a description, and its Versions.
_Avoid_: repo, page, entry

**Version**:
A human-named tag pointing at one immutable SoulSnapshot digest under a Listing.
_Avoid_: release, build, revision

**Handle**:
An account's unique public identifier, used as the namespace of its Listings; never the account's email.
_Avoid_: username, account id

**Bot set**:
A named group of Listings meant to be imported together.
_Avoid_: collection, bundle, pack, team

**Export**:
Historical (retired with PersonaBot Export): materializing a PersonaBot Export. Use Profile Backup for a whole Profile and the Memory Git repository for one Bot.
_Avoid_: database dump, live clone, publish

**Import**:
Creating a new PersonaBot from a shared Memory Git repository (Git URL or Bot Marketplace install); always a copy, with imported operational authorities disabled until explicitly rebound or reauthorized.
_Avoid_: install, clone, pull, restore

**Publish**:
Uploading a SoulSnapshot to the Soul registry as a Version.
_Avoid_: upload, push, submit

### Collaboration

**Actor**:
A Human or PersonaBot that can participate in Channels and author messages; a Bridge carries an Actor's message but is not itself an Actor.
_Avoid_: client, connector, bridge identity, caller-supplied sender

**Human ID**:
The stable identity of the local Human within one DSH Profile, retained across Channels, renaming, and Human Channel nicknames.
_Avoid_: display name, nickname, browser tab

**Human display name**:
The editable default name of the local Human within one DSH Profile. A Human Channel nickname may replace it in that Channel's message-author, member, and mention presentation.
_Avoid_: Human ID, login name

**Human Channel nickname**:
The local Human's chosen name within one Channel, including a DM or Group Channel, overriding the Human display name for that Channel. It labels the same Human ID and does not create a separate Human Inbox or roleplay persona.
_Avoid_: Channel name, PersonaBot display name

**Actor mention**:
A trusted Channel reference to a Human or PersonaBot by stable identity, displayed with that Actor's current name in the message's Channel. Renaming changes its visible label while retaining its target.
_Avoid_: name-matched text, stored display name as identity

**Source Event**:
An immutable local fact received from a Channel, Bridge, webhook, Session, or system source, holding the sole local copy of its content and trusted provenance. It may appear in a Channel and may be admitted to any number of Bot Inboxes, but neither relationship owns another copy.
_Avoid_: inbox message, mailbox copy, notification payload, stimulus

**Provider Echo**:
A provider's inbound reflection of a message BotHarness already sent. When correlated, it enriches the existing Source Event and Outbox receipt rather than creating new attention; an unmatched own-sender echo remains unresolved and cannot wake a PersonaBot.
_Avoid_: new user message, duplicate Channel message, delivery success by assumption

**Source Revision**:
A new Source Event that records an observed edit or retraction of an earlier Source Event while leaving the original fact intact; revisions form one causal chain whose current presentation can be derived.
_Avoid_: in-place edit, overwritten message, replacement body

**Unresolved Revision**:
A Source Revision received before its original Source Event, retained without admission or wake by trusted external identity until the causal chain and target can be linked or reconciled.
_Avoid_: invalid event, orphan to discard, latest by arrival

**Revision Conflict**:
Two or more retained Source Revisions whose current ordering cannot be proven; current-content-dependent external actions remain unavailable until provider reconciliation or Human resolution.
_Avoid_: latest arrival wins, merge guess, retryable error

**Attention Unit**:
A PersonaBot's current consideration of one Source Event revision chain; unobserved revisions coalesce into it, while a change after observation becomes new attention.
_Avoid_: mailbox item, message copy, delivery attempt

**Channel**:
A platform-native conversation space; its type is `dm` (two Actors: one Human and one PersonaBot, or two PersonaBots) or `group chat` (several members; informally a chatroom). A Channel keeps its history locally. Both types participate in the same Channel-section membership, top-level ordering, drag, and move rules; a Human–PersonaBot DM keeps its PersonaBot avatar presentation.
_Avoid_: room, server, board

**Hidden Channel**:
A Channel omitted from expanded and collapsed roster navigation by a Human presentation choice or the default for a Bot-to-Bot DM. Hiding retains Channel membership, history, routing, PersonaBot and Memory state, plus its pin, section, and order placement; the Human can open it for inspection, and can restore a Channel hidden by their own choice.
_Avoid_: deleted Channel, archived Channel, muted Channel, Content Purge

**Channel Deletion**:
The Human-confirmed end of a Channel’s active membership and routing while retaining its history and causal attribution. It is distinct from reversible hiding and separately confirmed Content Purge.
_Avoid_: Hidden Channel, Content Purge, provider conversation deletion

**Channel section**:
A user-created, collapsible grouping of Channels in the bot-mode sidebar. Local display arrangement, not part of a Soul.
_Avoid_: folder, category, group

**Section order (区块顺序)**:
The relative order of Channel sections in the bot-mode sidebar: creation order by default, user-arranged afterwards. Ungrouped Channels may occupy top-level positions between sections without becoming sections.
_Avoid_: priority, layout order

**Sort mode (排序模式)**:
How a sidebar scope orders its rows: `auto` (newest message first), `manual` (the user's frozen order), or `inherit` (follow the global default).
_Avoid_: ordering, sort preference, sorter

**未分组 (Ungrouped)**:
The membership state of a Channel that belongs to no Channel section. Ungrouped Channels render as loose top-level rows, may sit between sections, and have no bucket header or collapse state.
_Avoid_: default folder, inbox, fixed bottom bucket

**Bridge**:
A configured connection from an external source, such as an IM conversation or later a webhook, to an explicit Channel or PersonaBot Inbox target; it carries inbound delivery and exposes outbound capabilities without becoming the Actor. For an IM conversation it is listed under External connectors (外部连接器); the PersonaBot's own external identity is a separate thing.
_Avoid_: integration, adapter, connector (bare)

**Conversation ingest**:
A Channel-owned, one-way connection that places every message of one external conversation into that Channel as Source Events, with context-only member Admissions by default; its wake setting can switch to a batch or every message, and a member PersonaBot's own wake policy in that Channel wins. It is listed under External connectors as an external conversation (外部会话); it grants no reply or other authority to any PersonaBot. Until slice 9 converges them, a Bridge is the Bot-owned route and a Conversation ingest is the Channel-owned one.
_Avoid_: sync, mirror, Bridge (for this record)

**App**:
The UI name (应用) for one authenticated Provider account, such as a Lark app, a Slack app, a Discord bot or a paired WeChat Bot. An App is bound to at most one PersonaBot; a PersonaBot may bind several Apps, including several of one platform. Bot Settings → IM apps lists every App and the PersonaBot that uses it.
_Avoid_: IM account (in UI copy), connector, integration

**Default traffic**:
The messages an enabled external identity Binding admits without any per-conversation consent: direct messages to the App and group messages the qualified Provider reports as mentioning it. Where the App can be reached is decided on the platform; ordinary group text, followed threads and Channel syncs stay explicit.
_Avoid_: all messages, authorized traffic, open intake

**External User Role**:
A PersonaBot's policy for a paired external IM person, containing natural-language behavior permissions and explicit Host-checked management capabilities, which may be empty. The behavior policy guides the model; ordinary chatting and management authority do not implicitly grant one another.
_Avoid_: native DSH role, resource ACL, administrator (for every role)

**Chat pairing**:
A Human-reviewed association of one external person with a Role for one PersonaBot and its current authenticated App Binding. It is reusable across allowed conversations in that scope, with a fresh question required after approval; it does not transfer to another Bot, App, platform or replacement Binding.
_Avoid_: conversation membership, account-wide administrator, saved pending instruction

**Conversation entry**:
The per-conversation anchor of one Binding's traffic, stored as a Messaging Grant. An _implicit_ entry is recorded on the first admitted default-traffic message or first proactive post; an _explicit_ entry comes from a saved send target. A _held_ entry waits for the Human (Ask me first, or a bound was reached) and keeps only metadata. A _blocked_ conversation has a durable block keyed by Bot, App fingerprint, kind and ID that refuses it until **Allow again**. Muting an entry keeps admission but never wakes the Bot.
_Avoid_: authorization (for implicit entries), delivery target, subscription

**New-conversation mode**:
A Binding's choice for a conversation that has no entry yet: `auto` (Admit automatically, the default) records an implicit entry and admits the message; `ask` (Ask me first) holds it. Auto-creation is bounded at 20 new entries per hour and 500 active entries per Binding.
_Avoid_: whitelist, approval mode, auto-reply

**Bot Inbox**:
The PersonaBot-level view of Source Events admitted for its attention, whether or not an event belongs to a Channel. It is not a second content store: reading is an explicit act, and ignoring is allowed.
_Avoid_: queue, mailbox, backlog

**Inbox Admission**:
The durable relationship saying why a Source Event is eligible for one PersonaBot's attention, together with that Bot's read, defer, or ignore facts. It references the Source Event and never copies its content.
_Avoid_: inbox item body, delivery job, message copy

**Bot Self-Record**:
A Source Event about a PersonaBot's own Memory commit or BotHarness-tool action. It appears as a Channel Notice in the Channel of the Source Event that caused it, and is admitted to that PersonaBot's Bot Inbox already handled, so the Bot can find what it did and why without it ever becoming attention or a wake (ADR-0154).
_Avoid_: activity log, tool trace

**Channel Notice**:
A system-presented line in a Channel's history that records an effect, such as a Memory commit or a Bot's action, rather than something a participant said. It has no read or unread state and never wakes or notifies anyone (ADR-0154).
_Avoid_: message, notification, system message (bare)

**Inbox Trigger**:
A PersonaBot-owned durable Host rule that matches Source Events and creates Inbox Admissions, including the admission reason, priority, and Wake Policy selection. The PersonaBot shapes its own rules and the Human may inspect, override, or freeze them; templates may supply initial values, a Bridge never owns attention or wake behavior, and safety gates are never part of a rule.
_Avoid_: bridge, wake policy, model trigger, scheduler

**Messaging Policy**:
A versioned Host rule or authorization whose exact revision must participate in a Messaging transaction, including Inbox Triggers, Wake Policy selection, provider account references, and Service Grants. It belongs in the Messaging store; unrelated PersonaBot, Session, roster, and UI state do not.
_Avoid_: all bot state, model instruction, settings (bare)

**Attention Decision**:
An auditable PersonaBot fact that an Inbox Admission was observed, deferred, ignored, or handled; pending state is derived from these facts rather than stored as a delivery lifecycle. Observation records what actually reached the Bot, while handling follows successful completion of the turn that included it. Observation is an internal audit/detail fact, not an additional primary Inbox status.
_Avoid_: mailbox status, Agent delivery state, consumed flag

**Observation**:
The moment actionable Source Event content or a faithful actionable summary enters the Orchestrator's turn context or is explicitly read by it. Transport queuing, metadata listing, and Human UI viewing are not Observation.
_Avoid_: delivery, notification, human read receipt, outbox success

**Reply Route**:
The non-secret capability reference that lets the Host answer the origin of a Source Event through the correct Channel or Bridge service.
_Avoid_: provider credentials, model-selected adapter, callback URL

**Reply**:
A response to an existing Source Event sent through its trusted Reply Route; the Host, not the model, selects the provider and destination.
_Avoid_: provider tool call, proactive post, arbitrary send

**Service Action**:
A provider-specific capability a PersonaBot invokes deliberately, such as posting to a selected Feishu channel or thread; it has its own authorization even when the target was discovered from a Source Event.
_Avoid_: reply, automatic routing, raw provider API

**Provider Capability**:
An operation or event that one configured provider account's adapter declares it can support, such as recall events, current-message fetch, replies, or proactive posting. Capability is availability, never authorization.
_Avoid_: permission, grant, installed plugin, tool visibility

**Provider Account Fingerprint**:
A stable, non-secret provider identity derived by an authenticated adapter from provider-issued tenant or organization, application or bot, and account identifiers. Managed Restore uses an exact match plus Human confirmation to rebind suspended authority; credential references and display names never count as identity.
_Avoid_: credential reference, secret hash, account label, guessed provider identity

**Service Grant**:
Explicit Human authorization for a PersonaBot to perform named Service Actions through one provider account against an exact, grouped, or explicitly wildcarded target scope, validated both when intent is accepted and when its side effect executes.
_Avoid_: provider capability, plugin installation, discovered target, blanket consent

**Content Purge**:
An explicit destructive removal of Source Event bodies and unshared Attachments from Messaging authority while retaining the minimum event envelope and tombstone required for causality and audit.
_Avoid_: recall, hide, archive, garbage collection

**Purge Everywhere**:
A separately confirmed destructive operation that applies Content Purge and removes selected managed Memory, Workspace, and export derivatives disclosed by a dependency report; copies outside BotHarness control remain the Human's responsibility.
_Avoid_: content purge, automatic cascade, external recall

**Purge Ledger**:
The monotonic record of Content Purges that Managed Restore merges and applies before Messaging becomes available. A standalone offline backup can guarantee only the purge checkpoint it contains; manually retained older files remain outside later purge control.
_Avoid_: database snapshot, deletion queue, audit log (bare)

**Outbox Intent**:
A durable request for one external side effect, bound to an idempotency identity, current Source Revision, Provider Capability, and Service Grant where required.
_Avoid_: message, retry attempt, delivery notification

**Unknown Outcome**:
A Human-resolved Outbox state whose provider request started but whose success or failure cannot be proven after available reconciliation; it is not safe for the PersonaBot to retry or declare success on its own.
_Avoid_: failure, timeout, retryable error, success

**Bot Schedule**:
A PersonaBot-owned durable Host rule that admits a `schedule` Source Event into its Bot Inbox at planned times. The Human and the PersonaBot both manage it; a Human lock makes it read-only to the PersonaBot. It is keyed to the PersonaBot, never to a Session.
_Avoid_: cron job, DSH Schedule, timer, heartbeat, scheduled Assignment

**Wake Policy**:
The deterministic Host policy that decides whether an admitted event wakes a PersonaBot now, joins a digest, or causes no automatic wake. The UI calls it 唤醒策略 / Wake policy; it never notifies the Human.
_Avoid_: model decision, delivery mechanism, scheduler, 提醒策略, attention policy, notification

**Delivery Policy**:
The Host policy that maps a Wake Policy decision and Orchestrator liveness to a safe-step steer, the next harvest, or no wake.
_Avoid_: wake policy, inferred step state, message priority

**Turn harvest**:
One Orchestrator turn that consumes a bounded, fair selection from the ready attention set — immediate items, due digest batches, and passive notices — instead of one turn per event. When a Group Channel enters the turn, the selection can also include its pending non-silent Inbox context, reserving space for the trigger, nearby messages, and oldest pending messages. Unselected items remain pending; a steered direct address joins the running turn instead.
_Avoid_: per-event queue, wake storm, batch (bare)

**Activity Center**:
The Human's Bot-mode entry for cross-PersonaBot and cross-Channel work, with an operational Overview and a personal Human Inbox. It summarizes existing facts without becoming another authority for messages, usage, or Session activity.
_Avoid_: Human Inbox (for the whole entry), dashboard list

**Human Inbox**:
The personal attention view inside Activity Center: unresolved Human actions, mentions and replies, unread Channel activity, informational updates, and handled history. It references the owning facts without copying Channel content or flattening every Bot Inbox event into Human work.
_Avoid_: notifications, Bot Inbox, dashboard list

**Channel Attention**:
A Human Inbox item caused by Channel activity such as an unread message, mention, or reply; it references the owning Source Event and may be ignored unless classified action-required.
_Avoid_: Channel Inbox, copied message, Bot Inbox Admission

**PersonaBot Attention**:
A Human Inbox item caused by a PersonaBot waiting for the Human, becoming blocked, requiring approval, or issuing an informational report.
_Avoid_: personal attention, Bot state, notification

**Channel membership**:
An Actor's participation in a Channel, carrying its owner/member role and authority to read or send there.
_Avoid_: subscription, notification policy, caller claim

**Channel reference**:
A Human-selected pointer to an existing Channel, identified by its stable Channel ID. It helps an addressed PersonaBot find the Channel but does not grant membership, reveal the Channel's conversation, or message its members.
_Avoid_: Channel invitation, membership, typed #name

**Group invitation**:
A Group Bot creator's pending offer of membership to an active nonmember PersonaBot. It becomes Channel membership only when the invited Bot accepts; a Bot-mode auto-accept default may accept on the Bot's behalf. The invitation grants no read or send authority before acceptance.
_Avoid_: join request, membership grant, Channel reference

**Group join request**:
A nonmember PersonaBot's pending request for membership in a referenced Group Channel. It becomes Channel membership only when an authorized Human or Bot Group creator accepts it.
_Avoid_: invitation, implicit join, Channel mention

**Bot Channel subscription**:
A PersonaBot's per-Channel attention preference, owned by the PersonaBot: `all` (every ordinary message can wake immediately), `digest` (ordinary messages join the wake digest at its count and interval; the default), `mentions` (ordinary messages enter the Inbox without waking and may accompany a direct mention from the same Channel), or `silent` (ordinary messages enter the Inbox but neither wake nor accompany a direct mention; explicit Bot reading is required). Direct mentions and DMs always reach the Bot; the Human may override the preference, and it is independent of membership and send authority.
_Avoid_: membership, wake decision, digest schedule

**Message provenance**:
The trusted origin and causal identity of a Channel message — its Actor, ingress surface and external identity, plus any reply or Bot-to-Bot chain.
_Avoid_: caller-supplied author, transport metadata (bare)

### Chats and replies

**Chat**:
A Feishu/Lark conversation — group or p2p — that a PersonaBot takes part in, identified by `chat_id`.
_Avoid_: room, channel, group (when p2p is meant too)

**DM**:
A 1:1 conversation between two Actors — a Channel of type `dm`, or its bridged equivalent. A Human–PersonaBot DM is the Human's direct conversation with one Bot; a Bot-to-Bot DM has two PersonaBot participants and may be inspected read-only by a Human without making that Human a participant.
_Avoid_: private chat, PM

**Bot-to-Bot DM**:
A DM Channel whose two participants are PersonaBots. A message from one Bot is a Source Event in that Channel and may enter the other Bot's Inbox; the Human's read-only inspection is separate from Channel membership.
_Avoid_: peer relay bus, copied inbox conversation

**Thread**:
A sub-conversation opened by replying to a message inside a Chat or a Channel.
_Avoid_: topic, sub-chat, channel

**Reply scope**:
Where a PersonaBot's answer lands: under the triggering message in the Chat (root), or inside a new Thread.
_Avoid_: reply mode, answer position, visibility

### Host and setup

**PersonaBot registry**:
The Host module that owns PersonaBot definitions, archive state, bindings, and Session ownership; its operational records live in the BotHarness operational database while Soul content remains in files.
_Avoid_: config file, database, fleet

**BotHarness operational database**:
The one profile-scoped `botharness.db` that physically stores every BotHarness operational record while deep modules retain separate interfaces and table ownership. It stores references to, but never replaces, Soul files, attachment content, DSH Session logs, credentials, or DSH-native settings.
_Avoid_: Messaging database, DSH storage domain, Soul store, generic repository

**Profile Backup**:
A self-contained, versioned, compressed `.botharness-backup` file containing the complete operational-database snapshot, every Soul/Memory file, every reachable CAS object, an integrity manifest, and optionally a DSH Session facet produced through SessionPersistence; created only by an explicit Human export, never by a scheduler or dangerous-operation hook.
_Avoid_: PersonaBot Export, copied database, SoulSnapshot

**Managed Restore**:
The identity-preserving recovery path for a Profile Backup, including compatibility, identity-conflict, integrity, and Purge Ledger checks before operational state mounts.
_Avoid_: import, clone, PersonaBot Export

**Runtime Dependency Manifest**:
The non-secret declaration of provider adapters, models, plugins, tools, Skills, and other target-local capabilities a restored profile may require, including required-versus-optional scope and compatibility identifiers but never executable code.
_Avoid_: plugin bundle, credential inventory, historical tool log, package installer

**Dependency Contract**:
A Host-owned stable capability identifier plus supported interface and persisted-schema version ranges. It determines compatibility without requiring the producer's exact plugin build; security- or integrity-critical requirements cannot be downgraded by an imported package.
_Avoid_: exact package lock, display name, exporter-defined trust, implementation version

**Desired Dependency Reference**:
The portable declaration of the model, provider, plugin capability, Skill, tool, or Workspace identity a PersonaBot intends to use, retained independently from how the current Host satisfies it.
_Avoid_: installed package, local path, resolved credential, runtime handle

**Target Resolution**:
The Human-confirmed, Host-local mapping from a Desired Dependency Reference to an available model, adapter, plugin capability, Skill, tool, credential reference, or Workspace. A new Host must resolve it again.
_Avoid_: portable authority, overwritten desired configuration, automatic fallback

**Activation Readiness**:
The target-local projection of restored declarations against currently available dependencies and mappings. It is capability-scoped and reported as `ready`, `degraded`, or `blocked`; it does not change whether profile data restored successfully.
_Avoid_: restore result, PersonaBot activity, plugin installation state

**PersonaBot Activation**:
The explicit Human command after restore that accepts the current Activation Readiness, creates a fresh Orchestrator Session, and opens only dependency-ready and authorized execution paths. It never resumes an old Session.
_Avoid_: profile data activation, dependency installation, automatic resume, unarchive

**Profile Writer Lease**:
The exclusive, operating-system-backed right for one Host to mount a profile's operational database for writes. A second Host may expose diagnostics but cannot run PersonaBots or mutate operational state.
_Avoid_: SQLite busy timeout, timestamp lock, browser leader

**Schema Generation**:
The single monotonic compatibility version for the whole operational database; deep modules contribute ordered migration steps, but the database owner validates and applies one generation transition.
_Avoid_: per-table version, plugin version, migration filename

**Export Origin**:
Structured provenance on cloned records — export id, source installation id, and source local id — retained while every imported object receives a fresh local id.
_Avoid_: preserved local id, provider authority, display label

**Backup Barrier**:
A short profile-wide mutation pause that drains BotHarness transactions, flushes selected DSH Sessions to recorded durable cursors, fixes Soul/Memory and CAS references, and starts a consistent database snapshot without stopping active turns.
_Avoid_: Host shutdown, PersonaBot archive, fuzzy copy

**Unavailable Session Reference**:
A preserved Session ownership/audit record whose DSH Session content was omitted or unsupported in a Profile Backup; it cannot resume until an explicit repair or relink succeeds.
_Avoid_: deleted Session, empty Session, unowned Session

**Unavailable Workspace Reference**:
A restored Workspace locator whose target directory has not been explicitly mapped and verified on the current Host. Its source path and identity hints remain evidence, but its Assignment Sessions cannot resume.
_Avoid_: missing directory to auto-create, broken Session, trusted absolute path

**Redaction Tombstone**:
A typed export placeholder that preserves identity, dependency, hash, and provenance while deliberately omitting sensitive content, so an Export Facet never contains a dangling reference.
_Avoid_: missing row, empty string, Content Purge

**Import Receipt**:
The durable result keyed by destination profile and export id that makes ordinary PersonaBot import idempotent; an explicitly requested additional Clone receives a separate receipt and fresh local ids.
_Avoid_: Export Origin, registry Version, retry token

**Profile Transfer**:
The planned identity-preserving move of one profile generation from a source Host to a target Host, leaving the source Transferred Out so both installations cannot run the same PersonaBots.
_Avoid_: Profile Backup, clone, sync

**Transfer Generation**:
The unique generation that links one quiesced source, its Profile Backup, and one target activation during Profile Transfer.
_Avoid_: Schema Generation, backup timestamp, export id

**Transferred-out Profile**:
A source profile that has completed its side of Profile Transfer and therefore cannot run PersonaBots, receive provider events, or execute external actions unless a later explicit recovery protocol grants it a new active generation.
_Avoid_: Archived PersonaBot, stopped Host, backup source

**Disaster Restore**:
Managed Restore performed without proving the old profile is deactivated; restored provider bindings, provider-bound Triggers, and Service Grants remain suspended until the Human resolves possible split brain.
_Avoid_: Profile Transfer, clone, ordinary restore

**Roster**:
The bot-mode sidebar list of PersonaBots and Channels, with their state.
_Avoid_: dashboard, bot list

**App Sidebar**:
The DSH-native left column of the client, which in Bot mode renders the Roster. It is named to distinguish it from the Channel sidebar on the right.
_Avoid_: left sidebar, main sidebar, navigation

**Channel sidebar**:
The right-side region of the Bot mode panel, scoped to the currently selected Channel: a group Channel shows its membership and Channel management entries, and a PersonaBot DM shows that PersonaBot's own entries such as Assignments, Memory, its Bot Inbox, and its operational configuration: Model Plan, Wake Policy, external identities, External connectors and approvals. It is not the DSH session-scoped native right column.
_Avoid_: PersonaBot navigation, right panel, session panel, inspector, workbench

**Channel body**:
The center region of the Bot mode panel: the selected Channel's header, primary content, and composer. A DM renders its Chat here.
_Avoid_: main pane, conversation view, chat panel

**Channel sidebar entry**:
One registered, collapsible item of a Channel sidebar: a stable id, label, order, scope, and a renderer that may display information, offer controls, or both. An unavailable entry is absent rather than a placeholder.
_Avoid_: widget, card, tab, destination, Channel section

**PersonaBot Profile**:
The per-PersonaBot surface for its shareable identity and its read-only activity: the identity travels with the PersonaBot when it is shared (Display name, Avatar, Profile Banner, Bot Tags, Bot Bio), and the activity is token usage derived from its owned Sessions, event activity from its Bot Inbox Admissions, and Memory commit activity. Operational configuration such as its Model Plan, Wake Policy, external identities, Bridges and approvals is never part of it; that lives in the Channel sidebar. It appears compactly as a Profile popover from the PersonaBot's avatar in a DM header, and expands into a Profile view in the Channel body.
_Avoid_: account, dashboard, bot page, profile (bare), settings page

**Group Profile**:
The per-Group Channel surface for the Group's name and avatar and its activity from committed Channel messages. It shows message counts by day and by author, distinguishing Human and PersonaBot authors; Group configuration such as member Wake Policy and Bridges lives in the Channel sidebar. The Group header opens its popover and expanded Channel-body view; DM Channels have only their PersonaBot Profile.
_Avoid_: PersonaBot token usage, Group management sidebar, DM Channel Profile

**Approver**:
An external IM user who has been paired with one PersonaBot and granted the approval capability by the Web Human. Approval requests go to the Approval destinations; the first accepted decision from any Approver wins. Seeing a request, being in the group it was posted to, or sharing a display name gives no authority, and a decision from anyone else is refused without reaching the PersonaBot.
_Avoid_: admin, moderator, group member, recipient

**Approval destination**:
An IM conversation, private or group, chosen from the PersonaBot's External connectors, to which the Host posts each committed approval request. Receiving it is not authority to decide.
_Avoid_: approver, notification channel, webhook

**Profile popover**:
The compact form of a PersonaBot or Group Profile, anchored to the avatar in the Channel body header. It shows only the Profile Cards the Human pinned for that scope and offers entry into the Profile view.
_Avoid_: menu, dropdown, tooltip, card stack

**Profile view**:
The expanded form of a PersonaBot or Group Profile. It occupies the Channel body and temporarily replaces the Chat's history and composer; leaving it returns the Channel body to the Chat, and it changes nothing in the Channel sidebar.
_Avoid_: panel, page, tab, inspector, settings

**Profile Card**:
One registered component of a PersonaBot or Group Profile: a stable id, label, order, scope, visibility rule, and compact and full renderers that may display information, offer controls, or both. A Human may pin a Profile Card to the corresponding Profile popover.
_Avoid_: widget, tile, gadget, Channel sidebar entry

**Client bridge**:
The RPC surface through which the Web Client reads PersonaBots and invokes separate mutation commands without sharing Host services.
_Avoid_: remote, IPC, gateway

**Bot Settings**:
The BotHarness-owned modal (Bot 设置) for profile-wide BotHarness configuration, organised into Bot Settings sections in its own sidebar. Configuration of one PersonaBot or one Channel never lives here; that is a Channel sidebar entry. DSH's own settings modal is called DSH settings; its Bot 设置 item only points into Bot Settings, while App credentials remain in DSH settings.
_Avoid_: Settings UI, settings page, preferences, admin panel, dashboard, web console

**Bot Settings section**:
One sidebar destination of Bot Settings: a stable id, label, order, and a renderer for one coherent group of profile-wide settings.
_Avoid_: tab, page, settings item, Channel sidebar entry

**Access policy**:
The per-PersonaBot list of users and chats allowed to reach it.
_Avoid_: whitelist, permissions, ACL

**Credential reference**:
A pointer to a Feishu App Secret held by the DSH credentials service; the secret itself never reaches config, repo, or logs.
_Avoid_: secret, API key, token

### Telemetry and campaigns

**Telemetry**:
Anonymous product usage events the Host sends to the project's analytics service, on by default and turned off by plugin config `telemetry: false`, `DO_NOT_TRACK=1` or `BOTHARNESS_TELEMETRY=0`. It never carries names, Memory, conversation content, paths or IP addresses (ADR-0132).
_Avoid_: tracking, analytics SDK, crash reporter

**Install ID**:
A random identifier generated on a plugin installation's first start and attached to its Telemetry. It identifies the installation, never a Human, and is never linked to a site visitor.
_Avoid_: user ID, device ID, machine ID

**Campaign**:
One marketing push, such as a launch, that groups the Campaign Links created for it; its slug becomes `utm_campaign`.
_Avoid_: ad, promotion

**Campaign Link**:
A short link on `go.botharness.ai` for one post or video in a Campaign, carrying its platform and media type; resolving it redirects to the product site with UTM parameters and counts the click.
_Avoid_: short URL, UTM link, referral link
