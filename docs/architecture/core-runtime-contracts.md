# Core runtime contracts

This note keeps the implementation constraints that were formerly explained beside Core declarations. The [living architecture](botharness-architecture.md) and linked ADRs remain the authority for product design.

## PersonaBot identity and Memory

- Creating a PersonaBot requires its Git-backed Memory Repository. The registry refuses creation when that repository cannot be prepared; it does not expose a partly executable identity. Opening an existing repository leaves provisional working-tree edits untouched. See [Memory ADRs](../decisions/memory.md#adr-0002) and [Persona ownership](../decisions/memory.md#adr-0014).
- A DSH Session's PersonaBot owner comes from the recorded ownership relation. The current directory, Workspace membership, and selected Client view cannot supply a fallback owner. The first prompt assembly persists the current persona bytes for that Session. Ordinary later turns reuse those bytes; a compaction boundary is the sanctioned refresh point, and an unchanged file does not churn the snapshot. See [ADR-0024](../adr/0024-orchestrator-session-per-personabot.md).

## Channel and roster authority

- A pending Group invitation identifies the invitee's Bot incarnation. Recreating a Bot with the same visible identity does not inherit an old invitation. Only the intended invitee can accept it; acceptance adds membership in the owning Channel store. The Human can cancel an invitation or remove a joined member. See [ADR-0073](../adr/0073-group-membership-is-invitation-first-with-auto-accept.md).
- Roster sections use Host-generated IDs and one storage-domain order/pin authority. Writes that do not change placement must not create an extra durable revision. See the [roster implementation](../../packages/core/src/roster/) and [living architecture](botharness-architecture.md).

## Host integration and diagnostics

- The Host bridge registers a Typert remote binding in Cordis so the API Gateway discovers `botharness/<method>` endpoints. It must load even in a Profile without a Web connection. The current build pipeline cannot transform the decorator syntax, so registration uses the descriptor directly. See [ADR-0022](../adr/0022-dsh-config-and-manifest-conformance.md), [ADR-0023](../adr/0023-client-bridge-is-rpc-not-cordis.md), and the [bridge guide](../client-bridge.md).
- `logs.db` is a separate, disposable developer-evidence store. Corruption or an unsupported generation rebuilds it empty without blocking Host boot; it is not an authority or backup source. Causation fields attribute a row independently from read scope. The operational-logs skill is visible only when Human-owned Developer mode is on. See [ADR-0063](../adr/0063-operational-log-database.md) and [ADR-0064](../adr/0064-agent-log-access-without-a-tool.md).
