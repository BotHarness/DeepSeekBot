# Persistence, backup and usage decisions

How a Profile stores operational facts, moves recoverable data, and retains model usage. The [living architecture](../architecture/botharness-architecture.md) describes the integrated design, [Memory decisions](memory.md) cover per-Bot portability, and [Messaging decisions](messaging.md) cover message projections and their change log. Each section records the current decision, why it exists, and what enforces it. Git preserves the original ADRs.

## 1. One Operational Database per Profile

<a id="adr-0005"></a>
<a id="adr-0034"></a>
<a id="adr-0041"></a>

_Formerly ADR-0034 and ADR-0041. ADR-0005, which treated SQLite as an optional index, is retired._

The Operational Database Owner opens `$DSH_HOME/botharness/botharness.db` under a Profile Writer Lease. A competing Host fails closed with `profile-in-use`. The Registry, Roster, Session Ownership, Messaging, authorization, and other modules own their own tables and expose commands and queries. The owner supplies transactions and publishes notifications after commit. It stages database upgrades on a copy and activates the validated generation atomically.

Persona and Memory remain in user-owned files, attachment bytes belong to the Attachment owner, DSH owns Session events and credentials, and preferences shared with native Settings stay in DSH settings. The Host owns roster membership, order, pins and hidden Channels. The Client uses the roster bridge for those facts, the `ui-bot-mode` settings scope for sort preferences, and browser-local storage for collapsed sections. Legacy arrangement is imported only into an empty Host roster.

Why: Messaging and its related policies and effects need a common transaction boundary. A single database and Writer Lease give these modules one upgrade and recovery boundary without taking ownership of Memory or DSH state. Host-owned roster arrangement follows the Profile across clients, while collapsed sections are a local view preference.

Enforced by: [database owner tests](../../packages/core/test/operational-database.test.ts), [roster database tests](../../packages/core/test/roster-database.test.ts), and [legacy roster migration tests](../../packages/client/test/roster-migration.test.ts).

## 2. Named schema migrations and independent integrity checks

<a id="adr-0258"></a>
<a id="adr-0341"></a>

_Formerly ADR-0258 and ADR-0341._

An append-only plan assigns Schema Generation by the position of a stable migration ID. The owner records each ID in `schema_migrations` in the transaction that applies that step and validates the full applied prefix on open. Legacy Profiles through generation 153 acquire the ledger in staging. Missing, divergent or newer history fails with `upgrade-required`. Correct executable changes with a new migration and preserve the committed ID and body hashes. See the [migration workflow](../agents/schema-migrations.md).

A failed SQLite page integrity check puts the Profile in recovery mode. The owner reports the first integrity findings. Foreign key orphans left by outside writers produce a bounded diagnostic and can survive mount, backup, restore and forward migration. Operational writes enforce foreign keys. A migration fails without publishing the staged copy when any foreign key edge has more orphans than before it ran. The check compares per-edge counts, so it does not catch a migration that repairs one orphan and creates another on the same edge.

Why: stable names let parallel branches add migrations without reserving numbers, and the ledger catches divergent histories that share a generation number. A pre-existing orphan can leave a relationship incomplete while the database remains readable. Rejecting a rise in orphans keeps upgrades from making existing data worse.

Enforced by: [schema migration lint](../../scripts/check-schema-migrations.mjs), [schema ledger tests](../../packages/core/test/schema-migration-ledger.test.ts), and [integrity and orphan tests](../../packages/core/test/operational-database.test.ts).

## 3. Operational logs have a separate, disposable store

<a id="adr-0063"></a>

_Formerly ADR-0063._

The logging module owns the write connection to `$DSH_HOME/botharness/logs.db`. It keeps bounded, structured diagnostic evidence with owner scope and optional causation fields. The in-memory ring serves immediate reads and persistence supplies the durable tail. Retention runs on writes and caps the store at 50,000 rows and 30 days. An unusable store can rebuild empty without putting the Operational Database in recovery. Profile Backup excludes it. Owner scope (`profile-shared` or a Bot slug) is a read boundary only for surfaces that enforce it, such as viewer filtering; the database does not enforce it, and agent and Developer Mode reads ([ADR-0064](../adr/0064-agent-log-access-without-a-tool.md)) are outside it. Direct diagnostic readers use the [read-only log contract](../dev/guides/reading-operational-logs.md).

Why: diagnostics are high-volume and disposable. Keeping them in their own file avoids adding log traffic to operational writes and lets a Human export bounded evidence for support without sharing roster, Inbox or policy data.

Enforced by: [log database tests](../../packages/core/test/log-database.test.ts) and [retention tests](../../packages/core/test/log-retention.test.ts).

## 4. Profile Backup is a single, staged recovery package

<a id="adr-0042"></a>
<a id="adr-0257"></a>

_Formerly ADR-0042 and ADR-0257._

An explicit export writes one self-contained `.botharness-backup` containing a consistent Operational Database snapshot, Persona and Memory files, reachable managed Attachments, a Purge Ledger checkpoint, and a manifest with content hashes and non-secret dependencies. A Backup Barrier fixes the snapshot and its dependencies. Export checks space and verifies the staged package before publishing it. Package hashes establish internal consistency. The current format carries no producer signature, credentials, executable plugins or Workspace content. Native DSH Session export is reported as unsupported.

Preview, export, inspection and Managed Restore share one data contract. The reader supports historical v1 archives. New archives use v2 and record the Host and resolved DSH tools versions separately as provenance, with unknown values allowed. Exactly one required `runtime/core` declaration identifies a supported core contract. Restore validates the package and runs supported forward schema migration in staging, then activates it in a new, stopped environment. Unsupported archive format, newer schema, incompatible dependency contract and invalid package have distinct refusal codes. The current owner refuses an existing destination.

Why: one verified file gives the Human a portable recovery point without copying live WAL state or mixing records from two Profiles. Data compatibility follows the format and dependency contracts so a different producer release label cannot by itself make an archive unreadable.

Enforced by: [Profile Backup tests](../../packages/core/test/profile-backup.test.ts), including the [fixed v1 archive](../../packages/core/test/fixtures/profile-backup/legacy-v1.botharness-backup), a staged upgrade, a v2 round trip, and failure before publication.

## 5. Disaster Restore starts cold and requires target-local authorization

<a id="adr-0043"></a>
<a id="adr-0044"></a>

_Formerly ADR-0043 and ADR-0044._

Managed Restore preserves Bot identities and historical attribution. Native Session references become unavailable, restored provider bindings, bound Triggers and Service Grants stay suspended, and prior Sessions, Inbox work and Outbox effects do not replay. Issued requests with uncertain outcomes retain that uncertainty. Restore also suspends Workspace and persistent tool authorization and turns off Browser and Computer Access.

The target preserves Model Plans as desired configuration. The Human resolves an explicit route with a local credential, authorizes the current Plan revision and acknowledges the risk that the original Host could still be active. Explicit activation creates a fresh Orchestrator Session. Restored data remains readable while execution is blocked. The proposed source handoff and broader dependency-remapping workflow live in the [portability design](../proposals/profile-portability-ux.md#planned-move-and-disaster-recovery).

Why: possession of an archive proves neither that its source stopped nor that the destination has permission to resume work. Separating data recovery from target-local authority preserves history while preventing copied grants, stale work and an unreviewed model route from taking effect.

Enforced by: [cold restore and suspended effects tests](../../packages/core/test/profile-backup.test.ts) and [restored Bot model tests](../../packages/core/test/profile-restore-model-change.test.ts).

## 6. Content Purge carries durable selectors across restore

<a id="adr-0146"></a>

_Formerly ADR-0146._

The Purge Ledger accepts Source Event identities and reviewed managed-file selectors before removing content. The Attachment owner rechecks retained references and preserves shared files. Pending content-dependent effects are cancelled and redacted. Issued effects settle under the Outbox outcome rules, retaining audit and outcome evidence. Clients receive post-commit placement selectors so they can redact cached and late-arriving data.

The purge barrier holds through the full checkpoint callback. Restore validates the checkpoint, unions it with destination facts where present and applies the result before Messaging mounts. Checkpoint v2 retains managed-file selectors and also reads v1 text checkpoints. A standalone archive carries only the purge facts known when it was made. Human-owned Memory, Workspace and exported copies remain outside managed cleanup.

Why: a purge must survive an interrupted cleanup or the restoration of older operational data. Recording reviewed identities outside the operational snapshot lets the owner delete exactly the intended managed content even when the original database references have disappeared.

Enforced by: [purge tests](../../packages/core/test/content-purge.test.ts) and [checkpoint, file cleanup and recovery tests](../../packages/core/test/content-purge-completion.test.ts).

## 7. Model Presets are local templates and Bot plans are snapshots

<a id="adr-0019"></a>
<a id="adr-0020"></a>
<a id="adr-0027"></a>
<a id="adr-0040"></a>
<a id="adr-0093"></a>

_Formerly ADR-0027 and ADR-0093. ADR-0019, ADR-0020 and ADR-0040 are retired._

Applying a Model Preset copies its choices into an independent PersonaBot Model Plan. Profile Backup carries plans without credentials. Sharing a [Memory repository](memory.md#adr-0002) or [Bot Zip](../adr/0135-a-bot-moves-between-people-as-a-zip-of-its-memory-files.md) leaves model choice with the recipient. SoulSnapshot, the hosted Soul registry and the per-Bot PersonaBot Export are retired. Whole-Profile recovery uses the package described above.

New Orchestrator turns and Assignment requests resolve their choices under the current plan and the Host's execution checks. An existing Assignment keeps its retained route until an authorized switch. A plan may fix only the Orchestrator and inherit the Profile's Assignment policy. Open Assignment mode admits additional catalog routes subject to role and credential checks. Presets and plans can reference a [Routing Group](../adr/0355-model-fallback-is-host-owned-at-step-boundaries.md) by ID, so edits to that group's membership can take effect at request boundaries without changing the applied preset snapshot.

Why: each Host has its own available providers, budget and credentials. Copying the template protects existing Bots from unrelated preset edits while preserving the Human's ability to manage a deliberately shared Routing Group.

Enforced by: [preset persistence tests](../../packages/core/test/model-preset-database.test.ts), [Routing Group preset tests](../../packages/core/test/model-preset-groups.test.ts), [open Assignment tests](../../packages/core/test/open-assignment-models.test.ts), and [backup round trips](../../packages/core/test/profile-backup.test.ts).

## 8. The Usage Projection retains observed model usage

<a id="adr-0094"></a>
<a id="adr-0204"></a>

_Formerly ADR-0094 and ADR-0204._

DSH SessionEvents supply per-attempt usage, including reported usage from retries and failures. The Usage Projection aggregates by Host-local day, PersonaBot, execution role and actual provider/model, excluding unowned Sessions and inherited copies of events. An aggregate increment and its HMAC-backed deduplication receipt commit together. Ordinary Session deletion and missing history preserve retained usage. Bot archive preserves it, while Bot Purge removes identifiable usage and prevents late evidence from repopulating it.

A reported total is usable if it covers the sum of known buckets. It fills one missing bucket with the remainder, or fills several with zero if the known buckets already exhaust the total. Otherwise the missing buckets stay unknown. A missing total stays unknown. Previously folded requests are not reinterpreted. Public queries use the same filters for the selected chart interval and for the separate all-time total.

Why: an ordinary Session deletion should not rewrite a Human's usage history. Provider totals can settle genuine omissions without guessing how an ambiguous remainder divides between buckets.

Enforced by: [usage attribution tests](../../packages/core/test/usage-attribution.test.ts), [retention tests](../../packages/core/test/usage-retention.test.ts), [query tests](../../packages/core/test/usage-filter-query.test.ts), and the [usage bucket property test](../../packages/core/test/usage-buckets.property.test.ts).

## 9. Token telemetry reports bounded, replaceable snapshots

<a id="adr-0344"></a>

_Formerly ADR-0344._

The Host checks hourly after initial reconciliation and sends changed anonymous daily snapshots from the same Usage Projection, covering today and the six preceding Host-local days. It skips reads during rebuild and when telemetry is disabled. Snapshots preserve reported lower bounds and partial/reconciled flags, omit unknown exact buckets, and carry no Bot, Session, provider or model identifiers. The UTC-midnight timestamp encodes the Host-local date label. Analytics must select the latest whole snapshot per anonymous installation and day before aggregating, so corrected or omitted values replace their previous values.

Why: reusing local accounting keeps attribution, deduplication and unknown usage consistent. The seven-day window bounds volume and limits corrections, and replacing snapshots tolerates restart and reconciliation without counting a day twice.

Enforced by: [token telemetry tests](../../packages/core/test/token-telemetry.test.ts). See the [analytics query contract](../token-telemetry.md).
