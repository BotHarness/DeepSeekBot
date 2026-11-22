import { isEngineId } from '../engines/engine-session.js';
import type { RoutingTarget } from './routing-groups.js';
import type { ModelPreset, ModelPresetEngine, ModelRoute, PersonaBotModelPlan } from './presets.js';

export interface AssignmentModelOption {
  provider: string;
  model: string;
  allowedEfforts: string[];
  defaultEffort: string;
  note?: string;
}

export const ASSIGNMENT_MODEL_NOTE_MAX = 500;

export interface AssignmentGroupOption {
  group: string;
  allowedEfforts?: string[];
  defaultEffort?: string;
  note?: string;
}

export type PresetSubChoice =
  | ({ kind: 'model' } & AssignmentModelOption)
  | ({ kind: 'group' } & AssignmentGroupOption)
  | PresetSubEngineChoice;

export type PresetSubEngineSelection = { kind: 'engine' } & Omit<ModelPresetEngine, 'effort'>;
export type PresetSubEngineChoice = { kind: 'engine'; note?: string } & ModelPresetEngine;

export type PresetSubSelection =
  | { kind: 'model'; provider: string; model: string }
  | { kind: 'group'; group: string }
  | PresetSubEngineSelection;

export interface PresetSub {
  choices: PresetSubChoice[];
  default: PresetSubSelection | null;
}

export function isPresetSubEngineSelection(value: unknown): value is PresetSubEngineSelection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'engine' &&
    'engine' in value &&
    isEngineId(value.engine) &&
    (!('accountId' in value) || value.accountId === undefined || nonBlank(value.accountId)) &&
    (!('model' in value) || value.model === undefined || nonBlank(value.model))
  );
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function subChoiceKey(selection: PresetSubSelection): string {
  switch (selection.kind) {
    case 'group':
      return JSON.stringify(['group', selection.group]);
    case 'model':
      return JSON.stringify(['model', selection.provider, selection.model]);
    case 'engine':
      return JSON.stringify(['engine', selection.engine, selection.accountId, selection.model]);
  }
}

export function matchesPresetSubChoice(choice: PresetSubSelection, selection: PresetSubSelection) {
  switch (selection.kind) {
    case 'group':
      return choice.kind === 'group' && choice.group === selection.group;
    case 'model':
      return (
        choice.kind === 'model' &&
        choice.provider === selection.provider &&
        choice.model === selection.model
      );
    case 'engine':
      return (
        choice.kind === 'engine' &&
        choice.engine === selection.engine &&
        choice.accountId === selection.accountId &&
        choice.model === selection.model
      );
  }
}

export function presetSubEngineTarget(
  choice: PresetSubEngineChoice,
): Extract<RoutingTarget, { kind: 'engine' }> {
  const { engine, accountId, model, effort } = choice;
  return {
    kind: 'engine',
    engine,
    ...(accountId === undefined ? {} : { accountId }),
    ...(model === undefined ? {} : { model }),
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  };
}

export function isPresetSub(value: unknown): value is PresetSub {
  if (typeof value !== 'object' || value === null) return false;
  const { choices, default: selection } = value as Record<string, unknown>;
  if (!Array.isArray(choices)) return false;
  if (choices.length === 0) return selection === null;
  if (typeof selection !== 'object' || selection === null) return false;
  const selected = selection as Record<string, unknown>;
  const keys = new Set<string>();
  let models = 0;
  let found = false;
  for (const entry of choices as unknown[]) {
    if (typeof entry !== 'object' || entry === null || !('kind' in entry)) return false;
    if (entry.kind === 'model' && isAssignmentModelOption(entry)) {
      const key = JSON.stringify(['model', entry.provider, entry.model]);
      if (keys.has(key) || ++models > 20) return false;
      keys.add(key);
      found ||=
        selected['kind'] === 'model' &&
        selected['provider'] === entry.provider &&
        selected['model'] === entry.model;
    } else if (
      entry.kind === 'group' &&
      isAssignmentGroupChoice(entry) &&
      (isAssignmentGroupOption(entry) ||
        (!('allowedEfforts' in entry) && !('defaultEffort' in entry) && !('note' in entry)))
    ) {
      const key = JSON.stringify(['group', entry.group]);
      if (keys.has(key)) return false;
      keys.add(key);
      found ||= selected['kind'] === 'group' && selected['group'] === entry.group;
    } else if (
      isPresetSubEngineSelection(entry) &&
      (!('effort' in entry) || entry.effort === undefined || nonBlank(entry.effort)) &&
      (!('note' in entry) ||
        entry.note === undefined ||
        (nonBlank(entry.note) && entry.note.length <= ASSIGNMENT_MODEL_NOTE_MAX))
    ) {
      const key = subChoiceKey(entry);
      if (keys.has(key)) return false;
      keys.add(key);
      found ||= isPresetSubEngineSelection(selection) && key === subChoiceKey(selection);
    } else {
      return false;
    }
  }
  return found;
}

export interface AssignmentGroupChoice {
  group: string;
}

export function isAssignmentGroupChoice(value: unknown): value is AssignmentGroupChoice {
  if (typeof value !== 'object' || value === null) return false;
  const group = (value as Record<string, unknown>)['group'];
  return typeof group === 'string' && group.trim().length > 0;
}

export function assignmentGroupOption(option: AssignmentGroupOption): AssignmentGroupOption {
  return {
    group: option.group,
    ...(option.allowedEfforts === undefined
      ? {}
      : { allowedEfforts: [...option.allowedEfforts], defaultEffort: option.defaultEffort! }),
    ...(option.note === undefined ? {} : { note: option.note }),
  };
}

export function isAssignmentGroupOption(value: unknown): value is AssignmentGroupOption {
  if (typeof value !== 'object' || value === null) return false;
  const option = value as Record<string, unknown>;
  const efforts = option['allowedEfforts'];
  const note = option['note'];
  return (
    typeof option['group'] === 'string' &&
    option['group'].trim().length > 0 &&
    (efforts === undefined
      ? option['defaultEffort'] === undefined
      : Array.isArray(efforts) &&
        efforts.length > 0 &&
        efforts.length <= 16 &&
        efforts.every((effort) => typeof effort === 'string' && effort.trim().length > 0) &&
        new Set(efforts).size === efforts.length &&
        typeof option['defaultEffort'] === 'string' &&
        efforts.includes(option['defaultEffort'])) &&
    (note === undefined ||
      (typeof note === 'string' &&
        note.trim().length > 0 &&
        note.length <= ASSIGNMENT_MODEL_NOTE_MAX)) &&
    (efforts !== undefined || note !== undefined)
  );
}

export function isAssignmentModelOption(value: unknown): value is AssignmentModelOption {
  if (typeof value !== 'object' || value === null) return false;
  const option = value as Record<string, unknown>;
  const efforts = option['allowedEfforts'];
  return (
    typeof option['provider'] === 'string' &&
    option['provider'].trim().length > 0 &&
    typeof option['model'] === 'string' &&
    option['model'].trim().length > 0 &&
    Array.isArray(efforts) &&
    efforts.length > 0 &&
    efforts.length <= 16 &&
    efforts.every((effort) => typeof effort === 'string') &&
    new Set(efforts).size === efforts.length &&
    typeof option['defaultEffort'] === 'string' &&
    efforts.includes(option['defaultEffort']) &&
    (option['note'] === undefined ||
      (typeof option['note'] === 'string' &&
        option['note'].trim().length > 0 &&
        option['note'].length <= ASSIGNMENT_MODEL_NOTE_MAX))
  );
}

export function assignmentModelsOf(
  plan: Pick<PersonaBotModelPlan, 'assignmentDefault' | 'assignmentModels' | 'sub'>,
): AssignmentModelOption[] {
  if (plan.sub !== undefined)
    return plan.sub.choices.flatMap((choice) => {
      if (choice.kind !== 'model') return [];
      const { kind: _kind, ...model } = choice;
      return [model];
    });
  if (plan.assignmentDefault === undefined) return [];
  return (
    plan.assignmentModels ?? [
      {
        provider: plan.assignmentDefault.provider,
        model: plan.assignmentDefault.model,
        allowedEfforts: [plan.assignmentDefault.reasoningEffort ?? ''],
        defaultEffort: plan.assignmentDefault.reasoningEffort ?? '',
      },
    ]
  );
}

export function presetSubFromLegacy(
  preset: Pick<
    ModelPreset,
    | 'assignmentFollowsMain'
    | 'assignmentModels'
    | 'assignmentDefault'
    | 'assignmentGroups'
    | 'assignmentDefaultGroupId'
    | 'assignmentGroupOptions'
  >,
): PresetSub {
  if (preset.assignmentFollowsMain === true) return { choices: [], default: null };
  const route = preset.assignmentDefault;
  return {
    choices: [
      ...assignmentModelsOf({
        assignmentDefault: route,
        ...(preset.assignmentModels === undefined
          ? {}
          : { assignmentModels: preset.assignmentModels }),
      }).map((model) => ({ ...model, kind: 'model' as const })),
      ...(preset.assignmentGroups ?? []).map((group) => ({
        ...preset.assignmentGroupOptions?.find((option) => option.group === group),
        kind: 'group' as const,
        group,
      })),
    ],
    default:
      preset.assignmentDefaultGroupId === undefined
        ? { kind: 'model', provider: route.provider, model: route.model }
        : { kind: 'group', group: preset.assignmentDefaultGroupId },
  };
}

export function presetSubWithEngine(
  sub: PresetSub,
  engine: ModelPresetEngine | undefined,
): PresetSub {
  if (engine === undefined || sub.choices.some((choice) => choice.kind === 'engine')) return sub;
  const { effort: _effort, ...selection } = engine;
  return {
    choices: [...sub.choices, { kind: 'engine', ...engine }],
    default: { kind: 'engine', ...selection },
  };
}

export function storedPresetSub(preset: ModelPreset): PresetSub {
  return preset.sub ?? presetSubWithEngine(presetSubFromLegacy(preset), preset.assignmentEngine);
}

export function mergeLegacyPresetSub(
  previous: PresetSub | undefined,
  next: PresetSub,
  keepModelFreeSub: boolean,
): PresetSub {
  const remaining = next.choices.filter((choice) => !keepModelFreeSub || choice.kind !== 'model');
  const retained: PresetSubChoice[] = [];
  for (const saved of previous?.choices ?? []) {
    const index = remaining.findIndex((choice) => matchesPresetSubChoice(choice, saved));
    const replacement = remaining[index];
    if (replacement !== undefined) {
      remaining.splice(index, 1);
      retained.push(
        saved.kind === 'engine' && replacement.kind === 'engine' && saved.note !== undefined
          ? { ...replacement, note: saved.note }
          : replacement,
      );
    } else if (
      saved.kind === 'engine' &&
      (previous?.default == null || !matchesPresetSubChoice(saved, previous.default))
    ) {
      retained.push(saved);
    }
  }
  return { ...next, choices: [...retained, ...remaining] };
}

export function effectivePresetSub(preset: ModelPreset): PresetSub {
  const sub = storedPresetSub(preset);
  if (sub.default !== null) return sub;
  if (preset.orchestratorEngine !== undefined)
    return presetSubWithEngine(sub, preset.orchestratorEngine);
  const group = preset.orchestratorGroupId;
  if (group === undefined) return presetSubFromLegacy({ assignmentDefault: preset.orchestrator });
  const effort = preset.orchestratorGroupEffort;
  return {
    choices: [
      {
        kind: 'group',
        group,
        ...(effort === undefined
          ? {}
          : {
              allowedEfforts: [effort],
              defaultEffort: effort,
            }),
      },
    ],
    default: { kind: 'group', group },
  };
}

export function presetSubProjection(sub: PresetSub, main: ModelRoute) {
  const models = assignmentModelsOf({ sub });
  const groups = sub.choices.flatMap((choice) => {
    if (choice.kind !== 'group') return [];
    const { kind: _kind, ...option } = choice;
    return [option];
  });
  const selected = sub.default;
  const engine =
    selected?.kind === 'engine'
      ? sub.choices.find(
          (choice) => choice.kind === 'engine' && matchesPresetSubChoice(choice, selected),
        )
      : undefined;
  const model =
    selected?.kind === 'model'
      ? models.find(
          (choice) => choice.provider === selected.provider && choice.model === selected.model,
        )
      : models[0];
  const assignmentDefault =
    model === undefined
      ? main
      : {
          provider: model.provider,
          model: model.model,
          ...(model.defaultEffort === '' ? {} : { reasoningEffort: model.defaultEffort }),
        };
  return {
    assignmentDefault,
    ...(selected === null ? { assignmentFollowsMain: true as const } : {}),
    ...(models.length === 0 ? {} : { assignmentModels: models }),
    ...(groups.length === 0
      ? {}
      : {
          assignmentGroups: groups.map(({ group }) => group),
          assignmentGroupOptions: groups.filter(
            (option) => option.allowedEfforts !== undefined || option.note !== undefined,
          ),
        }),
    ...(selected?.kind === 'group' ? { assignmentDefaultGroupId: selected.group } : {}),
    ...(engine?.kind === 'engine' ? { assignmentEngine: cleanPresetSubEngine(engine) } : {}),
  };
}

function cleanPresetSubEngineSelection({
  engine,
  accountId,
  model,
}: PresetSubEngineSelection): PresetSubEngineSelection {
  return {
    kind: 'engine',
    engine,
    ...(accountId === undefined ? {} : { accountId }),
    ...(model === undefined ? {} : { model }),
  };
}

function cleanPresetSubEngine(choice: PresetSubEngineChoice): ModelPresetEngine {
  const { kind: _kind, ...selection } = cleanPresetSubEngineSelection(choice);
  return { ...selection, ...(choice.effort === undefined ? {} : { effort: choice.effort }) };
}

export function cleanPresetSub(sub: PresetSub): PresetSub {
  return {
    choices: sub.choices.map((choice) =>
      choice.kind === 'group'
        ? { kind: 'group', ...assignmentGroupOption(choice) }
        : choice.kind === 'engine'
          ? {
              kind: 'engine',
              ...cleanPresetSubEngine(choice),
              ...(choice.note === undefined ? {} : { note: choice.note }),
            }
          : {
              kind: 'model',
              provider: choice.provider,
              model: choice.model,
              allowedEfforts: [...choice.allowedEfforts],
              defaultEffort: choice.defaultEffort,
              ...(choice.note === undefined ? {} : { note: choice.note }),
            },
    ),
    default:
      sub.default === null
        ? null
        : sub.default.kind === 'group'
          ? { kind: 'group', group: sub.default.group }
          : sub.default.kind === 'engine'
            ? cleanPresetSubEngineSelection(sub.default)
            : { kind: 'model', provider: sub.default.provider, model: sub.default.model },
  };
}
