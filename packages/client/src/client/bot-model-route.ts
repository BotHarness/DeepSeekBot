import type { BridgeActions } from './actions.js';
import type {
  ModelCatalogView,
  ModelPlanStateView,
  ModelPlanView,
  ModelRouteView,
} from './bridge.js';
import { rememberModelPlan } from './model-plan-store.js';

export interface BotModelChoice {
  label: string;
  route: ModelRouteView;
  current: boolean;
}

export interface BotModelGroup {
  key: string;
  label: string;
  provider: string;
  model: string;
  current: boolean;
  efforts: BotModelChoice[];
}

function matches(filter: string, ...values: (string | undefined)[]): boolean {
  const query = filter.toLowerCase();
  if (query.length === 0) return true;
  return values.some((value) => (value ?? '').toLowerCase().includes(query));
}

export function botModelMenuGroups(
  current: ModelRouteView | undefined,
  catalog: ModelCatalogView | undefined,
  defaultEffortLabel: string,
): BotModelGroup[] {
  const groups = (catalog?.models ?? [])
    .filter((entry) => entry.credential === undefined)
    .map((entry) => {
      const efforts = [{ id: '', name: defaultEffortLabel }, ...entry.efforts];
      return {
        key: JSON.stringify([entry.provider, entry.model]),
        label: entry.modelName,
        provider: entry.provider,
        model: entry.model,
        current: current?.provider === entry.provider && current.model === entry.model,
        efforts: efforts.map((effort) => ({
          label: effort.name,
          route: {
            provider: entry.provider,
            model: entry.model,
            ...(effort.id === '' ? {} : { reasoningEffort: effort.id }),
          },
          current:
            current?.provider === entry.provider &&
            current.model === entry.model &&
            (current.reasoningEffort ?? '') === effort.id,
        })),
      };
    });
  return groups.sort((one, other) => Number(other.current) - Number(one.current));
}

export function botModelChoices(
  current: ModelRouteView | undefined,
  catalog: ModelCatalogView | undefined,
  defaultEffortLabel: string,
  filter: string,
): BotModelChoice[] {
  return botModelMenuGroups(current, catalog, defaultEffortLabel)
    .filter((group) => matches(filter, group.label, group.model, group.provider))
    .map((group) => ({
      label: group.label,
      route:
        group.efforts.find(
          (effort) => (effort.route.reasoningEffort ?? '') === (current?.reasoningEffort ?? ''),
        )?.route ?? group.efforts[0]!.route,
      current: group.current,
    }));
}

export function botEffortChoices(
  current: ModelRouteView | undefined,
  catalog: ModelCatalogView | undefined,
  defaultEffortLabel: string,
  filter: string,
): BotModelChoice[] {
  const group = botModelMenuGroups(current, catalog, defaultEffortLabel).find(
    (candidate) => candidate.current,
  );
  if (group === undefined) return [];
  return group.efforts.filter((effort) =>
    matches(filter, effort.label, effort.route.reasoningEffort),
  );
}

export function applyBotModelRoute(
  actions: Pick<BridgeActions, 'customizeModelPlan' | 'setModelPlan'>,
  slug: string,
  state: ModelPlanStateView,
  route: ModelRouteView,
): Promise<ModelPlanView> {
  const request =
    state.plan !== undefined
      ? actions.customizeModelPlan(slug, route)
      : actions.setModelPlan(slug, state.revision ?? 0, route, route, [
          {
            provider: route.provider,
            model: route.model,
            allowedEfforts: [route.reasoningEffort ?? ''],
            defaultEffort: route.reasoningEffort ?? '',
          },
        ]);
  return request.then((plan) => {
    rememberModelPlan(slug, plan);
    return plan;
  });
}
