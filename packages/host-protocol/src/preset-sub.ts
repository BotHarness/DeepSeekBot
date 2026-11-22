import { isEngineId, type EngineId } from './subscription-engine.js';

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

export type PresetSubEngineSelection = { kind: 'engine' } & {
  engine: EngineId;
  accountId?: string;
  model?: string;
};
export type PresetSubEngineChoice = PresetSubEngineSelection & { effort?: string; note?: string };

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

export function isPresetSub(value: unknown): value is PresetSub {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const group = (value as Record<string, unknown>)['group'];
  return typeof group === 'string' && group.trim().length > 0;
}

export function isAssignmentGroupOption(value: unknown): value is AssignmentGroupOption {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
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

export interface LegacyAssignmentRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface LegacySubSource {
  sub?: PresetSub;
  assignmentDefault?: LegacyAssignmentRoute;
  assignmentFollowsMain?: boolean;
  assignmentModels?: AssignmentModelOption[];
  assignmentGroups?: string[];
  assignmentDefaultGroupId?: string;
  assignmentGroupOptions?: AssignmentGroupOption[];
}

export function assignmentModelsOf(
  plan: Pick<LegacySubSource, 'assignmentDefault' | 'assignmentModels' | 'sub'>,
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

export function presetSubFromLegacy(preset: Omit<LegacySubSource, 'sub'>): PresetSub {
  const route = preset.assignmentDefault;
  if (preset.assignmentFollowsMain === true || route === undefined)
    return { choices: [], default: null };
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
  engine: { engine: EngineId; accountId?: string; model?: string; effort?: string } | undefined,
): PresetSub {
  if (engine === undefined || sub.choices.some((choice) => choice.kind === 'engine')) return sub;
  const selection: PresetSubEngineSelection = {
    kind: 'engine',
    engine: engine.engine,
    ...(engine.accountId === undefined ? {} : { accountId: engine.accountId }),
    ...(engine.model === undefined ? {} : { model: engine.model }),
  };
  return {
    choices: [
      ...sub.choices,
      { ...selection, ...(engine.effort === undefined ? {} : { effort: engine.effort }) },
    ],
    default: selection,
  };
}
