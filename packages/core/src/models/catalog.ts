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
  /**
   * `recheck` ignores credential failures observed on earlier Turns, so a Turn re-checks a
   * credential the Human may have fixed outside DSH instead of being refused by the cache.
   */
  validate(route: ModelRoute, options?: { recheck?: boolean }): Promise<void>;
  defaultRoute?(): ModelRoute | undefined;
}

export function createModelCatalog(
  llm: Pick<LlmRuntime, 'listProviders' | 'listModels' | 'resolveModelInfo' | 'resolveCallConfig'>,
  options: {
    credentials?: Pick<ProviderCredentialHealth, 'failure'>;
    defaultRoute?: () => ModelRoute | undefined;
    credentialFailure?: (provider: string) => Promise<ProviderCredentialFailure | undefined>;
  } = {},
): ModelCatalog {
  return {
    ...(options.defaultRoute === undefined ? {} : { defaultRoute: options.defaultRoute }),
    async list() {
      const providers = llm.listProviders();
      const groups = await Promise.all(
        providers.map(async (provider) => {
          const models = await llm.listModels(provider.id);
          const credential =
            options.credentials?.failure(provider.id) ??
            (await options.credentialFailure?.(provider.id));
          return Promise.all(
            models.map(async (model): Promise<ModelCatalogEntry> => {
              const exact = await llm.resolveModelInfo(provider.id, model.id);
              return {
                provider: provider.id,
                providerName: provider.name,
                model: model.id,
                modelName: model.name,
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
    async validate(route, validation = {}) {
      if (route.provider.trim() !== route.provider || route.model.trim() !== route.model) {
        throw new Error('Invalid model route');
      }
      const provider = llm.listProviders().find((candidate) => candidate.id === route.provider);
      if (provider === undefined) throw new Error(`Provider ${route.provider} is unavailable`);
      const credential =
        (validation.recheck === true ? undefined : options.credentials?.failure(route.provider)) ??
        (await options.credentialFailure?.(route.provider));
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
