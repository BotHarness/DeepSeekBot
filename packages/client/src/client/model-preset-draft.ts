import type { ModelPlanGroupsView, ModelPlanView, ModelRouteView } from './bridge.js';
import { groupMenuId, groupMenuKey } from './model-menu.js';

export function routeLabel(route: ModelRouteView, defaultLabel: string): string {
  return `${route.model} · ${route.reasoningEffort ?? defaultLabel}`;
}

export const modelKey = (route: Pick<ModelRouteView, 'provider' | 'model'>): string =>
  JSON.stringify([route.provider, route.model]);

export function routeOfKey(key: string, effort: string): ModelRouteView {
  const [provider, model] = JSON.parse(key) as [string, string];
  return {
    provider,
    model,
    ...(effort === '' ? {} : { reasoningEffort: effort }),
  };
}

export interface ModelChoice {
  key: string;
  effort: string;
}

export interface ModelDraft {
  orchestrator: ModelChoice;
  presetId: string;
}

export function draftOf(
  source: Partial<Pick<ModelPlanView, 'orchestrator'>> &
    Pick<ModelPlanGroupsView, 'orchestratorGroupId' | 'orchestratorGroupEffort'>,
  presetId: string,
): ModelDraft {
  return {
    orchestrator:
      source.orchestratorGroupId === undefined
        ? {
            key: source.orchestrator === undefined ? '' : modelKey(source.orchestrator),
            effort: source.orchestrator?.reasoningEffort ?? '',
          }
        : {
            key: groupMenuKey(source.orchestratorGroupId),
            effort: source.orchestratorGroupEffort ?? '',
          },
    presetId,
  };
}

export interface MainParts {
  orchestrator?: ModelRouteView;
  orchestratorGroupId: string | null;
  orchestratorGroupEffort: string | null;
}

export function mainParts(draft: Pick<ModelDraft, 'orchestrator'>): MainParts | undefined {
  const { key, effort } = draft.orchestrator;
  if (key === '') return undefined;
  const group = groupMenuId(key);
  if (group !== undefined)
    return {
      orchestratorGroupId: group,
      orchestratorGroupEffort: effort === '' ? null : effort,
    };
  return {
    orchestrator: routeOfKey(key, effort),
    orchestratorGroupId: null,
    orchestratorGroupEffort: null,
  };
}
