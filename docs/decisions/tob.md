# Tob decisions

What Tob is, where the Human reaches it, and how it manages the Host through the CLI without becoming an administrator. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); who answers an approval is in [Approval decisions](approvals.md); Bot-to-Bot messages are in [Messaging decisions](messaging.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0223, 0224, 0225, 0268, 0314 and 0347, and each section lists the ADRs it absorbed.

Two rules run through every section:

- **Authority comes from the accepted Human DM, never from Tob's files.** Only the protected Tob singleton's root Orchestrator, running for the exact accepted Human private-DM Source Events of the current execution, can manage the Host. Soul, Memory, display name, a CLI argument, a Group, external IM, another Bot or an Assignment Session never confer it.
- **Tob uses the Human's CLI and the existing owners.** Tob gets no management Tools of its own, no second settings store and no second approval owner. Every change goes through the same owner, revision check and approval card the Human's own command would.

## 1. Tob is a protected local PersonaBot with one Human DM

<a id="adr-0223"></a>
_Formerly ADR-0223; its Home panel, Home setup and layout v8 were removed by ADR-0268 (§2)._

Each Profile reserves one local Tob identity before provisioning its PersonaBot, Git Memory, Workspace Grant and Human DM; interrupted provisioning resumes the reservation instead of creating a second Tob. Tob is an ordinary PersonaBot in every other respect: its Soul and Memory stay editable and portable, and its conversation is one ordinary DM with ordinary Channel history. The Host owner refuses to archive or delete it, whatever its display name. A revoked Workspace Grant is never silently recreated. Tob inherits the Host's default model unless the Human customizes it.

Why: an ordinary named Bot with Host credentials would turn editable persona files and imported content into administrative authority. A separate Home conversation would duplicate history and lose the existing approval path.

Enforced by: `tob.test.ts` (concurrent clients converge on one Tob and one DM, restart keeps the identity, interrupted provisioning never restores a revoked Grant).

## 2. The Human reaches Tob through its DM; Tob Mode is a mobile entrance to it

<a id="adr-0268"></a>
_Formerly ADR-0268, which removed the Home panel of ADR-0223._

There is no Home panel. On desktop the Tob DM opens in Messages, and the "Open Tob" command does that without changing the layout; in Simple layout the Human can hide the Side column to focus on the conversation ([ADR-0269](onboarding.md#adr-0269)). Cross-Bot attention stays in Activity Center, and the Human asks Tob in conversation to create a Bot.

On mobile, **Tob Mode** is the ordinary chat screen for the Tob DM with a different entrance: the **Tob entry bar**, a Composer-shaped tap target above the tab island on Chats (#5106, replacing pull-to-Tob). A tap opens the Tob DM with the Composer focused and the keyboard up, through the iOS zoom navigation transition or an Android Material container transform (instant under Reduce Motion); Back returns to Chats. The bar targets the Tob of the filtered computer Environment, or the most recently used one under "All environments" or a cloud filter, and is hidden when there is no Tob. Pulling down on Chats only refreshes. The Tob row stays in the Chats list.

**Tob Delegation** uses the existing Bot-to-Bot DM: Tob picks a colleague, sends without asking the Human first, and reports back in its Human DM. Each send shows the existing action notice; approval ownership, the Bot-hop limit and Tob's CLI authority do not change. Tob never joins a Group.

Why: a message sent from Home jumped to the Tob DM anyway, and Home's overview duplicated Activity Center. One conversation keeps one history and one approval path. ADR-0268 specified a 0.6 s timed hold; the shipped gesture (#3117) committed on distance, and #5106 replaced the pull with the Tob entry bar so the entrance is visible and lands ready to type.

Enforced by: `apps/mobile/test/tob-mode.test.tsx`, `tob-entry-bar.test.tsx`, `tob-delegation-prompt.test.ts`, `tob-delegation-telemetry.test.ts`.

## 3. Each Shell execution gets its own short-lived CLI broker

<a id="adr-0224"></a>
_Formerly ADR-0224 (authority, broker and lifecycle; its allowlist was replaced by ADR-0314, §4)._

Tob uses DSH's native bash or pwsh Tool. A Shell Provider wrapper binds each native ToolExecution to a process-local broker on a loopback endpoint and hands the child process an ephemeral bearer token. The Host takes Tob's identity from the actual ToolExecution and requires each new broker request to match the Shell's accepted Human DM sources. A later turn or newly accepted source makes that snapshot ineligible for new requests. On write admission, the broker captures those verified sources and their Human DM for that exact proposal. Later Inbox arrivals can steer the turn while the proposal waits for review or runs. The admitted write still requires the original sources to remain valid, the same turn and Session owner, and the live execution and target authority. Completion, cancellation and disposal revoke the broker, and a Host restart never revives one: Tob must start a new Shell and read the current state. In scoped mode the CLI never reads Human administrator credentials and never falls back to offline mutation.

The token is visible to any code in that Shell, so the broker is not isolation from another process of the same OS user. Its protection is the narrow operation scope, the Host-side source check, approval, revision guards and revocation. Diagnostics never log the endpoint or the token.

Why: a management Tool per setting would duplicate the CLI's discovery and drift from its approval behavior, and handing a Shell the Human's login would make editable persona text an unrestricted Host credential.

Enforced by: `tob.test.ts` (management binds to the current protected Orchestrator and canonical Human DM; new requests lose admission after the turn or a newly accepted message), `tob-cli-inbox-approval.test.ts` (Bot DM steering before the card opens or after the decision commits; one approved write and a refused second invocation), `tob-cli-broker.test.ts`, `tob-cli-shell.test.ts`.

## 4. Tob runs every CLI command: reads at once, writes after an approval card

<a id="adr-0314"></a>
_Formerly ADR-0314, which replaced ADR-0224's allowlist._

Tob can run every `tobs` command the Human has. Commands with typed operations keep them (§5). Any other command goes to the broker as `cli` with its exact argv, stdin and folder, and the Host runs the Human CLI in a child process with the Host's own loopback origin and launch token; the token never reaches Tob's Shell and is redacted from output.

A command runs at once only when the Host's read list (`brokerRead` in `bots/cli-effects.ts`) names it, its parsed effects change nothing, and it has no `--out`. Everything else is a write, including any command the list does not know. A write first shows the Human a card with the exact argv, the folder, and the size and SHA-256 of any stdin, never its contents. Full Access and Approval Templates do not replace this card; only an Always allow rule the Human saved from such a card can ([Approval decisions](approvals.md#adr-0249)). Channel Tool Approval routes the exact prepared operation to the Human DM captured at admission and rechecks the decision against the same call at execution. A rejected or cancelled card never runs the command. The Human CLI's own refusal comes back to Tob unchanged; a write that loses its result is `operation-outcome-uncertain`, and Tob reads before retrying. `--host`, `--token-file`, `--home`, `--as` and `--administration` are refused in any form, and `ssh-tunnel`, `voice-local-kit`, `audit`, `private` and `tob-cli` are refused outright. Output is capped at 8 MiB. A one-time confirmation or link never travels through stdout: its command writes it only to a new private `--out` file and prints the path (`device-offer`, `profile-backup-preview`), so it stays out of Tob's results, approval cards and Session log, and the `--out` makes the command a write.

Why: a growing allowlist meant Tob kept refusing what the Human could do on the same Host, and CLI parity now gives Tob every new feature. The read list errs toward a card: a read it misses costs one click, while a write it wrongly admitted would run without one. The child reads named files with the Host's permissions, so a command with file input or output is never a read.

Enforced by: `tob-cli-authority.property.test.ts` (for any argv, a command runs at once only when the list names it, it changes nothing and it has no `--out`; an unknown command is a write; adding `--out` anywhere turns a read into a write; the refused options are refused anywhere, bare or with `=`), `tob-cli-host-commands.test.ts`, `tob-cli-approval.test.ts`, `tob-cli-profile-backup.test.ts` (a Profile Backup through Tob, from preview to activation in the restored Profile, never shows the export confirmation), `tob-cli-device-pairing.test.ts` (a device paired from Tob's offer file and revoked after review loses its requests and streams; no link, offer or credential reaches Tob or the pairing log).

## 5. Typed operations review the exact change and survive a lost response

<a id="adr-0225"></a>
_Formerly ADR-0225, with the reviewed-settings write of ADR-0223 and ADR-0224._

- **Settings.** A write carries the namespace, patch, expected revision and previous value; Native Settings stays the only value and revision owner. The guard rechecks authority, revision and previous value after approval and right before writing, then returns the read-back. A stale proposal refuses, and an uncertain result is reconciled against Settings, never replayed. Human `settings-set` accepts the same two optional guards; scoped Tob writes require them. The first typed setting was `botharness-client.assignmentConcurrencyLimit` (1 to 32).
- **Bot creation.** The `bot_creation_operations` table binds a stable operation key to a canonical input fingerprint and a reserved slug before the Registry creates the Bot and its managed Memory and the Channel owner prepares its Human DM. Repeating the same key and payload reconciles; a different payload refuses; archived or deleted identities are never recreated from a key; a Memory folder with no Registry record refuses as `creation-memory-conflict` and is kept for repair. Keyed creation covers blank Bots in managed Memory only.
- **Profile.** Reads return an opaque fingerprint of the whole Registry record, and metadata (name, description, tags only), appearance and pause or resume writes must carry it. Images are reviewed by digest and size.
- **Schedules.** The `bot_schedule_creations` table records an operation key, the Bot, a fingerprint of the normalized request and the schedule id in the same transaction as the schedule. Repeating `schedule-create` with the same key and request returns the original with `reconciled: true` and never counts it against the enabled limit twice; a different request refuses as `operation-key-conflict`; a key whose schedule was deleted refuses as `operation-key-consumed` and never recreates it. Every schedule exposes a `revision` over its editable state (title, prompt, trigger to the second, enabled, locked); a recurring firing does not change it, while the final firing of a one-time schedule turns it off and so does; `schedule-update` and `schedule-delete` with `--expected-revision` refuse a mismatch as `stale-revision` inside the write transaction. Both are optional for the Human; Tob's `cli` path refuses `schedule-create` without `--operation-key` and `schedule-update` or `schedule-delete` without `--expected-revision` as `usage` before any card.

- **Memory and Soul.** `memory-save` and `memory-restore-commit` for a Bot the Human owns carry the target, the base revision (`expectedHead`), the before and after SHA-256 and a unified diff of at most 256 KiB, and the Memory owner (`saveHuman`, `restoreCommitHuman`) stays the only writer, acting as the Bot's owner. A moved head, busy or uncommitted Memory, Tob itself or an archived Bot refuse before the card; after approval the guard rechecks authority, ownership and the base revision, then the file is read back. Repeating the same edit or restore id returns the existing Memory Commit as a read, never a second write. Both always need a fresh Human decision, like deletion. The result states when Sessions see the change: Soul and Core Memory reach new Sessions at once and a running Session after its next compaction.
- **Deletion.** Uses the owner's preview token, dependency scope and owner-derived Memory path; retention is the default and erasure is explicit. Every confirmation and retry needs a fresh Human decision and the explicit confirmation flag, even under Full Access or a saved rule. Tob itself can never be archived or deleted.

Why: a transport failure after creation must not produce a second identity, Memory or DM, and a profile write must not overwrite a change made while its card was pending. The generic card showed only the size and hash of a Memory body, so the Human approved an edit to a Bot's identity without seeing it. These owners already existed; Tob reaches them without sharing the Human's credentials.

Enforced by: `tob.test.ts` (stale proposals refuse, an uncertain write reconciles through read-back), `tob-cli-bot-create.test.ts`, `tob-cli-bot-profile-operations.test.ts`, `tob-cli-broker.test.ts` (concurrent setting changes and denied approvals never write), `tob-schedule-operation-key.property.test.ts` (any sequence of same-key creates leaves one schedule), `bot-schedules.test.ts` and `bot-schedule-operation-keys.test.ts` (conflicting, consumed and stale requests refuse; firings keep the revision; a change of seconds changes it), `tob-cli-host-commands.test.ts` (Tob schedule writes without a key or revision refuse before a card).

Enforced by: `tob.test.ts` (stale proposals refuse, an uncertain write reconciles through read-back), `tob-cli-bot-create.test.ts`, `tob-cli-bot-profile-operations.test.ts`, `tob-cli-broker.test.ts` (concurrent setting changes and denied approvals never write), `tob-cli-memory-edit.test.ts` (the card carries the base revision and diff; concurrent edits, denial and revoked scope write nothing; an exact retry reads back without a card; a restore gets its own card).

## 6. A model-free CLI request runs inside a real accepted Human DM turn

<a id="adr-0347"></a>
_Formerly ADR-0347._

The authenticated Host Owner can start a typed request with `tobCli`. The runtime appends a real Human message to that Owner's Tob DM and runs it through the usual Source Event claim, Admission, Orchestrator queue and turn; no caller chooses an actor, source, Session or cwd. The turn runs the `deepseekbot_cli` Tool once, without a model step, against a per-invocation broker that shares the Shell path's approval, confirmations, revision checks and execution guard, so it adds no second card. The Tool exists only during that lease; ordinary model turns, same-name replacements and recursive `tob-cli` requests never get it.

One request runs at a time, and a busy Orchestrator refuses a new one; ordinary DMs queue behind it. Results are process evidence only: at most 16 entries, kept 10 minutes after they settle, with 256 argv entries, 64 KiB of argv and 1 MiB of stdin per request. Stdin is never copied into the DM. A request id on that DM message stops ordinary retry or continuation from reusing it, and nothing replays after a restart.

Why: the temporary direct Session behind the Human CLI has no accepted Tob DM, so it could not pass the source check. Running inside a real turn lets agents test the production path, approval card included, without a model.

Enforced by: `tob-cli-invocation.test.ts`, `tob-cli-approval.test.ts`.

## 7. A Bot request gets a custom proposal and live Marketplace candidates in one DM

<a id="tob-creation-candidates"></a>
_Added for #4836; builds on §4 and §5 and the Marketplace install review of [ADR-0267](marketplace.md#adr-0267)._

When the Human asks Tob for a new Bot, Tob first searches the Marketplace with `marketplace-list` using words from the request, unless the Human explicitly said to skip it. It answers in one Human DM message with both a custom proposal (name, Bot Bio, Bot Tags and a short Soul and Core Memory draft) and up to three live candidates, then asks the Human to choose. Nothing is created or installed before that choice. The custom choice runs `create` with the reviewed fields and an operation key (§5). A candidate goes through `marketplace-install`: Tob stages and reviews it, shows the findings, and installs with `--review` and `--confirm` after the Human agrees. A repository or ZIP the Human supplies goes through `bot-import-preview` and `create --from-git`, or `bot-zip-preview` and `bot-zip-import`. Tob adds no review of its own, and the result is an ordinary PersonaBot, never a second Tob. Tob reads the outcome back with `create-status`, `bot-zip-import-status` or the same install operation key.

`marketplace-list` reports `search: matches` or `search: no-matches` on every page. A search that could not run exits non-zero, usually with `marketplace-unavailable`, and prints no page. Tob says the Marketplace could not be searched, names the code and still offers the custom proposal. It never reports such a failure as "no matches".

`marketplace-list` is now on the broker read list, so Tob searches without an approval card. It is an external read that changes nothing, takes no file input or `--out`, and queries the same public catalogue as `marketplace-detail` and `marketplace-avatar-list`, which were already reads. The search words do leave the Host, but the Marketplace page already sends them when the Human searches. Staging an install, installing, creating and importing all stay writes behind a card.

Why: with a card in front of the search, Tob would either skip it or ask the Human to approve a read before they saw any options. If an offline Host reported an empty catalogue, the Human would wrongly conclude that nothing suitable exists. Sending every path through the existing owners keeps one validation, one review and one receipt for each kind of Bot.

Enforced by: `tob-creation-candidates.test.ts` (the Tob-only creation guidance; `matches`, `no-matches` and `marketplace-unavailable` output; the search is a read and every install or creation is a write), `tob-cli-bot-create.test.ts` (custom creation writes the Soul and Core Memory, makes one DM and no grants, and the new Bot is not Tob), `marketplace-uploaded-bots.test.ts` (an install keeps the source Soul, makes one DM and no grants, and the new Bot is not Tob).

## 8. Tob cannot widen its own authority

<a id="tob-self-escalation"></a>
_Added for [#4830](https://github.com/BotHarness/DeepSeekBot/issues/4830) and the authorization report in [#4291](https://github.com/BotHarness/DeepSeekBot/issues/4291)._

The Host refuses, before any approval card, a Tob `cli` request that names Tob itself or Tob's Human DM (a DM whose only member is Tob) and whose parsed effects carry management authority or cannot be classified. That covers Tob's own Workspace Grants, Browser and Computer access, Approval Template, Bot mode, approval route and pending approvals, in any position or `--option=value` form. The refusal is `self-escalation-refused` with a sentence that sends the Human to Bot settings. The same command for another Bot the Human owns still goes to the ordinary card (§4). Reads of Tob and ordinary profile or Memory writes are unchanged.

`browser-profile-pair` and `browser-borrow-pair` print a one-time pairing code, and `browser-daily-grant` hands the page the Human selected in the Playwright extension to a Bot. Tob refuses all three as `cli-command-refused`: a pairing code is a credential, and the Daily Browser grant is the Human's consent in the extension. The Human CLI writes pairing codes only to a new private `--out` file. `browser-profile-forget`, `browser-daily-connect`, `browser-daily-return` and `browser-borrow-return` are ordinary writes behind the card.

Why: the card is the Human's decision on one exact command, but a Human approving "give Tob Full Access" in Tob's own DM is Tob building its own authorization out of conversation, which #4291 reports. Authority over Tob stays in Bot settings and the Human's own CLI. Narrowing commands such as `grant-revoke` or `tool-approval-rule-revoke` carry management authority too and are refused for Tob, which costs the Human one trip to settings.

Not covered, and still decided only by the ordinary card: commands that change something Tob shares with other Bots rather than Tob itself, such as editing the Approval Template Tob uses (`approval-template edit`), the global template or the default Bot mode, and `activity-allow-once` on an Activity item, whose id does not name a Bot. The Human sees the exact command on the card; refusing them would also block legitimate changes for every other Bot.

Enforced by: `tob-cli-self-escalation.property.test.ts` (any management or unclassified command that names Tob anywhere is refused; the same command for another Bot never is), `tob-cli-self-escalation.test.ts` (refusal before any card or run; another Bot's approval-template edit shows one card; Human-only Browser commands refused), `cli-browser-pairing.test.ts`.

## 9. A content read continues only on the target and history it started on

Tob reads a Channel's messages with `channel-messages` and a Bot's progress with `bot-activity`, the same broker reads the Human has; no parallel reader exists. Each page names its source in `provenance`: the Channel id, type, incarnation (the Channel record's `createdAt`), members and the revision the read started at, or the PersonaBot ID, incarnation (the Registry record's `createdAt`), activity generation and revision. `provenance.contentIsData` marks message bodies and session names as quoted data, never instructions or authority. A page is `complete`, or carries an opaque `nextCursor` that binds the target, its incarnation, the starting revision and the anchor (position and message id, or session offset).

The Channel owner checks a continuation in the Host method, so the Human CLI, the offline CLI and Tob share it. A cursor for another target, or a target deleted and recreated under the same id, is `changed-read-target`; a Channel revision below the cursor's, an anchor no longer at its position, a content purge accepted on the Channel since the first page, or any change to the Bot activity snapshot is `stale-read-revision`; a malformed cursor, or one whose fields no longer match its unkeyed digest, is `invalid-read-cursor`. The digest only catches accidental corruption; a hand-edited cursor can at most select another page of the same target and revision, which `--before` already allows, so authority stays with the positional target and these checks. Appends never invalidate a Channel cursor: the log is append-only, so positions below the anchor are stable. A page holds at most `--limit` messages (1 to 200) and stops early with `complete: false` so the whole serialized page, envelope and cursor included, fits in 64 KiB. The one exception is progress: a page returns at least one message whenever any remain, so a single message that does not fit in the space left after the envelope and cursor comes back alone, that one page can exceed 64 KiB, and the read still advances.

Why: the target id alone does not say which Channel or Bot it names once one is recreated, and a page that silently continued across a purge or a replaced target would merge two histories. The cursor's digest only detects corruption; it is not an authority. Tob's target authorization still runs on the positional target (§4), and a cursor can never select a different one.

Enforced by: `channel-read-continuation.test.ts` (appends keep continuation; a rewritten file history or a purge is stale; a recreated Channel or a cursor from Channel A used on B is a changed target; edited cursors are invalid; the byte cap continues from the last returned message), `tob-read-continuation.property.test.ts` (paging any append-interleaved history returns each first-page message exactly once, newest first), `bot-live-cli.test.ts`, `bot-offline-operations-cli.test.ts`, `bot-management-cli.test.ts` (Bot incarnation and snapshot revision), `tob-cli-host-commands.test.ts` (`--cursor` stays a broker read; foreign Bot DMs are still refused).

## 10. A Tob Assignment reads selected Bots' Memory through a read-only lease

<a id="tob-memory-lease"></a>
_New in #4827 (carries forward #2091)._

When the Human asks Tob to compare Bots, Tob's root Orchestrator issues a **Memory lease** with `assignment-memory-lease <assignment> <bot>… --operation-key <key>`. The Tob owner stores it in `tob_memory_leases`, bound to the accepted Human DM Source Events of that request, to one Tob-owned Assignment Session and to each target's incarnation (PersonaBot ID and creation time). Inside that Assignment, and only there, the native Shell runs `deepseekbot` through a lease broker that answers `memory-snapshot`, `memory-file`, `memory-history` and `memory-diff` for the leased targets and refuses everything else: Memory writes and file output as `lease-read-only`, other commands as `tob-authority-required`. The Assignment never sees management credentials or the Orchestrator's broker, and there is no approval path to escalate to.

Every read rechecks the lease, the Assignment (owned by Tob, not archived), the source request (still a Human message in Tob's DM, not purged and not ended) and the target (same incarnation, active, still owned by the Human). A failure refuses with `lease-unavailable`, `lease-expired`, `lease-source-revoked`, `lease-target-denied` (a Bot outside the lease, or one that changed owner) or `lease-target-unavailable` (replaced or archived); a refused target read is recorded. Each read records bounded provenance: Bot, kind, path, revision, size, SHA-256, truncation (bodies and diffs over 64 KiB are cut and marked), at most 200 reads per lease. `assignment-memory-leases` shows the lease state, per-Bot status (`read`, `unread`, `refused`) and an overall `complete` or `partial`; the same summary, with the files read per Bot and at most 1,200 characters, is appended to every later Assignment Report of that Assignment, also after the lease is revoked or expired, so a partial result stays visible. The lease is durable, so a resumed Assignment keeps reading and reporting; `assignment-memory-revoke` or archiving the Assignment ends it, and a same key with the same Assignment and Bots returns the existing lease (`lease-key-conflict` otherwise; one active lease per Assignment, `lease-exists`).

Issuing and revoking run without an approval card: the lease delegates only reads that Tob's Orchestrator already runs at once (§4), for its current request, so a card would add a click without protecting anything.

Why: the Assignment is where long comparisons belong, but giving it the Orchestrator's broker would hand an Assignment management authority, and copying Memory into its prompt would lose revision provenance. Binding the lease to the request, the Assignment and each target incarnation keeps the delegation as narrow as the Human's ask.

Enforced by: `tob-memory-lease.test.ts` (two-Bot comparison with provenance, write and out-of-lease refusal, archived and replaced targets, revoked lease, purged source, archived Assignment, resumed lease, idempotent key, the scoped CLI path through both brokers).

## 11. Managing the App is a grant

<a id="adr-0366"></a>
_Added for #5191 (grilling session of 2026-11-26); supersedes the Steward role of [ADR-0365](#adr-0365). Sections 1, 2, 4, 5, 8 and 10 are rewritten when #5193 ships._

**Managing the App is a grant**, resolved with the RBAC grant resolver (#5324, `packages/core/src/authorization/grants.ts`) like Browser and Computer access. The Owner turns it on for any of their Bots, for several at once or for none. There is no Steward role, no one-Steward invariant and no transfer.

- **Two switches.** "Manage the App" covers settings and models, maintenance, diagnostics, issue reports, Bot creation, Share Drafts, voice and Channels/Groups. "Manage other Bots" covers other Bots' profiles, editing their Memory and Memory leases. In code each is a set of CLI capability groups. The built-in Tob has both on; turning the grant on for another Bot leaves "Manage other Bots" off by default.
- **Where.** Bot settings, next to Browser and Computer access, on desktop, iOS and Android. The confirmation lists what the Bot will be able to do and that its writes follow its Approval Template. The CLI is `deepseekbot bot-grant <bot> manage-app|manage-bots on|off`, Human-only.
- **Authority source is unchanged.** The scoped CLI still runs only in the Bot's own accepted Human DM turn through the per-execution broker (Tob decisions §3, §6). A Group turn, external IM, another Bot or an Assignment never confers it. A Bot with the grant may be a Group member; in Group turns it is an ordinary member without the CLI. In its own Human DM it still cannot act as an ordinary Group member (`tob-cli-required`).
- **Approvals follow the Approval Template.** A CLI write is no longer always behind a card. It asks or runs according to the Bot's Approval Template and saved Always-allow rules, like any other tool. A fixed list always needs a fresh Human decision whatever the template says: deletion and archiving, editing another Bot's Memory, restoring a Profile Backup, and credential and pairing commands (pairing and the Daily Browser grant stay refused, as today).
- **Self-escalation guard, generalized.** A Bot with either grant cannot change the authority (Workspace Grants, Browser or Computer, Approval Template, mode, approval route, pending approvals) of any Bot that holds a management grant, including itself, and cannot turn a management grant on or off. Only the Human does, in Bot settings or their own CLI.
- **Fewer tools.** `bot_create` is removed from every Bot's direct tools; creating a Bot goes through the CLI and therefore needs "Manage the App". The `group_*` tools stay direct for every Bot, and the Tob-DM special case that disabled them is removed. On native Bots removing a rarely used tool is cheaper than deferring it through `tool_search` (measured in the instruction-set Mode thread, #5338).
- **Delegation is ordinary.** Every Bot can delegate through `bot_send_message`. Telemetry counts delegations started from any Bot's Human DM.
- **Prompt and cache.** A Bot with the grant gets one short line: for problems with the App, run `deepseekbot capabilities` and `doctor` first and use the CLI itself. The delegation half of the old `STEWARD_PROMPT` is dropped. Turning a grant on or off never edits a running Session's system prompt and never changes its tool list (Bots with and without the grant have the same tools). The Host appends a `[Host timeline]` marker to the Bot's Human DM instead, in the form of the model switch marker, stating that the Bot can or can no longer manage the App. The line moves into the system prompt at the Session's next compaction or in a new Session, when the prefix is rebuilt anyway.
- **Tob is an ordinary Bot.** Each new Profile still creates the built-in Tob with both grants on, as the first Bot the Human talks to and the one that helps configure the rest of the App after onboarding. It can be renamed, archived, deleted and shared to the Marketplace. Deleting or archiving the last Bot with "Manage the App" warns that no Bot will be able to manage the App until the Human turns the grant on for another.
- **Pinned tab.** It defaults to the built-in Tob's DM and falls back to the most recent conversation in Chats when Tob is gone. It is otherwise unrelated to the grant.
- **Team mode.** Only the Owner's Bots can hold a management grant for now. When the Owner changes, the former Owner's management grants are revoked and the new Owner's Tob gets both. A scoped grant for members' Bots is a separate issue. Importing a Bot never brings a grant.

Why: ADR-0365 made Steward a singleton role: exactly one Bot per Environment, moved by an atomic transfer. Reviewing it before #5206 merged (grilling session of 2026-11-26, #5191), the Human found that the singleton bought very little:

- The Pinned tab (#5195) can bind any conversation, so the phone no longer needs a special Bot to pin.
- Creating Bots and Groups and delegating to colleagues were never exclusive. Every Bot has `bot_create`, the `group_*` tools, `list_bot_contacts` and `bot_send_message`; only the Steward's DM blocked the direct tools (`TOB_CLI_ONLY_TOOLS`).
- What only the scoped CLI gives a Bot is managing the App by conversation: Host settings and models, maintenance, diagnostics (`doctor`, diagnostic logs, filing an issue), configuration that takes many steps in the GUI (such as remote connections), Share Drafts, voice and the long tail CLI parity adds. Then, separately, managing other Bots: their profiles, editing their Memory and Memory leases.
- Transfer, its revision swap, the two-sided markers and the automatic handover on a Team Owner change all existed only because the role was a singleton.

Rejected: - **The singleton Steward role of ADR-0365.** Its exclusivity protected nothing the per-turn source check, the guard and approvals do not already protect, and it cost a transfer flow, a swap table and Owner-change handover.

- **Removing the Bot's path to the CLI entirely.** Diagnosing and configuring the App by conversation, especially from the phone, is the main reason to have Tob.
- **Deferring `bot_create` and `group_*` behind `tool_search`.** On native Bots deferral cost more than it saved, because tool schemas are almost always cache hits.
- **Compacting when the grant changes.** A timeline marker keeps the cached prefix; a compaction loses context and costs a summarizing call.
- **Always showing a card for every CLI write.** These commands run because the Human asked for them; the Approval Template already expresses how much the Human wants to be asked.

Consequences: PR #5206 is closed. A new PR from main replaces Tob special-casing with grant checks, reusing #5206's call-site refactor, guard and deletion changes. The Approval Template change and the generalized guard are permission changes, so the M15 real-LLM security suite (#4197) runs before merge and gains cases for several grant holders, revocation and the fixed confirmation list. #5197 becomes the grant switch UI. #5198 is unchanged. Tob decisions §1, §2, §4, §5 and §8 and the glossary entries Tob, Steward Bot and Pinned tab are rewritten with the implementation; the term Steward is retired.

Enforced by: pending #5193 (grant resolution, generalized guard property test, toggle-keeps-tool-list test, M15 cases for several holders, revocation and the fixed confirmation list).
