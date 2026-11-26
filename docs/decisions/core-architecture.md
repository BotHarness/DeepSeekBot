# Host core architecture decisions

## Kernel/Contracts for Host results

[#5519](https://github.com/BotHarness/DeepSeekBot/issues/5519) puts shared bridge results, input validation, RPC error conversion, and protocol-only Session target selection in the [Kernel/Contracts tier](../../packages/core/src/kernel/). Features can use these helpers without loading bridge composition. Kernel owns the structural error-preview shape and a generic admin result. The Team-aware callers supply the metadata type. Invocation Human resolution stays in bridge composition because it needs authenticated connection and Team state.

**Enforced by** the [package boundary check](../../scripts/check-package-boundaries.mjs), which rejects runtime and type dependencies from Kernel/Contracts on other Host core modules, and the [Kernel contract tests](../../packages/core/test/kernel-contracts.test.ts).
