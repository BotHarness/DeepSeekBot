import type {
  AssignmentGroupOptionView,
  AssignmentModelOptionView,
  ModelCatalogEntryView,
  ModelCatalogGroupView,
  ModelPlanGroupsView,
  ModelPlanView,
  ModelRouteView,
} from './bridge.js';
import { modelCatalogGroupFront } from '@botharness/host-client/model-catalog';
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
  assignment: ModelChoice;
  allowed: AssignmentModelOptionView[];
  groups: AssignmentGroupOptionView[];
  advanced: boolean;
  open: boolean;
  presetId: string;
  fallback?: ModelRouteView | undefined;
}

export function allowedOf(
  assignmentDefault: ModelRouteView | undefined,
  assignmentModels: readonly AssignmentModelOptionView[] | undefined,
): AssignmentModelOptionView[] {
  if (assignmentDefault === undefined) return [];
  return (
    assignmentModels ?? [
      {
        provider: assignmentDefault.provider,
        model: assignmentDefault.model,
        allowedEfforts: [assignmentDefault.reasoningEffort ?? ''],
        defaultEffort: assignmentDefault.reasoningEffort ?? '',
      },
    ]
  ).map((option) => ({
    ...option,
    allowedEfforts: [...option.allowedEfforts],
  }));
}

export function draftOf(
  source: Partial<
    Pick<
      ModelPlanView,
      'orchestrator' | 'assignmentDefault' | 'assignmentModels' | 'openAssignmentModels'
    >
  > &
    ModelPlanGroupsView,
  presetId: string,
): ModelDraft {
  const defaultGroup = source.assignmentDefaultGroupId;
  const groups = (source.assignmentGroups ?? []).map((group) => ({
    ...(source.assignmentGroupOptions?.find((option) => option.group === group) ?? { group }),
  }));
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
    assignment:
      defaultGroup === undefined
        ? {
            key: source.assignmentDefault === undefined ? '' : modelKey(source.assignmentDefault),
            effort: source.assignmentDefault?.reasoningEffort ?? '',
          }
        : {
            key: groupMenuKey(defaultGroup),
            effort: groups.find((option) => option.group === defaultGroup)?.defaultEffort ?? '',
          },
    allowed: allowedOf(source.assignmentDefault, source.assignmentModels),
    groups,
    advanced:
      (source.assignmentModels?.length ?? 1) > 1 ||
      source.assignmentModels?.some(
        (option) => option.note !== undefined || option.allowedEfforts.length > 1,
      ) === true ||
      groups.length > (defaultGroup === undefined ? 0 : 1) ||
      groups.some(
        (option) =>
          option.note !== undefined ||
          (option.allowedEfforts !== undefined &&
            (option.group !== defaultGroup || option.allowedEfforts.length > 1)),
      ),
    open: source.openAssignmentModels === true,
    presetId,
    fallback: source.assignmentDefault,
  };
}

export function withNote(
  option: AssignmentModelOptionView,
  note: string | undefined,
): AssignmentModelOptionView {
  const { note: _previous, ...rest } = option;
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? rest : { ...rest, note: trimmed };
}

export function assignmentChoice(draft: ModelDraft): ModelChoice {
  if (!draft.advanced) return draft.assignment;
  const group = groupMenuId(draft.assignment.key);
  if (group !== undefined)
    return {
      key: draft.assignment.key,
      effort: draft.groups.find((option) => option.group === group)?.defaultEffort ?? '',
    };
  const option = draft.allowed.find((item) => modelKey(item) === draft.assignment.key);
  return {
    key: draft.assignment.key,
    effort: option?.defaultEffort ?? draft.assignment.effort,
  };
}

export function assignmentRoute(draft: ModelDraft): ModelRouteView {
  const { key, effort } = assignmentChoice(draft);
  return routeOfKey(key, effort);
}

export function finalAllowed(draft: ModelDraft): AssignmentModelOptionView[] {
  if (draft.advanced) return draft.allowed.map((option) => withNote(option, option.note));
  const {
    provider,
    model,
    reasoningEffort = '',
  } = routeOfKey(draft.assignment.key, draft.assignment.effort);
  return [
    {
      provider,
      model,
      allowedEfforts: [reasoningEffort],
      defaultEffort: reasoningEffort,
    },
  ];
}

export function groupOptionOf(
  option: AssignmentGroupOptionView,
): AssignmentGroupOptionView | undefined {
  const note = option.note?.trim() ?? '';
  const efforts = option.allowedEfforts ?? [];
  const ranged =
    efforts.length === 0
      ? {}
      : {
          allowedEfforts: efforts,
          defaultEffort:
            option.defaultEffort !== undefined && efforts.includes(option.defaultEffort)
              ? option.defaultEffort
              : efforts[0]!,
        };
  if (note === '' && efforts.length === 0) return undefined;
  return { group: option.group, ...ranged, ...(note === '' ? {} : { note }) };
}

export function frontRoute(
  groups: readonly ModelCatalogGroupView[],
  id: string,
  catalog: readonly ModelCatalogEntryView[] = [],
): ModelRouteView | undefined {
  const group = groups.find((item) => item.id === id);
  if (group === undefined || group.routes.length === 0) return undefined;
  const route = modelCatalogGroupFront(group, [...catalog]);
  return { provider: route.provider, model: route.model };
}

export interface PlanParts {
  orchestrator: ModelRouteView;
  assignmentDefault: ModelRouteView;
  assignmentModels: AssignmentModelOptionView[];
  groups?: ModelPlanGroupsView;
}

export function planParts(
  draft: ModelDraft,
  catalogGroups: readonly ModelCatalogGroupView[],
  catalog: readonly ModelCatalogEntryView[] = [],
): PlanParts | undefined {
  const orchestratorGroupId = groupMenuId(draft.orchestrator.key);
  const orchestrator =
    orchestratorGroupId === undefined
      ? routeOfKey(draft.orchestrator.key, draft.orchestrator.effort)
      : frontRoute(catalogGroups, orchestratorGroupId, catalog);
  if (orchestrator === undefined) return undefined;
  const defaultGroupId = groupMenuId(draft.assignment.key);
  let assignmentDefault: ModelRouteView;
  let assignmentModels: AssignmentModelOptionView[];
  if (defaultGroupId === undefined) {
    assignmentDefault = assignmentRoute(draft);
    assignmentModels = finalAllowed(draft);
  } else {
    const listed = draft.allowed.map((option) => withNote(option, option.note));
    const { fallback } = draft;
    const kept =
      fallback === undefined
        ? undefined
        : listed.find((option) => modelKey(option) === modelKey(fallback));
    const first = kept ?? listed[0];
    const front = frontRoute(catalogGroups, defaultGroupId, catalog);
    if (first !== undefined) {
      const effort =
        kept !== undefined && first.allowedEfforts.includes(fallback?.reasoningEffort ?? '')
          ? (fallback?.reasoningEffort ?? '')
          : first.defaultEffort;
      assignmentModels = listed;
      assignmentDefault = {
        provider: first.provider,
        model: first.model,
        ...(effort === '' ? {} : { reasoningEffort: effort }),
      };
    } else if (front !== undefined) {
      assignmentModels = [{ ...front, allowedEfforts: [''], defaultEffort: '' }];
      assignmentDefault = front;
    } else return undefined;
  }
  const ids = draft.advanced ? draft.groups.map((option) => option.group) : [];
  if (defaultGroupId !== undefined && !ids.includes(defaultGroupId)) ids.unshift(defaultGroupId);
  const options = draft.advanced
    ? draft.groups.flatMap((option) => groupOptionOf(option) ?? [])
    : defaultGroupId === undefined || draft.assignment.effort === ''
      ? []
      : [
          {
            group: defaultGroupId,
            allowedEfforts: [draft.assignment.effort],
            defaultEffort: draft.assignment.effort,
          },
        ];
  return {
    orchestrator,
    assignmentDefault,
    assignmentModels,
    ...(orchestratorGroupId === undefined && ids.length === 0
      ? {}
      : {
          groups: {
            ...(orchestratorGroupId === undefined ? {} : { orchestratorGroupId }),
            ...(orchestratorGroupId === undefined || draft.orchestrator.effort === ''
              ? {}
              : { orchestratorGroupEffort: draft.orchestrator.effort }),
            assignmentGroups: ids,
            ...(defaultGroupId === undefined ? {} : { assignmentDefaultGroupId: defaultGroupId }),
            assignmentGroupOptions: options,
          },
        }),
  };
}

export function trailing(
  draft: ModelDraft,
  parts: PlanParts,
): [open?: true | undefined, groups?: ModelPlanGroupsView] {
  if (parts.groups === undefined) return draft.open ? [true] : [];
  return [draft.open || undefined, parts.groups];
}

export function withAdvanced(draft: ModelDraft, advanced: boolean): ModelDraft {
  if (!advanced) return { ...draft, advanced, assignment: assignmentChoice(draft) };
  const { key, effort } = draft.assignment;
  const group = groupMenuId(key);
  if (group !== undefined) {
    const current = draft.groups.find((option) => option.group === group) ?? { group };
    const { allowedEfforts: allowed = [], defaultEffort: _default, ...rest } = current;
    const next =
      effort === ''
        ? rest
        : {
            ...current,
            allowedEfforts: allowed.includes(effort) ? allowed : [...allowed, effort],
            defaultEffort: effort,
          };
    return {
      ...draft,
      advanced,
      groups: draft.groups.some((option) => option.group === group)
        ? draft.groups.map((option) => (option.group === group ? next : option))
        : [next, ...draft.groups],
    };
  }
  const existing = draft.allowed.find((option) => modelKey(option) === key);
  const route = routeOfKey(key, effort);
  const allowed =
    existing === undefined
      ? [
          {
            provider: route.provider,
            model: route.model,
            allowedEfforts: [effort],
            defaultEffort: effort,
          },
          ...draft.allowed,
        ]
      : draft.allowed.map((option) =>
          modelKey(option) === key
            ? {
                ...option,
                allowedEfforts: option.allowedEfforts.includes(effort)
                  ? option.allowedEfforts
                  : [...option.allowedEfforts, effort],
                defaultEffort: effort,
              }
            : option,
        );
  return { ...draft, advanced, allowed };
}
