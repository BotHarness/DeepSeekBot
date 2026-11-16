# Model selection is local; shared Bots stay model-agnostic

> Terms updated by [ADR-0134](../decisions/memory.md#adr-0134): SoulSnapshot is historical. The rule now applies to the shared Memory Git repository (ADR-0131). Profile Backup keeps Model Plans but never credentials (ADR-0093, #505).

ADR-0093 extends this deployment-local choice into reusable Model Presets and per-PersonaBot applied snapshots. The single-model override described below is the original baseline, not the current target configuration shape; the export boundary remains in force.

A PersonaBot's model choice is deployment-local: a global default with an optional per-PersonaBot override, resolved at activation. It is not part of the persona or memory, and it never travels in a SoulSnapshot (ADR-0020): an imported bot runs on the importer's own model, provider, and credentials. Model selection must not ride along with a shared bot because recipients have different providers, budgets, and availability, and because a frozen model string would rot faster than the identity it rides on.

## Considered Options

- **Bundle the model (and provider) in the snapshot** — rejected: it turns a portable identity into a stale, provider-locked one.
- **Bundle an allowed model range** — rejected: adds policy language to the manifest for no proven need; the importer's global default is the right answer.
- **Per-PersonaBot only, no global default** — rejected: manual repetition for every new bot.

## Consequences

- The BotHarness operational database keeps the per-bot override for local use; PersonaBot exports drop it (ADR-0041).
- Snapshot manifests must not grow model or credential fields; import prompts the importer to pick a model (default: the global setting).
- Memory stays per-PersonaBot (ADR-0002/0013); a user-level shared memory layer (Grok-Bot style) remains an open question, not part of this decision.
