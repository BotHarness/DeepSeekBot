# Host core architecture decisions

## Kernel/Contracts for Host results

[#5519](https://github.com/BotHarness/DeepSeekBot/issues/5519) puts shared bridge results, input validation, RPC error conversion, and protocol-only Session target selection in the [Kernel/Contracts tier](../../packages/core/src/kernel/). Features can use these helpers without loading bridge composition. Kernel owns the structural error-preview shape and a generic admin result. The Team-aware callers supply the metadata type. Invocation Human resolution stays in bridge composition because it needs authenticated connection and Team state.

**Enforced by** the [package boundary check](../../scripts/check-package-boundaries.mjs), which rejects runtime and type dependencies from Kernel/Contracts on other Host core modules, and the [Kernel contract tests](../../packages/core/test/kernel-contracts.test.ts).

## Feature contributions at Host composition

[#5520](https://github.com/BotHarness/DeepSeekBot/issues/5520) gives each migrated feature one descriptor for its bridge handlers, Typert methods, runtime hooks, Agent prompt sections, and tools. Composition builds the descriptor list and injects the runtime and Agent surfaces. Bridge assembly binds handlers to the invocation Human and applies the existing authorization. Typert registers the contributed method names while retaining each method's positional parameters and invocation receiver.

The RuntimeHost port registers sources of pending Bot Inbox work. The runtime owns readiness checks and subscription cleanup. Schedules supplies its database query and firing notifications through that port. Its Agent guidance stays inline in the Orchestrator role. GenUI contributes a named system prompt section and two tools. Both features keep their bridge handlers and RPC error conversion in the feature module.

For subsequent migrations, add the descriptor factory to the composition list and remove the matching legacy registration in the same change. Use the feature's own dependency types for its bridge and Agent adapter. Extend RuntimeHost when a feature needs a new capability from the runtime. The contract tests use the same descriptors as production.

Host plugin hooks run at the existing Cordis lifecycle stages. Cloud registers its tool and messaging provider at the same stages as their other Host registrations. Diagnostics registers routes and telemetry observers, and Usage binds parent turns and reconciles Session logs. Host composition constructs the shared resources those hooks consume.
