# Model providers

## Sources

- `packages/core/src/features/models/plugin.ts`
- `packages/client/src/client/model-providers-settings.tsx`
- `packages/client/src/client/bot-intro.tsx`
- `packages/core/src/models/providers.ts`
- `packages/client/src/client/subscription-accounts.tsx`
- `packages/core/src/engines/engine-account-bridge.ts`
- `packages/core/src/engines/engine-host-accounts.ts`
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
- Add, rename and remove Codex and Claude Code accounts. Each row shows the account’s sign-in and observed quota. The model picker and Routing Groups show the named account, and Model Presets can retain the account for either role.
- During Claude Code sign-in, the account row accepts a browser authorization code. The Host forwards it to that account’s running process when it requests a code.
- `deepseekbot engine login-cancel <account-id>` stops pending sign-in and lets the same account start again as soon as the command returns.
- `deepseekbot engine quota <account-id> --refresh` reads subscription quota in that account's own home. The Host stores separate five-hour and weekly windows and exposes the sign-in email only to callers with `modelSources.manage`.
- The onboarding Model step shows configured providers beside the picker. A fresh Profile can add a key inline and see the same three results before the picker appears.
- In Team mode, the API key list names which Host Roles can use each provider when the viewer can read roles. The role editor has a whole-provider checkbox and a disclosure button for exact models.

## How to get to it (user POV)

Open Bot Settings, then Model providers. Add an API key provider, enter its name and key, and select Save. After viewing the three outcomes, open a Bot DM and choose a model route from the new provider.

## Driving it with verify-app

Launch a fresh isolated Profile with `--no-ax-model --no-deepseek-secret` and run `doctor`. Seed the first OpenCode Go route through `deepseekbot model-provider-add` using its key from stdin. Set the global default to `opencode-go/deepseek-v4.1-flash`. Add a second OpenCode Go provider through the UI, then use `deepseekbot model-providers` to verify both routes and their redacted key status. Send one DM on each route and check the actual Session request route. Capture Chinese light and dark screenshots at 1280 × 860 with the provider rows, save outcomes and unified picker.

Try renaming the second provider and removing it at a stale revision. Put the route in a Routing Group and confirm removal is refused. Run M15 scenario C3 and open Bot Settings as a member without `modelSources.manage` to verify that the entry is absent.

For named subscriptions, run `deepseekbot engine accounts`, add a second account using the observed revision, rename it, and verify a stale rename is refused. Select it with `deepseekbot engine use <bot> claude --role orchestrator --account <id>` and verify removal reports that Bot. Open Model providers and the Add account dialog. With a model-list fixture, open the Bot's model settings and verify the picker shows both account choices. For manual sign-in, start a fake `claude` process that prints an HTTPS URL and prompts for a code on stdin. Click Sign in on the named Claude Code account, verify its code field appears, then submit a synthetic code and verify the waiting process receives it. Repeat through `deepseekbot engine login claude --account <id> --code-stdin`. Capture the subscription rows, Add account dialog and sign-in state in Chinese light and dark at 1280 × 860. Real OAuth, subscription model turns and quota reports require Human verification on an isolated Profile.

For sign-in cancellation, put fake `codex` and `claude` executables on the isolated Host's PATH. Have them bind a loopback callback port before printing a fixture sign-in URL and reuse that port on retry. Run `deepseekbot engine login <account-id>` and confirm a second login returns `engine-account-busy`. Cancel with `deepseekbot engine login-cancel <account-id>` and expect `{"cancelled":true}`. Immediately retry login and confirm the same port binds again. Cancel the retry and run cancel once more to verify `{"cancelled":false}`. Start a fresh login, then call `engine login-cancel` as a member without `modelSources.manage`: it must return `permission-required`, and a second owner login must still return `engine-account-busy` because the fresh login stays pending. Cancel it as the owner to finish.

For quota, run `engine quota <account-id> --refresh --json` and check the remaining percentage, ISO reset and source for each reported window. Repeat within 30 seconds and check that `observedAt` stays the same. With an unreported window, expect it to be absent. Use `engine accounts --grantable` as a member with an account grant to confirm cached quota is visible and the email field is absent. The same member must receive `permission-required` from `--refresh` and `engineAccountQuotaRefresh`. A quota-limited Bot DM shows the account name and reset on its localized Turn Stop notice.

For Host Role grants, create two roles with `deepseekbot roles create --name <name> --permissions models.use,bots.createPrivate --model-providers <provider-id>`. Create an active member with only each role. In Team settings, open a role, expand a provider and confirm the provider checkbox selects and locks every model under it. A template provider's model list can't be extended from the UI, so `packages/core/test/team-provider-grants.test.ts` covers a model added after the grant. Read the provider rows as Owner. Sign in as each member, check the Bot model picker, send a DM using the allowed provider, and try setting the other provider with `model-plan-customize`. Confirm the Host returns `model-not-allowed` and the plan is unchanged. Run M15 C2 for the effective grants and member catalog.

For onboarding, launch another fresh Profile with `--no-ax-model --no-deepseek-secret`. Enter Bot mode and open step 3. Choose Enter an API key, add OpenCode Go and check the three outcomes. Close the save summary and verify the picker appears in the same step. Choose the model and effort, click Next and read `deepseekbot model-catalog` to verify the persisted default. Finish onboarding and get a reply in Tob's DM. In a separate Profile with a configured key, step 3 should open at the picker. Open Model providers from the row, close Bot Settings and check that onboarding returns to step 3. The subscription route uses the existing engine sign-in and saves the selected engine for Tob on a local Host. A remote Host shows the existing local-only message.

## Gotchas

- The AX launcher’s command-line overlay owns `llm-pi-ai` when enabled. DSH Settings refuses writes to that namespace. Use a writable isolated Profile for these journeys.
- A listed model and stored credential do not establish a successful reply. The three results are reported independently.
