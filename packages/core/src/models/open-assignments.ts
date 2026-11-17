import type { ModelCatalog } from './catalog.js';
import { isListedAssignmentRoute, type ModelRoute, type PersonaBotModelPlan } from './presets.js';

export interface OpenAssignmentModel {
  provider: string;
  providerName: string;
  model: string;
  modelName: string;
  efforts: string[];
  defaultEffort?: string;
}

export interface OpenAssignmentRoutes {
  list(slug: string): Promise<OpenAssignmentModel[]>;
  require(slug: string, route: ModelRoute): Promise<void>;
}

export function createOpenAssignmentRoutes(options: {
  catalog: Pick<ModelCatalog, 'list' | 'validate'>;
  plan: (slug: string) => PersonaBotModelPlan | undefined;
  requireAllowed: (slug: string, route: ModelRoute) => void;
}): OpenAssignmentRoutes {
  const allowed = (slug: string, route: ModelRoute): boolean => {
    try {
      options.requireAllowed(slug, route);
      return true;
    } catch {
      return false;
    }
  };
  return {
    async list(slug) {
      if (options.plan(slug)?.openAssignmentModels !== true) return [];
      const entries = await options.catalog.list();
      return entries
        .filter((entry) => entry.credential === undefined && allowed(slug, entry))
        .map((entry) => ({
          provider: entry.provider,
          providerName: entry.providerName,
          model: entry.model,
          modelName: entry.modelName,
          efforts: entry.efforts.map((effort) => effort.id),
          ...(entry.defaultEffort === undefined ? {} : { defaultEffort: entry.defaultEffort }),
        }));
    },
    async require(slug, route) {
      const plan = options.plan(slug);
      if (plan?.openAssignmentModels !== true || isListedAssignmentRoute(plan, route)) return;
      options.requireAllowed(slug, route);
      await options.catalog.validate(route);
    },
  };
}
