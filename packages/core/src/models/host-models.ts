import type { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { createModelCatalog } from './catalog.js';
import { createProviderCredentialHealth } from './credential-health.js';
import { createCredentialReadiness } from './credential-readiness.js';
import type { ModelPresetStore, ModelRoute } from './presets.js';
import {
  createModelProviders,
  setOpenCodeGoSessionHeader,
  testProviderReply,
} from './providers.js';
import type { RouteRests } from './route-rest.js';
import type { RoutingGroupStore } from './routing-groups.js';

export function createHostModelCatalog(
  ctx: Context,
  options: {
    defaultRoute(): ModelRoute;
    signalProviderChange(): void;
  },
) {
  const providerCredentials = createProviderCredentialHealth();
  ctx.on(
    'llm-pi-ai/request-headers',
    (request, _initial, next) => {
      const headers = next();
      setOpenCodeGoSessionHeader(request, headers);
      return headers;
    },
    { global: true },
  );

  const refreshProviders = () => {
    providerCredentials.reset();
    options.signalProviderChange();
  };
  ctx.on('credentials/reference-updated', refreshProviders);
  ctx.on('credentials/record-updated', refreshProviders);
  ctx.on('settings/document-updated', refreshProviders);
  ctx.on('llm/adapters-updated', refreshProviders);
  const modelCatalog = createModelCatalog(ctx.llm, {
    credentials: providerCredentials,
    credentialReadiness: createCredentialReadiness({
      providers: () => ctx.llm.listConfigurableProviders(),
      settings: () => ctx.get('settings')?.describe({ redactSecrets: true }) ?? [],
      describe: async (ref) => {
        const credentials = ctx.get('credentials');
        if (!credentials) throw new Error('Native credentials service is unavailable');
        return credentials.describe(credentialRef(ref));
      },
    }),
    defaultRoute: () => {
      const selection = options.defaultRoute();
      return {
        provider: selection.provider,
        model: selection.model,
        ...(selection.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: selection.reasoningEffort }),
      };
    },
  });
  return { modelCatalog, providerCredentials };
}

export function createHostModelProviders(
  ctx: Context,
  options: {
    registry: Pick<PersonaBotRegistry, 'list'>;
    routingGroups: RoutingGroupStore;
    modelPresets: ModelPresetStore;
    defaultRoute(): ModelRoute;
    routeRests: Pick<RouteRests, 'list'>;
  },
) {
  const nativeSettings = ctx.get('settings');
  const nativeCredentials = ctx.get('credentials');
  return nativeSettings && nativeCredentials
    ? createModelProviders({
        settings: nativeSettings,
        credentials: nativeCredentials,
        directory: () => ctx.llm.listConfigurableProviders(),
        activeProviders: () => ctx.llm.listProviders(),
        models: (id) => ctx.llm.listModels(id),
        rests: () => options.routeRests.list(),
        uses: (id) => {
          const applies = (
            plan:
              | {
                  orchestrator?: { provider: string };
                  assignmentDefault?: { provider: string };
                  assignmentModels?: readonly { provider: string }[];
                }
              | undefined,
          ) =>
            plan?.orchestrator?.provider === id ||
            plan?.assignmentDefault?.provider === id ||
            plan?.assignmentModels?.some((model) => model.provider === id) === true;
          return [
            ...(options.defaultRoute().provider === id ? ['default-model'] : []),
            ...(options.routingGroups
              .list()
              .some(({ members }) =>
                members.some((member) => member.kind === 'model' && member.provider === id),
              )
              ? ['routing-group']
              : []),
            ...(options.modelPresets.list().some(applies) ? ['model-preset'] : []),
            ...(options.registry
              .list()
              .some((bot) => applies(bot.modelPlan) || bot.model?.startsWith(id + '/') === true)
              ? ['bot']
              : []),
          ];
        },
        probe: (id, model) =>
          testProviderReply(ctx.llm, id, model, (outcome) => {
            ctx.logger.info('model-provider-probe outcome=%s', outcome);
          }),
      })
    : undefined;
}
