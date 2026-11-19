# Model providers

## Sources

- `packages/client/src/client/model-providers-settings.tsx`
- `packages/core/src/models/providers.ts`
- `packages/client/src/client/subscription-accounts.tsx`
- `packages/core/src/engines/engine-account-bridge.ts`
- `packages/host-client/src/shared/model-brand.ts`
- `scripts/e2e-team-security.mjs`
- `scripts/team-security-model-provider-gate.mjs`

## Terms

- Settings
- Host Permission
- Model Choice
- Routing Group
- Model Preset

## Sub-features

- Bot Settings puts Model providers above Models & execution for the Host Owner and Humans with `modelSources.manage`.
- Adding or replacing an API key reports key storage, model count and a bounded reply on the exact provider route. Two keys for the same service each have their own route and credential reference.
- List and edit show a masked key and the provider logo. Removal checks the Settings revision and references from the default model, Routing Groups, Model Presets and Bots.
- Each Codex account and the single Claude Code account show their current sign-in state. Add, rename and remove Codex accounts here. The model picker shows the account name when multiple Codex accounts are configured.

## How to get to it (user POV)

Open Bot Settings, then Model providers. Add an API key provider, enter its name and key, and select Save. After viewing the three outcomes, open a Bot DM and choose a model route from the new provider.

## Driving it with verify-app

Launch a fresh isolated Profile with `--no-ax-model --no-deepseek-secret` and run `doctor`. Seed the first OpenCode Go route through `deepseekbot model-provider-add` using its key from stdin. Set the global default to `opencode-go/deepseek-v4.1-flash`. Add a second OpenCode Go provider through the UI, then use `deepseekbot model-providers` to verify both routes and their redacted key status. Send one DM on each route and check the actual Session request route. Capture Chinese light and dark screenshots at 1280 × 860 with the provider rows, save outcomes and unified picker.

Try renaming the second provider and removing it at a stale revision. Put the route in a Routing Group and confirm removal is refused. Run M15 scenario C3 and open Bot Settings as a member without `modelSources.manage` to verify that the entry is absent.

For named subscriptions, run `deepseekbot engine accounts`, add a second Codex account using the observed revision, rename it, and verify a stale rename is refused. Select the account for a Bot with `deepseekbot engine use <bot> codex --role orchestrator --account <id>` and verify removal reports that Bot. Open Model providers and the Add account dialog. With a local model-list fixture, open the Bot's model settings and verify the Codex picker row includes the named account. Capture those three states in Chinese light and dark at 1280 × 860. Use the official login only with a Human on the isolated Profile. The fixture establishes UI and account routing for catalog lookup, while real Codex OAuth, model turns and quota reports require a signed-in subscription.

## Gotchas

- The AX launcher’s command-line overlay owns `llm-pi-ai` when enabled. DSH Settings refuses writes to that namespace. Use a writable isolated Profile for these journeys.
- A listed model and stored credential do not establish a successful reply. The three results are reported independently.
