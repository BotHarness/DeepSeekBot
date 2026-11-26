# Host core architecture decisions

## Team Policy and administration

[#5522](https://github.com/BotHarness/DeepSeekBot/issues/5522) puts the Host permission catalog, Channel access contracts and decisions, PersonaBot ownership rules, and Team errors in Domain's [Team Policy](../../packages/core/src/team-policy/). The policy evaluates supplied facts and may depend on Kernel contracts. The [Team services](../../packages/core/src/team/) read those facts from the Operational Database and coordinate mutations with the owning modules. They retain the audit writes and transaction boundaries.

The [Team feature](../../packages/core/src/features/team/) adapts the services to HTTP, device sign-in and Typert, projects PersonaBot metadata, and exposes Workspace administration. The [Environments feature](../../packages/core/src/features/environments/) mounts Team alongside the device gateway. Devices, PersonaBots, Channels, and Workspaces can use Team Policy directly.

The [package boundary check](../../scripts/check-package-boundaries.mjs) enforces Team Policy's allowed core imports. The [isolated policy tests](../../packages/core/test/team-policy.test.ts) exercise permission and Channel decisions using plain inputs.

## Kernel/Contracts for Host results

[#5519](https://github.com/BotHarness/DeepSeekBot/issues/5519) puts shared bridge results, input validation, RPC error conversion, and protocol-only Session target selection in the [Kernel/Contracts tier](../../packages/core/src/kernel/). Features can use these helpers without loading bridge composition. Kernel owns the structural error-preview shape and a generic admin result. The Team-aware callers supply the metadata type. Invocation Human resolution stays in bridge composition because it needs authenticated connection and Team state.

**Enforced by** the [package boundary check](../../scripts/check-package-boundaries.mjs), which rejects runtime and type dependencies from Kernel/Contracts on other Host core modules, and the [Kernel contract tests](../../packages/core/test/kernel-contracts.test.ts).

## Feature contributions at Host composition

[#5520](https://github.com/BotHarness/DeepSeekBot/issues/5520) gives each migrated feature one descriptor for its bridge handlers, Typert methods, runtime hooks, Agent prompt sections, and tools. Composition builds the descriptor list and injects the runtime and Agent surfaces. Bridge assembly binds handlers to the invocation Human and applies the existing authorization. Typert registers the contributed method names while retaining each method's positional parameters and invocation receiver.

The RuntimeHost port registers sources of pending Bot Inbox work. The runtime owns readiness checks and subscription cleanup. Schedules supplies its database query and firing notifications through that port. Its Agent guidance stays inline in the Orchestrator role. GenUI contributes a named system prompt section and two tools. Both features keep their bridge handlers and RPC error conversion in the feature module.

For subsequent migrations, add the descriptor factory to the composition list and remove the matching legacy registration in the same change. Use the feature's own dependency types for its bridge and Agent adapter. Extend RuntimeHost when a feature needs a new capability from the runtime. The contract tests use the same descriptors as production.
