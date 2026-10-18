# ADR-0223: Tob is a protected local PersonaBot behind a global Home

- Status: Accepted
- Date: 2026-10-18
- Related: [#2081](https://github.com/BotHarness/DeepSeekBot/issues/2081), [#2082](https://github.com/BotHarness/DeepSeekBot/issues/2082), ADR-0221, ADR-0222

## Context

Home needs a calm cross-Bot entry point and a conversation that can manage local settings. Giving an ordinary named Bot blanket Host credentials would make editable persona files or imported content a source of administrative authority. A second Home conversation would duplicate Channel history and lose the existing approval path.

## Decision

Home is an application-defined global Dock panel. It sends through the existing authenticated Human Channel command to one ordinary DM belonging to the protected Tob identity. Messages and its Channel workspace render that same history. Home is not a Channel, Session, or second conversation store.

Schema Generation 96 reserves one local Tob identity before provisioning its canonical PersonaBot, Git Memory, native Workspace grant and Human DM. Interrupted provisioning resumes the reservation. A once-only system welcome has a typed Tob presentation. Existing ordinary DeepSeek Bots keep their IDs and history. Deletion and archiving refuse at the Host owner; editable Soul/Memory and names cannot confer Tob authority. Revoked Workspace grants are not silently recreated.

The first capability reads and changes only `botharness-client.assignmentConcurrencyLimit` (integer 1–32, global to the current Profile). Native Settings owns values, revisions and persistence. Existing approval owns review and execution guards. Tob's root Orchestrator must carry an accepted canonical Human message from its private DM; Group, external IM, Bot sources, Assignment Sessions and fabricated identities do not grant management authority. Read and write recheck provenance, and writes bind the reviewed previous value, target and revision. A stale or uncertain write refuses; reconciliation reads the authority. The existing live scheduler continues to enforce new admissions without stopping active work.

The initial dedicated management Tool path is replaced by the scoped native Shell → DeepSeekBot CLI path in [ADR-0224](0224-tob-management-uses-scoped-native-shell-cli.md). The protected identity, accepted Human DM, native Settings owner and approval boundaries above remain. Human settings administration retains its separate authenticated CLI contract.

Home model setup writes the native Host default. Tob inherits it unless explicitly customized; other independent Bot plans remain unchanged. Drafts and a submission ID stay Client-local; retries reuse the ID and reload never sends automatically. Home uses one canonical Human Attention query, not a new inbox or model-generated dashboard.

Layout v8 preserves the v7 split tree and geometry, appends the Home control without forcing it open, and retains the raw pre-upgrade document. Fresh Clients open Home first. Invalid/future documents are not overwritten, and failed persistence is visible. Home gets a stable command ID; existing custom/disabled bindings and legacy Work migration remain native shortcut concerns. The default is primary+Alt+Shift+H, except Desktop Linux uses O because the native validator reserves H there.

## Consequences

Home can grow dashboard and creation functions without introducing a new Bot lifecycle. T1 deliberately excludes Marketplace search, importing, arbitrary settings administration and Group/IM management. Persistent local privilege is not portable Memory content.

Reverting the Client requires restoring the saved pre-v8 layout; new Home geometry is not representable by the previous Client. The database generation is forward-only and requires the existing Profile backup/recovery workflow for downgrade. Web model/approval evidence and actual macOS validation are separate release gates.
