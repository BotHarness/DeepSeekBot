import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ModelCatalog } from './catalog.js';
import type { ModelRoute, PersonaBotModelPlan } from './presets.js';

export interface ModelRouteRepair {
  code: 'legacy-ambiguous' | 'legacy-missing' | 'route-unavailable';
  message: string;
  legacyModel?: string;
}

export interface ModelPlanState {
  revision?: number;
  plan?: PersonaBotModelPlan;
  repair?: ModelRouteRepair;
}

export interface ModelRouteReadiness {
  inspect(slug: string): Promise<ModelPlanState>;
  prepare(
    slug: string,
    role: 'orchestrator' | 'assignment',
    retainedRoute?: ModelRoute,
  ): Promise<void>;
}

function repairMessage(route: ModelRoute, failure: unknown): string {
  const detail = failure instanceof Error ? failure.message : String(failure);
  return `Model route ${route.provider}/${route.model}${route.reasoningEffort === undefined ? '' : ` (${route.reasoningEffort})`} cannot run: ${detail.slice(0, 500)}. Open PersonaBot Profile and select an available Model Preset or repair the DSH provider.`;
}

export function createModelRouteReadiness(
  registry: Pick<PersonaBotRegistry, 'get' | 'migrateLegacyModel'>,
  catalog: ModelCatalog,
): ModelRouteReadiness {
  const migrate = async (slug: string): Promise<ModelPlanState> => {
    const bot = registry.get(slug);
    if (bot === undefined) throw new Error('PersonaBot was not found');
    if (bot.modelPlan !== undefined) return { plan: bot.modelPlan };
    if (bot.model === undefined) return {};
    const legacyModel = bot.model;
    const matches = (await catalog.list()).filter((entry) => entry.model === legacyModel);
    if (matches.length !== 1) {
      return {
        repair: {
          code: matches.length === 0 ? 'legacy-missing' : 'legacy-ambiguous',
          legacyModel,
          message: `Legacy model ${legacyModel} ${matches.length === 0 ? 'has no available provider' : 'matches multiple providers'}. Open PersonaBot Profile and select a Model Preset before sending another request.`,
        },
      };
    }
    const route: ModelRoute = { provider: matches[0]!.provider, model: legacyModel };
    try {
      await catalog.validate(route);
    } catch (failure) {
      return {
        repair: { code: 'route-unavailable', legacyModel, message: repairMessage(route, failure) },
      };
    }
    const result = registry.migrateLegacyModel(slug, legacyModel, route);
    if (!result.ok) throw new Error('PersonaBot model changed; reopen Profile before retrying');
    return result.record.modelPlan === undefined ? {} : { plan: result.record.modelPlan };
  };
  return {
    async inspect(slug) {
      const state = await migrate(slug);
      if (state.plan === undefined) return state;
      for (const route of [state.plan.orchestrator, state.plan.assignmentDefault]) {
        if (route === undefined) continue;
        try {
          await catalog.validate(route);
        } catch (failure) {
          return {
            ...state,
            repair: { code: 'route-unavailable', message: repairMessage(route, failure) },
          };
        }
      }
      return state;
    },
    async prepare(slug, role, retainedRoute) {
      const state = await migrate(slug);
      if (state.repair !== undefined) throw new Error(state.repair.message);
      const route = role === 'assignment' ? retainedRoute : state.plan?.orchestrator;
      if (route === undefined) return;
      try {
        await catalog.validate(route);
      } catch (failure) {
        throw new Error(repairMessage(route, failure), { cause: failure });
      }
    },
  };
}
