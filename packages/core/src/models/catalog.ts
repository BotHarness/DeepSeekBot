import { ReasoningEffortId, type LlmRuntime } from '@deepseek-ai/dsh-llm';

import type { ProviderCredentialHealth, ProviderCredentialFailure } from './credential-health.js';
import type { ModelRoute } from './presets.js';

export interface ModelCatalogEntry {
  provider: string;
  providerName: string;
  model: string;
  modelName: string;
  efforts: { id: string; name: string }[];
  defaultEffort?: string;
  credential?: ProviderCredentialFailure;
}

export interface ModelCatalog {
  list(): Promise<ModelCatalogEntry[]>;
  validate(route: ModelRoute): Promise<void>;
  defaultRoute?(): ModelRoute | undefined;
}

function displayName(name: string | undefined, id: string): string {
  return typeof name === 'string' && name.trim() !== '' ? name : id;
}

export function createModelCatalog(
  llm: Pick<LlmRuntime, 'listProviders' | 'listModels' | 'resolveModelInfo' | 'resolveCallConfig'>,
  options: {
    credentials?: Pick<ProviderCredentialHealth, 'failure'>;
    defaultRoute?: () => ModelRoute | undefined;
    credentialReadiness?: () => (
      provider: string,
    ) => Promise<ProviderCredentialFailure | undefined>;
  } = {},
): ModelCatalog {
  return {
    ...(options.defaultRoute === undefined ? {} : { defaultRoute: options.defaultRoute }),
    async list() {
      const providers = llm.listProviders();
      const credentialFailure = options.credentialReadiness?.();
      const groups = await Promise.all(
        providers.map(async (provider) => {
          const models = await llm.listModels(provider.id);
          const credential =
            options.credentials?.failure(provider.id) ?? (await credentialFailure?.(provider.id));
          return Promise.all(
            models.map(async (model): Promise<ModelCatalogEntry> => {
              const exact = await llm.resolveModelInfo(provider.id, model.id);
              return {
                provider: provider.id,
                providerName: displayName(provider.name, provider.id),
                model: model.id,
                modelName: displayName(model.name, model.id),
                efforts: (exact.reasoning?.efforts ?? []).map((effort) => ({
                  id: effort.id,
                  name: effort.name,
                })),
                ...(exact.reasoning?.defaultEffort === undefined
                  ? {}
                  : { defaultEffort: exact.reasoning.defaultEffort }),
                ...(credential === undefined ? {} : { credential }),
              };
            }),
          );
        }),
      );
      return groups.flat();
    },
    async validate(route) {
      if (route.provider.trim() !== route.provider || route.model.trim() !== route.model) {
        throw new Error('Invalid model route');
      }
      const provider = llm.listProviders().find((candidate) => candidate.id === route.provider);
      if (provider === undefined) throw new Error(`Provider ${route.provider} is unavailable`);
      const credential =
        options.credentials?.failure(route.provider) ??
        (await options.credentialReadiness?.()(route.provider));
      if (credential !== undefined) {
        throw new Error(
          `Provider ${route.provider} has ${credential === 'missing' ? 'no' : 'an invalid'} API key; configure it in DSH model settings first`,
        );
      }
      const models = await llm.listModels(route.provider);
      if (!models.some((candidate) => candidate.id === route.model)) {
        throw new Error(`Model ${route.provider}/${route.model} is unavailable`);
      }
      await llm.resolveCallConfig({
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }),
      });
    },
  };
}

export function groupEfforts(
  routes: readonly Pick<ModelRoute, 'provider' | 'model'>[],
  entries: readonly ModelCatalogEntry[],
): string[] {
  const lists = routes
    .map((route) =>
      (
        entries.find((entry) => entry.provider === route.provider && entry.model === route.model)
          ?.efforts ?? []
      )
        .map((effort) => effort.id)
        .filter((id) => id !== ''),
    )
    .filter((list) => list.length > 0);
  const [first, ...rest] = lists;
  return (first ?? []).filter((id) => rest.every((list) => list.includes(id)));
}

export function groupMemberRoute(
  route: ModelRoute,
  effort: string | undefined,
  entries: readonly ModelCatalogEntry[],
): ModelRoute {
  if (route.reasoningEffort !== undefined || effort === undefined || effort === '') return route;
  const entry = entries.find(
    (item) => item.provider === route.provider && item.model === route.model,
  );
  return entry?.efforts.some((item) => item.id === effort)
    ? { ...route, reasoningEffort: effort }
    : route;
}
