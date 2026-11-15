# ADR-0343: IM settings project saved configuration before live checks

- Status: Accepted
- Date: 2026-11-15
- Issue: [#4247](https://github.com/BotHarness/DeepSeekBot/issues/4247)

## Context

External identity and connector settings are local Operational Database records, but the
existing snapshot waits for all app/setup discovery, binding inspection and grant inspection.
One delayed Provider can therefore hold configuration display, and unrelated Providers also
participate. A local controlled reproduction measured three same-account inspections per read.
Changing the storage engine would not remove that dependency.

## Decision

The existing application-defined snapshot and Channel Bridge query owners accept two explicit
read modes, while an omitted mode preserves full discovery for existing callers:

- `saved` reads persisted configuration and canonical process-local reception facts without
  Provider inspection or discovery. It marks checks pending and does not grant capabilities.
- `status` checks only the selected Bot's bound accounts and grants, marks checks complete,
  and does not enumerate unrelated apps or setup descriptors. Account inspection promises
  are shared only within this request and current Provider registration token.

The internal Provider `inspect` contract optionally accepts the account already checked by
this request. DSH IM and Cloud implementations reuse it while still inspecting each target;
write/send callers omit it and keep fresh verification. Before returning the aggregate, the
snapshot invalidates accounts and capabilities from registrations replaced during another
Provider's slower check. A superseded Client read cannot publish either data or an error.

The Client publishes saved configuration first, then fresh status. Pending verification is
visible and must not be presented as verified availability. Binding a new app still explicitly
requests full discovery. Existing lifecycle notifications invalidate in-flight Client reads;
sequence guards reject stale responses. Client state is scoped to the Host/Human action owner,
not a global Bot slug. No retry timer, durable verification cache or polling loop is added.

Mutations and sends keep fresh Owner, fingerprint, revision, capability and route checks.
Saved projection is presentation data, never authorization. Both modes are reachable through
the same authenticated Host methods and CLI commands using `--read-mode saved|status`.

## Consequences

Configuration can appear while a Provider is slow or unavailable. Status remains explicit and
can fail independently without discarding the saved configuration. Request-local coalescing
does not retain credentials or permit stale checks across later requests or Provider replacement.
Full discovery remains slower by design when the Human explicitly opens app binding.

The default full snapshot remains compatible. Old Clients continue to use that path. The
progressive Client expects a Host supporting these query modes; no authorization fallback or
second source of configuration is introduced.
