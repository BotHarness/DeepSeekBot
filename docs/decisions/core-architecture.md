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

Schedules starts its store after Core assembly and registers disposal between the Bot Runtime and Channel live hub. GenUI resolves the image writer at preview time, preferring the current Agent's attachment service and falling back to the Host service when needed.

For subsequent migrations, add the descriptor factory to the composition list and remove the matching legacy registration in the same change. Use the feature's own dependency types for its bridge and Agent adapter. Extend RuntimeHost when a feature needs a new capability from the runtime. The contract tests use the same descriptors as production.

Host plugin hooks run at the existing Cordis lifecycle stages. Cloud registers its tool and messaging provider at the same stages as their other Host registrations. Diagnostics registers routes and telemetry observers, and Usage binds parent turns and reconciles Session logs. Host composition constructs the shared resources those hooks consume.

Appearance contributes the Window Companion live stream in a separate descriptor table. Typert marks these entries as streams and still injects the abort signal after the positional request arguments.

Environments mounts device pairing before the after-Environments hooks. Takeover registers Handoff recovery, disposal, and Orchestrator Tools after Team confinement. Voice registers its Call route between the desktop routes and Channel live route.

Channels contributes the live stream and its authorization projection while Channel Files contributes the attachment routes. Messaging contributes startup and provider hooks and binds connection-specific Tools and guidance at the existing connection boundary. The Agent composition uses named positions for these Tools and prompt fragments so their registration order and rendered text stay stable.

Memory contributes its Engine tools, routes and Orchestrator prompt fragments. Workspaces contributes startup relocation, folder browsing, permission tracking and the favicon route. Approvals contributes Host handlers and the private-input RPCs. Runtime receives the Memory event and Approval input factories from the registered descriptors, creates them at their existing points in startup and supplies the callbacks they use to coordinate Inbox work.

Models, PersonaBots and Tob contribute bridge handlers, Runtime services and Host hooks. Models installs the Engine route and retry handler and provides the Assignment model tool. Tob owns the Agent shell setup and supplies its hooks to the PersonaBot Agent adapter. Workspaces contributes the Grant and Session tools at their existing positions. PersonaBots and Activity register their streams before the Channel and Window Companion streams.

Sessions, Activity and Assignments contribute bridge methods and Runtime services. Sessions keeps the routing between native and PersonaBot Sessions inside its bridge adapter. Activity and Assignments supply Inbox tools, coordination prompts and Assignment Agent reporting at their existing positions.

Team contributes its bridge methods, Typert handlers, startup and confinement hooks, and speaker policy guidance and tool. The bridge collects unary RPCs and streams from the descriptor list. Invocation authentication and the Human and Channel guards still run at the bridge boundary. A synthetic descriptor test supplies one list to real bridge, Runtime and Agent assembly and exercises each contributed surface.

Release contributes installer and restarter registration. Profile Storage applies pending resets before other Profile hooks, starts attachment maintenance after Core initializes, and registers Profile Backup routes before Diagnostics routes. Marketplace registers Bot ZIP routes after Diagnostics routes. Host composition supplies the shared services used by these hooks.

Connectors contributes Host setup for the account store, OAuth callback and Agent tools. Composio calls use the current Account Grants at dispatch. A write in any part of a batch requires a Human decision on the whole call, with approval bound to the input and current account access.

## Google Workspace connector custody

The Connectors feature owns the Google OAuth bridge, callback and Agent Tool registrations. It reuses the DSH web server's connector callback on a loopback origin, giving the Owner's Web OAuth client one exact authorized redirect without starting another listener. The Google code exchange uses a single-use state and an S256 PKCE verifier held in Host memory. The service saves the client secret and account refresh tokens through the DSH Credentials Provider. The existing Connector Account row carries the Google subject, displayed identity and consent level. Each Bot's grant remains independent of Google consent. [#5334](https://github.com/BotHarness/DeepSeekBot/issues/5334)

The first sign-in requests read scopes. An Owner-granted Write authorizes the Host to request write scopes at the next sign-in. The intersection of the signed-in access and each Bot's grant determines available tools. The Host rechecks that access and Channel Tool Approval before each provider write. The Connectors descriptor declares direct CLI tool coverage through the native Agent port, so CLI and model calls share registration, grant checks, and execution. [Google Workspace CLI guide](../bot-cli.md#app-connections-google-workspace-with-your-oauth-client)

## CLI adapters and PersonaBot protection

[#5524](https://github.com/BotHarness/DeepSeekBot/issues/5524) puts command dispatch and adapters in [the CLI module](../../packages/core/src/cli/). Online commands call the existing Host bridge through Host Client. The [offline Profile bridge](../../packages/core/src/bridge/cli-offline.ts) opens the established owners for commands that support offline Profiles. Kernel owns CLI parsing, request schemas, and effect declarations shared with the Tob feature. The Tob feature binds typed commands and exact-argv dispatch to its existing source checks, approvals, and Host owners.

The PersonaBot record carries its lifecycle and presentation policy. The Registry preserves explicit display-name and avatar customizations when the policy asks it to, and the deletion owner refuses confirmation for a protected identity. Tob sets both policies when it creates its identity. The migration backfills the current Owner's existing Tob, and Owner transfer expires policies tied to the outgoing tenure in the same transaction that clears the identity. The protected Tob identity cannot be deleted during that tenure. This supersedes the deletion provision for built-in Tob in [ADR-0314](tob.md#adr-0314).

## Same-layer dependency cycles

[#5637](https://github.com/BotHarness/DeepSeekBot/issues/5637) measures runtime imports between Host core modules. Each immediate directory and source file under `features/` is a module. Runtime is a single module.

For a same-layer edge A → B, a path from B back to A puts both modules in the same strongly connected component. The checker keeps a per-file count of all such edges so a new cyclic import fails even if the existing feedback edge would still break the cycle. To find a cut for each component, it considers previously retained edges first and previous feedback edges last. Within each group it considers larger import counts first, with lexical edge order breaking ties. It keeps an edge when the retained graph can accept it without forming a cycle. The skipped edges form the feedback set. Unrelated edges cannot change a component's cut, and deleting dependencies cannot force the checker to choose a new feedback edge.

The first run against the legacy `peerCycles` baseline measures the base commit's source with the new rules. Future runs use the recorded counts. The checker rejects growth and requires `node scripts/check-package-boundaries.mjs --update` to record a reduction.

## Runtime imports and Feature Contributions

[#5638](https://github.com/BotHarness/DeepSeekBot/issues/5638) removes runtime dependencies from Runtime to Features. Runtime assembly calls the services supplied through Feature Contributions. Activity and Assignment consumers read their queries from the owning features. Kernel owns the direct tool error shared by Runtime and Features, and Prompts owns the reply transport reminder used in both native and Engine turns. Runtime owns the Session busy result and Assignment concurrency default. Type-only references to Feature port signatures are erased by the compiler.
