import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { HarnessError } from '@deepseek-ai/dsh-llm';

import {
  attachOperationalModule,
  OperationalDatabaseError,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import { isEngineId, type EngineChoice, type EngineId } from '../engines/engine-session.js';
import {
  assignmentGroupOption,
  assignmentModelsOf,
  cleanPresetSub,
  effectivePresetSub,
  isAssignmentGroupChoice,
  isAssignmentGroupOption,
  isAssignmentModelOption,
  isPresetSub,
  matchesPresetSubChoice,
  mergeLegacyPresetSub,
  presetSubProjection,
  presetSubWithEngine,
  presetSubFromLegacy,
  storedPresetSub,
  type AssignmentGroupChoice,
  type AssignmentGroupOption,
  type AssignmentModelOption,
  type PresetSub,
} from './preset-sub.js';

export {
  ASSIGNMENT_MODEL_NOTE_MAX,
  assignmentModelsOf,
  effectivePresetSub,
  isAssignmentGroupChoice,
  isAssignmentGroupOption,
  isAssignmentModelOption,
  isPresetSub,
  matchesPresetSubChoice,
  presetSubFromLegacy,
  presetSubProjection,
  type AssignmentGroupChoice,
  type AssignmentGroupOption,
  type AssignmentModelOption,
  type PresetSub,
  type PresetSubChoice,
} from './preset-sub.js';

export interface ModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export type ModelPresetEngine = EngineChoice & { engine: EngineId };

export interface ModelPresetEngines {
  orchestratorEngine?: ModelPresetEngine;
  assignmentEngine?: ModelPresetEngine;
}

export interface ModelPresetEngineInput {
  orchestratorEngine?: ModelPresetEngine | null;
  assignmentEngine?: ModelPresetEngine | null;
}

export function isModelPresetEngine(value: unknown): value is ModelPresetEngine {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    isEngineId(row['engine']) &&
    [row['model'], row['effort'], row['accountId']].every(
      (entry) => entry === undefined || (typeof entry === 'string' && entry.trim() !== ''),
    )
  );
}

export function hasPresetEngines(preset: ModelPresetEngines & Pick<ModelPreset, 'sub'>): boolean {
  return (
    preset.orchestratorEngine !== undefined ||
    preset.assignmentEngine !== undefined ||
    preset.sub?.choices.some((choice) => choice.kind === 'engine') === true
  );
}

function presetEngines(
  input: ModelPresetEngineInput,
  current: ModelPresetEngines = {},
): ModelPresetEngines {
  const clean = (choice: ModelPresetEngine): ModelPresetEngine => {
    if (!isModelPresetEngine(choice)) throw new Error('Invalid Model Preset Subscription Engine');
    const { engine, model, effort, accountId } = choice;
    return {
      engine,
      ...(model === undefined ? {} : { model }),
      ...(effort === undefined ? {} : { effort }),
      ...(accountId === undefined ? {} : { accountId }),
    };
  };
  const orchestrator =
    input.orchestratorEngine === undefined ? current.orchestratorEngine : input.orchestratorEngine;
  const assignment =
    input.assignmentEngine === undefined ? current.assignmentEngine : input.assignmentEngine;
  return {
    ...(orchestrator == null ? {} : { orchestratorEngine: clean(orchestrator) }),
    ...(assignment == null ? {} : { assignmentEngine: clean(assignment) }),
  };
}

export interface ModelPreset extends ModelPresetEngines {
  id: string;
  name: string;
  revision: number;
  orchestrator: ModelRoute;
  sub?: PresetSub;
  assignmentDefault: ModelRoute;
  assignmentFollowsMain?: true;
  assignmentModels?: AssignmentModelOption[];
  openAssignmentModels?: true;
  orchestratorGroupId?: string;
  orchestratorGroupEffort?: string;
  assignmentGroups?: string[];
  assignmentDefaultGroupId?: string;
  assignmentGroupOptions?: AssignmentGroupOption[];
  createdAt: string;
}

export interface ModelPresetGroups {
  orchestratorGroupId?: string;
  orchestratorGroupEffort?: string;
  assignmentGroups?: string[];
  assignmentDefaultGroupId?: string;
  assignmentGroupOptions?: AssignmentGroupOption[];
}

export function presetGroups(source: ModelPresetGroups): ModelPresetGroups {
  return {
    ...(source.orchestratorGroupId === undefined
      ? {}
      : { orchestratorGroupId: source.orchestratorGroupId }),
    ...(source.orchestratorGroupId === undefined ||
    source.orchestratorGroupEffort === undefined ||
    source.orchestratorGroupEffort.trim() === ''
      ? {}
      : { orchestratorGroupEffort: source.orchestratorGroupEffort.trim() }),
    ...(source.assignmentGroups === undefined || source.assignmentGroups.length === 0
      ? {}
      : { assignmentGroups: [...source.assignmentGroups] }),
    ...(source.assignmentDefaultGroupId === undefined ||
    source.assignmentGroups === undefined ||
    source.assignmentGroups.length === 0
      ? {}
      : { assignmentDefaultGroupId: source.assignmentDefaultGroupId }),
    ...groupOptionsWithin(source.assignmentGroups, source.assignmentGroupOptions),
  };
}

function groupOptionsWithin(
  groups: string[] | undefined,
  options: AssignmentGroupOption[] | undefined,
): { assignmentGroupOptions?: AssignmentGroupOption[] } {
  const kept = (options ?? []).filter((option) => (groups ?? []).includes(option.group));
  return kept.length === 0
    ? {}
    : { assignmentGroupOptions: kept.map((option) => assignmentGroupOption(option)) };
}

function isAssignmentGroupOptions(value: unknown, groups: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || !Array.isArray(groups) || value.length === 0) return false;
  const ids = value.map((option) => (option as Record<string, unknown> | null)?.['group']);
  return (
    value.every(isAssignmentGroupOption) &&
    new Set(ids).size === ids.length &&
    ids.every((id) => groups.includes(id))
  );
}

export function assignmentGroupOptionOf(
  plan: Pick<PersonaBotModelPlan, 'assignmentGroupOptions'> | undefined,
  groupId: string,
): AssignmentGroupOption | undefined {
  return plan?.assignmentGroupOptions?.find((option) => option.group === groupId);
}

export function hasPresetGroups(source: ModelPresetGroups): boolean {
  return source.orchestratorGroupId !== undefined || (source.assignmentGroups?.length ?? 0) > 0;
}

function isGroupEffort(value: Record<string, unknown>): boolean {
  const effort = value['orchestratorGroupEffort'];
  return (
    effort === undefined ||
    (typeof effort === 'string' &&
      effort.trim().length > 0 &&
      typeof value['orchestratorGroupId'] === 'string')
  );
}

export function isModelPresetGroups(value: Record<string, unknown>): boolean {
  return (
    (value['orchestratorGroupId'] === undefined ||
      (typeof value['orchestratorGroupId'] === 'string' &&
        value['orchestratorGroupId'].trim().length > 0)) &&
    isGroupEffort(value) &&
    isAssignmentGroups(value['assignmentGroups'], value['assignmentDefaultGroupId']) &&
    isAssignmentGroupOptions(value['assignmentGroupOptions'], value['assignmentGroups'])
  );
}

export interface PersonaBotModelPlan {
  revision: number;
  sourcePresetId: string;
  sourcePresetName: string;
  orchestrator: ModelRoute;
  sub?: PresetSub;
  orchestratorGroupId?: string;
  orchestratorGroupEffort?: string;
  assignmentDefault?: ModelRoute;
  assignmentModels?: AssignmentModelOption[];
  openAssignmentModels?: true;
  assignmentGroups?: string[];
  assignmentDefaultGroupId?: string;
  assignmentGroupOptions?: AssignmentGroupOption[];
  appliedAt: string;
}

export class AssignmentChoiceError extends HarnessError {
  constructor(
    code:
      | 'assignment-choice-not-allowed'
      | 'assignment-choice-resting'
      | 'assignment-choice-unavailable',
    message: string,
  ) {
    super(message, code);
  }
}

export function selectAssignmentGroup(
  plan: PersonaBotModelPlan,
  requested?: ModelRoute | AssignmentGroupChoice,
): string | undefined {
  if (requested === undefined) return plan.assignmentDefaultGroupId;
  if (!isAssignmentGroupChoice(requested)) return undefined;
  const id = requested.group.trim();
  if (!(plan.assignmentGroups ?? []).includes(id))
    throw new AssignmentChoiceError(
      'assignment-choice-not-allowed',
      `Assignment Routing Group ${id} is not allowed`,
    );
  return id;
}

function isAssignmentGroups(groups: unknown, defaultId: unknown): boolean {
  if (groups === undefined) return defaultId === undefined;
  return (
    Array.isArray(groups) &&
    groups.length > 0 &&
    groups.every((id) => typeof id === 'string' && id.trim().length > 0) &&
    new Set(groups).size === groups.length &&
    (defaultId === undefined || (typeof defaultId === 'string' && groups.includes(defaultId)))
  );
}

export interface ModelPresetUsage {
  presetId: string;
  count: number;
  botNames: string[];
}

export interface ModelPresetStore {
  list(): ModelPreset[];
  get(id: string): ModelPreset | undefined;
  migrateDefault(
    source: LegacyDefaultModel | (() => LegacyDefaultModel),
    options?: { dryRun: true },
  ): DefaultPresetMigration;
  setDefaultMain(input: {
    expectedRevision: number;
    route: ModelRoute;
    groupId?: string;
    effort?: string;
    preserveSub?: boolean;
  }): ModelPreset;
  setSub(id: string, expectedRevision: number, sub: PresetSub): ModelPreset;
  create(input: {
    name: string;
    orchestrator: ModelRoute;
    assignmentDefault: ModelRoute;
    assignmentFollowsMain?: boolean;
    assignmentModels?: AssignmentModelOption[];
    openAssignmentModels?: boolean;
    groups?: ModelPresetGroups;
    engines?: ModelPresetEngineInput;
  }): ModelPreset;
  update(
    id: string,
    input: {
      expectedRevision: number;
      name: string;
      orchestrator: ModelRoute;
      assignmentDefault: ModelRoute;
      assignmentFollowsMain?: boolean;
      assignmentModels?: AssignmentModelOption[];
      openAssignmentModels?: boolean;
      groups?: ModelPresetGroups;
      engines?: ModelPresetEngineInput;
    },
  ): ModelPreset | undefined;
  delete(id: string, expectedRevision: number): boolean;
}

export const DEFAULT_MODEL_PRESET_ID = 'default';

export class ModelPresetError extends Error {
  constructor(
    readonly code: 'default-preset-pinned' | 'stale-setting',
    message: string,
  ) {
    super(message);
  }
}

export interface LegacyDefaultModel {
  main?: ModelRoute;
  sub?: ModelRoute;
  groupId?: string;
  groupEffort?: string;
}

export interface DefaultPresetMigration {
  status: 'would-migrate' | 'migrated' | 'already-migrated';
  preset: ModelPreset;
}

export function planDefaultPreset(source: LegacyDefaultModel, createdAt: string): ModelPreset {
  const main = source.main ?? { provider: 'deepseek-official', model: 'deepseek-flash' };
  if (!isModelRoute(main) || (source.sub !== undefined && !isModelRoute(source.sub)))
    throw new Error('Invalid legacy default model route');
  return presetRecord({
    id: DEFAULT_MODEL_PRESET_ID,
    name: 'Default',
    revision: 1,
    createdAt,
    orchestrator: main,
    assignmentDefault: source.sub ?? main,
    ...(source.sub === undefined ? { assignmentFollowsMain: true } : {}),
    ...(source.groupId === undefined ? {} : { orchestratorGroupId: source.groupId }),
    ...(source.groupEffort === undefined ? {} : { orchestratorGroupEffort: source.groupEffort }),
  });
}

export function defaultPresetPlan(preset: ModelPreset): PersonaBotModelPlan {
  const sub =
    preset.sub === undefined && preset.assignmentEngine === undefined
      ? undefined
      : effectivePresetSub(preset);
  const followsMain = storedPresetSub(preset).default === null;
  const { assignmentDefaultGroupId: _legacyGroup, ...withoutGroupDefault } = preset;
  const groups =
    sub?.default?.kind === 'engine'
      ? withoutGroupDefault
      : followsMain && preset.orchestratorGroupId
        ? {
            ...preset,
            assignmentGroups: [preset.orchestratorGroupId],
            assignmentDefaultGroupId: preset.orchestratorGroupId,
            ...(preset.orchestratorGroupEffort === undefined
              ? {}
              : {
                  assignmentGroupOptions: [
                    {
                      group: preset.orchestratorGroupId,
                      allowedEfforts: [preset.orchestratorGroupEffort],
                      defaultEffort: preset.orchestratorGroupEffort,
                    },
                  ],
                }),
          }
        : preset;
  return {
    revision: preset.revision,
    sourcePresetId: preset.id,
    sourcePresetName: preset.name,
    orchestrator: preset.orchestrator,
    assignmentDefault: followsMain ? preset.orchestrator : preset.assignmentDefault,
    ...(sub === undefined ? {} : { sub }),
    ...(preset.assignmentModels === undefined ? {} : { assignmentModels: preset.assignmentModels }),
    ...(preset.openAssignmentModels === true ? { openAssignmentModels: true } : {}),
    ...presetGroups(groups),
    appliedAt: preset.createdAt,
  };
}

export function defaultPresetRoute(
  readPreset: () => ModelPreset | undefined,
  role: 'orchestrator' | 'assignment',
  fallback: () => ModelRoute | undefined,
): ModelRoute {
  try {
    const preset = readPreset();
    if (preset !== undefined)
      return role === 'assignment' ? preset.assignmentDefault : preset.orchestrator;
  } catch (error) {
    if (
      !(error instanceof OperationalDatabaseError) ||
      (error.code !== 'recovery-mode' && error.code !== 'closed')
    )
      throw error;
  }
  const route = fallback();
  if (route === undefined) throw new Error('Default Model Preset is unavailable');
  return route;
}

export function resolveBotModelPlan(
  bot: { modelPlan?: PersonaBotModelPlan; model?: string },
  inherited: () => PersonaBotModelPlan | undefined,
): PersonaBotModelPlan | undefined {
  const plan = bot.modelPlan;
  if (plan === undefined) return bot.model === undefined ? inherited() : undefined;
  if (plan.assignmentDefault !== undefined) return plan;
  const defaults = inherited();
  if (defaults === undefined) return plan;
  const {
    revision: _revision,
    sourcePresetId: _sourcePresetId,
    sourcePresetName: _sourcePresetName,
    orchestrator: _orchestrator,
    orchestratorGroupId: _group,
    orchestratorGroupEffort: _effort,
    appliedAt: _appliedAt,
    ...assignment
  } = defaults;
  return { ...assignment, ...plan };
}

export function isModelRoute(value: unknown): value is ModelRoute {
  if (typeof value !== 'object' || value === null) return false;
  const route = value as Record<string, unknown>;
  return (
    typeof route['provider'] === 'string' &&
    route['provider'].trim().length > 0 &&
    typeof route['model'] === 'string' &&
    route['model'].trim().length > 0 &&
    (route['reasoningEffort'] === undefined ||
      (typeof route['reasoningEffort'] === 'string' && route['reasoningEffort'].trim().length > 0))
  );
}

export function isAssignmentModelChoice(value: unknown): value is ModelRoute {
  if (typeof value !== 'object' || value === null) return false;
  const route = value as Record<string, unknown>;
  return (
    typeof route['provider'] === 'string' &&
    route['provider'].trim().length > 0 &&
    typeof route['model'] === 'string' &&
    route['model'].trim().length > 0 &&
    (route['reasoningEffort'] === undefined || typeof route['reasoningEffort'] === 'string')
  );
}

export function validateAssignmentModels(
  assignmentDefault: ModelRoute,
  assignmentModels: AssignmentModelOption[],
): void {
  if (
    assignmentModels.length === 0 ||
    assignmentModels.length > 20 ||
    !assignmentModels.every(isAssignmentModelOption)
  )
    throw new Error('Choose between 1 and 20 valid Assignment models');
  const keys = assignmentModels.map((option) => `${option.provider}\0${option.model}`);
  if (new Set(keys).size !== keys.length) throw new Error('Assignment models must be unique');
  const selected = assignmentModels.find(
    (option) =>
      option.provider === assignmentDefault.provider && option.model === assignmentDefault.model,
  );
  if (
    selected === undefined ||
    selected.defaultEffort !== (assignmentDefault.reasoningEffort ?? '')
  )
    throw new Error('Assignment default must match one model and its default effort');
}

export function isListedAssignmentRoute(
  plan: Pick<PersonaBotModelPlan, 'assignmentDefault' | 'assignmentModels' | 'sub'>,
  route: Pick<ModelRoute, 'provider' | 'model'>,
): boolean {
  return assignmentModelsOf(plan).some(
    (option) => option.provider === route.provider && option.model === route.model,
  );
}

export function selectAssignmentRoute(plan: PersonaBotModelPlan, requested: ModelRoute): ModelRoute;
export function selectAssignmentRoute(
  plan: PersonaBotModelPlan,
  requested?: ModelRoute,
): ModelRoute | undefined;
export function selectAssignmentRoute(
  plan: PersonaBotModelPlan,
  requested?: ModelRoute,
): ModelRoute | undefined {
  if (requested === undefined) {
    const selection = plan.sub?.default;
    if (selection?.kind === 'group') return undefined;
    if (selection?.kind === 'model')
      return selectAssignmentRoute(plan, { provider: selection.provider, model: selection.model });
    return plan.assignmentDefault === undefined ? undefined : { ...plan.assignmentDefault };
  }
  const option = assignmentModelsOf(plan).find(
    (candidate) => candidate.provider === requested.provider && candidate.model === requested.model,
  );
  if (option === undefined && plan.openAssignmentModels === true && plan.assignmentDefault)
    return {
      provider: requested.provider,
      model: requested.model,
      ...(requested.reasoningEffort === undefined || requested.reasoningEffort === ''
        ? {}
        : { reasoningEffort: requested.reasoningEffort }),
    };
  if (option === undefined)
    throw new AssignmentChoiceError(
      'assignment-choice-not-allowed',
      `Assignment model ${requested.provider}/${requested.model} is not allowed`,
    );
  const effort = requested.reasoningEffort ?? option.defaultEffort;
  if (!option.allowedEfforts.includes(effort))
    throw new AssignmentChoiceError(
      'assignment-choice-not-allowed',
      `Assignment effort ${effort || 'provider default'} is not allowed for ${requested.provider}/${requested.model}`,
    );
  return {
    provider: option.provider,
    model: option.model,
    ...(effort === '' ? {} : { reasoningEffort: effort }),
  };
}

export function isPersonaBotModelPlan(value: unknown): value is PersonaBotModelPlan {
  if (typeof value !== 'object' || value === null) return false;
  const plan = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(plan['revision']) &&
    (plan['revision'] as number) > 0 &&
    typeof plan['sourcePresetId'] === 'string' &&
    typeof plan['sourcePresetName'] === 'string' &&
    typeof plan['appliedAt'] === 'string' &&
    isModelRoute(plan['orchestrator']) &&
    (plan['sub'] === undefined || isPresetSub(plan['sub'])) &&
    (plan['openAssignmentModels'] === undefined ||
      (plan['openAssignmentModels'] === true && plan['assignmentDefault'] !== undefined)) &&
    (plan['orchestratorGroupId'] === undefined ||
      (typeof plan['orchestratorGroupId'] === 'string' &&
        plan['orchestratorGroupId'].trim().length > 0)) &&
    isGroupEffort(plan) &&
    isAssignmentGroups(plan['assignmentGroups'], plan['assignmentDefaultGroupId']) &&
    isAssignmentGroupOptions(plan['assignmentGroupOptions'], plan['assignmentGroups']) &&
    (plan['assignmentGroups'] === undefined || plan['assignmentDefault'] !== undefined) &&
    (plan['assignmentDefault'] === undefined
      ? plan['assignmentModels'] === undefined
      : isModelRoute(plan['assignmentDefault']) &&
        (plan['assignmentModels'] === undefined ||
          isAssignmentModelsForDefault(plan['assignmentDefault'], plan['assignmentModels'])))
  );
}

function isAssignmentModelsForDefault(defaultRoute: ModelRoute, value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  try {
    validateAssignmentModels(defaultRoute, value);
    return true;
  } catch {
    return false;
  }
}

function isModelPreset(value: unknown): value is ModelPreset {
  if (typeof value !== 'object' || value === null) return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset['id'] === 'string' &&
    typeof preset['name'] === 'string' &&
    Number.isSafeInteger(preset['revision']) &&
    typeof preset['createdAt'] === 'string' &&
    isModelRoute(preset['orchestrator']) &&
    isModelRoute(preset['assignmentDefault']) &&
    (preset['sub'] === undefined || isPresetSub(preset['sub'])) &&
    (preset['assignmentFollowsMain'] === undefined || preset['assignmentFollowsMain'] === true) &&
    (preset['openAssignmentModels'] === undefined || preset['openAssignmentModels'] === true) &&
    isModelPresetGroups(preset) &&
    (preset['orchestratorEngine'] === undefined ||
      isModelPresetEngine(preset['orchestratorEngine'])) &&
    (preset['assignmentEngine'] === undefined || isModelPresetEngine(preset['assignmentEngine'])) &&
    (preset['assignmentModels'] === undefined ||
      isAssignmentModelsForDefault(preset['assignmentDefault'], preset['assignmentModels']))
  );
}

export interface ModelPresetStoreOptions {
  rootDir: string;
  database: OperationalDatabaseOwner;
  now?: () => Date;
  onImport?: (event: { phase: 'complete' | 'failed'; count?: number; durationMs: number }) => void;
}

function presetRecord(preset: ModelPreset): ModelPreset {
  const route = (value: ModelRoute): ModelRoute => ({
    provider: value.provider,
    model: value.model,
    ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }),
  });
  return {
    id: preset.id,
    name: preset.name,
    revision: preset.revision,
    createdAt: preset.createdAt,
    orchestrator: route(preset.orchestrator),
    sub: cleanPresetSub(storedPresetSub(preset)),
    assignmentDefault: route(preset.assignmentDefault),
    ...(preset.assignmentFollowsMain === true ? { assignmentFollowsMain: true } : {}),
    ...(preset.assignmentModels === undefined
      ? {}
      : {
          assignmentModels: preset.assignmentModels.map((option) => ({
            provider: option.provider,
            model: option.model,
            allowedEfforts: [...option.allowedEfforts],
            defaultEffort: option.defaultEffort,
            ...(option.note === undefined ? {} : { note: option.note }),
          })),
        }),
    ...(preset.openAssignmentModels === true ? { openAssignmentModels: true } : {}),
    ...presetGroups(preset),
    ...presetEngines(preset),
  };
}

export function createModelPresetStore(options: ModelPresetStoreOptions): ModelPresetStore {
  const now = options.now ?? (() => new Date());
  const reportImport = (
    event: Parameters<NonNullable<ModelPresetStoreOptions['onImport']>>[0],
  ): void => {
    try {
      options.onImport?.(event);
    } catch {}
  };
  const port = attachOperationalModule(options.database, 'model-presets');
  function parse(body: unknown): ModelPreset {
    const parsed: unknown = JSON.parse(String(body));
    if (!isModelPreset(parsed)) throw new Error('Invalid Model Preset record');
    return parsed;
  }
  const get = (id: string): ModelPreset | undefined =>
    port.read((database) => {
      const row = database.prepare('SELECT body FROM model_presets WHERE id = ?').get(id);
      return row === undefined ? undefined : parse(row['body']);
    });
  const read = (): ModelPreset[] =>
    port.read((database) => {
      const rows = database
        .prepare('SELECT body FROM model_presets ORDER BY id = ? DESC, rowid')
        .all(DEFAULT_MODEL_PRESET_ID);
      return rows.map((row) => parse(row['body']));
    });
  const write = (preset: ModelPreset): void => {
    port.transaction(
      (database) => {
        database
          .prepare(`INSERT INTO model_presets (id, body) VALUES (?, ?)
        ON CONFLICT (id) DO UPDATE SET body = excluded.body`)
          .run(preset.id, JSON.stringify(presetRecord(preset)));
      },
      ['model-presets'],
    );
  };

  if (
    options.database.mode === 'ready' &&
    !port.read((database) =>
      database.prepare('SELECT singleton FROM model_presets_import WHERE singleton = 1').get(),
    )
  ) {
    const startedAt = performance.now();
    try {
      let legacy: unknown;
      try {
        legacy = JSON.parse(readFileSync(join(options.rootDir, 'model-presets.json'), 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('Invalid Model Preset import source', { cause: error });
        legacy = [];
      }
      if (
        !Array.isArray(legacy) ||
        !legacy.every(isModelPreset) ||
        legacy.some((preset) => !preset.id.trim() || !preset.name.trim() || preset.revision < 1) ||
        new Set(legacy.map((preset) => preset.id)).size !== legacy.length ||
        new Set(legacy.map((preset) => preset.name.toLowerCase())).size !== legacy.length
      )
        throw new Error('Invalid Model Preset import source');
      port.transaction(
        (database) => {
          if (database.prepare('SELECT id FROM model_presets LIMIT 1').get())
            throw new Error('Model Preset target is populated without an import marker');
          const insert = database.prepare('INSERT INTO model_presets (id, body) VALUES (?, ?)');
          for (const preset of legacy) insert.run(preset.id, JSON.stringify(presetRecord(preset)));
          database
            .prepare('INSERT INTO model_presets_import (singleton, imported_at) VALUES (1, ?)')
            .run(now().toISOString());
        },
        ['model-presets'],
      );
      reportImport({
        phase: 'complete',
        count: legacy.length,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      reportImport({ phase: 'failed', durationMs: performance.now() - startedAt });
      throw error;
    }
  }
  return {
    list: read,
    get,
    migrateDefault(source, migrationOptions) {
      const current = get(DEFAULT_MODEL_PRESET_ID);
      if (current !== undefined) return { status: 'already-migrated', preset: current };
      const legacy = typeof source === 'function' ? source() : source;
      const row = port.read((database) =>
        database
          .prepare('SELECT group_id, effort FROM legacy_routing_group_default WHERE singleton = 1')
          .get(),
      );
      const preset = planDefaultPreset(
        {
          ...legacy,
          ...(typeof row?.['group_id'] === 'string' ? { groupId: row['group_id'] } : {}),
          ...(typeof row?.['effort'] === 'string' ? { groupEffort: row['effort'] } : {}),
        },
        now().toISOString(),
      );
      if (migrationOptions?.dryRun) return { status: 'would-migrate', preset };
      port.transaction(
        (database) => {
          database
            .prepare('INSERT INTO model_presets (id, body) VALUES (?, ?)')
            .run(preset.id, JSON.stringify(preset));
          database.prepare('DELETE FROM legacy_routing_group_default').run();
        },
        ['model-presets'],
      );
      return { status: 'migrated', preset };
    },
    setDefaultMain(input) {
      const current = get(DEFAULT_MODEL_PRESET_ID);
      if (current === undefined || current.revision !== input.expectedRevision)
        throw new ModelPresetError(
          'stale-setting',
          'Default preset changed; read it again before saving',
        );
      const {
        orchestratorGroupId: _group,
        orchestratorGroupEffort: _effort,
        orchestratorEngine: _engine,
        ...existing
      } = current;
      const followsMain = input.preserveSub !== true || storedPresetSub(current).default === null;
      const preset = presetRecord({
        ...(followsMain
          ? {
              id: current.id,
              name: current.name,
              createdAt: current.createdAt,
              assignmentFollowsMain: true,
            }
          : existing),
        revision: current.revision + 1,
        orchestrator: input.route,
        assignmentDefault: followsMain ? input.route : current.assignmentDefault,
        ...(input.groupId === undefined ? {} : { orchestratorGroupId: input.groupId }),
        ...(input.effort === undefined ? {} : { orchestratorGroupEffort: input.effort }),
      });
      write(preset);
      return preset;
    },
    setSub(id, expectedRevision, sub) {
      if (!isPresetSub(sub)) throw new Error('Invalid Model Preset sub choices or default');
      const current = get(id);
      if (current === undefined || current.revision !== expectedRevision)
        throw new ModelPresetError(
          'stale-setting',
          'Model Preset changed; read it again before saving',
        );
      const {
        assignmentFollowsMain: _followsMain,
        assignmentModels: _models,
        assignmentGroups: _groups,
        assignmentDefaultGroupId: _group,
        assignmentGroupOptions: _options,
        assignmentEngine: _engine,
        openAssignmentModels: _open,
        ...kept
      } = current;
      const preset = presetRecord({
        ...kept,
        ...presetSubProjection(sub, current.orchestrator),
        sub,
        revision: current.revision + 1,
      });
      write(preset);
      return preset;
    },
    create(input) {
      if (input.assignmentModels !== undefined)
        validateAssignmentModels(input.assignmentDefault, input.assignmentModels);
      const name = input.name.trim();
      if (name.length === 0 || name.length > 100) throw new Error('Model Preset name is required');
      const presets = read();
      if (presets.some((preset) => preset.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Model Preset name already exists');
      }
      const preset = presetRecord({
        id: randomUUID(),
        name,
        revision: 1,
        orchestrator: { ...input.orchestrator },
        assignmentDefault: { ...input.assignmentDefault },
        ...(input.assignmentFollowsMain === true ? { assignmentFollowsMain: true } : {}),
        ...(input.assignmentModels === undefined
          ? {}
          : {
              assignmentModels: input.assignmentModels.map((option) => ({
                ...option,
                allowedEfforts: [...option.allowedEfforts],
              })),
            }),
        ...(input.openAssignmentModels === true ? { openAssignmentModels: true } : {}),
        ...presetGroups(input.groups ?? {}),
        ...presetEngines(input.engines ?? {}),
        createdAt: now().toISOString(),
      });
      if (!isModelPresetGroups(preset as unknown as Record<string, unknown>))
        throw new Error('Model Preset Routing Groups are invalid');
      write(preset);
      return preset;
    },
    update(id, input) {
      const name = input.name.trim();
      if (name.length === 0 || name.length > 100) throw new Error('Model Preset name is required');
      const presets = read();
      const index = presets.findIndex((preset) => preset.id === id);
      if (index < 0) return undefined;
      const current = presets[index]!;
      if (current.revision !== input.expectedRevision) {
        const message = 'Model Preset changed; select Edit selected preset again before saving';
        if (id === DEFAULT_MODEL_PRESET_ID) throw new ModelPresetError('stale-setting', message);
        throw new Error(message);
      }
      const followsMain = input.assignmentFollowsMain ?? storedPresetSub(current).default === null;
      const assignmentDefault = followsMain ? input.orchestrator : input.assignmentDefault;
      const assignmentModels = followsMain
        ? undefined
        : (input.assignmentModels ?? current.assignmentModels);
      if (assignmentModels !== undefined)
        validateAssignmentModels(assignmentDefault, assignmentModels);
      if (
        presets.some(
          (preset) =>
            preset.id !== id &&
            name.toLowerCase() !== current.name.toLowerCase() &&
            preset.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new Error('Model Preset name already exists');
      }
      const {
        openAssignmentModels: currentOpen,
        orchestratorGroupId: currentOrchestratorGroup,
        orchestratorGroupEffort: currentOrchestratorEffort,
        assignmentGroups: currentGroups,
        assignmentDefaultGroupId: currentDefaultGroup,
        assignmentGroupOptions: currentGroupOptions,
        assignmentFollowsMain: _assignmentFollowsMain,
        assignmentModels: _assignmentModels,
        orchestratorEngine: _orchestratorEngine,
        assignmentEngine: _assignmentEngine,
        sub: currentSub,
        ...rest
      } = current;
      const open = input.openAssignmentModels ?? currentOpen === true;
      const groups = presetGroups(
        input.groups ?? {
          ...(currentOrchestratorGroup === undefined
            ? {}
            : { orchestratorGroupId: currentOrchestratorGroup }),
          ...(currentOrchestratorEffort === undefined
            ? {}
            : { orchestratorGroupEffort: currentOrchestratorEffort }),
          ...(currentGroups === undefined ? {} : { assignmentGroups: currentGroups }),
          ...(currentDefaultGroup === undefined
            ? {}
            : { assignmentDefaultGroupId: currentDefaultGroup }),
          ...(currentGroupOptions === undefined
            ? {}
            : { assignmentGroupOptions: currentGroupOptions }),
        },
      );
      if (!isModelPresetGroups(groups as Record<string, unknown>))
        throw new Error('Model Preset Routing Groups are invalid');
      const keepModelFreeSub =
        !followsMain &&
        currentSub?.default?.kind === 'group' &&
        currentSub.choices.every((choice) => choice.kind !== 'model') &&
        groups.assignmentDefaultGroupId !== undefined &&
        (input.assignmentModels === undefined ||
          isDeepStrictEqual(input.assignmentModels, assignmentModelsOf({ assignmentDefault }))) &&
        isDeepStrictEqual(assignmentDefault, current.assignmentDefault);
      const updated = presetRecord({
        ...rest,
        name,
        revision: current.revision + 1,
        orchestrator: { ...input.orchestrator },
        assignmentDefault: { ...assignmentDefault },
        ...(followsMain ? { assignmentFollowsMain: true } : {}),
        ...(assignmentModels === undefined || keepModelFreeSub
          ? {}
          : {
              assignmentModels: assignmentModels.map((option) => ({
                ...option,
                allowedEfforts: [...option.allowedEfforts],
              })),
            }),
        ...(open ? { openAssignmentModels: true } : {}),
        ...presetGroups(
          followsMain
            ? {
                ...(groups.orchestratorGroupId === undefined
                  ? {}
                  : { orchestratorGroupId: groups.orchestratorGroupId }),
                ...(groups.orchestratorGroupEffort === undefined
                  ? {}
                  : { orchestratorGroupEffort: groups.orchestratorGroupEffort }),
              }
            : groups,
        ),
        ...presetEngines(
          followsMain ? { ...input.engines, assignmentEngine: null } : (input.engines ?? {}),
          current,
        ),
      });
      const nextSub = storedPresetSub(updated);
      if (
        currentSub !== undefined &&
        isDeepStrictEqual(
          presetSubWithEngine(presetSubFromLegacy(current), current.assignmentEngine),
          nextSub,
        )
      ) {
        updated.sub = currentSub;
      } else if (!followsMain) {
        updated.sub = mergeLegacyPresetSub(currentSub, nextSub, keepModelFreeSub);
      }
      write(updated);
      return updated;
    },
    delete(id, expectedRevision) {
      if (id === DEFAULT_MODEL_PRESET_ID)
        throw new ModelPresetError(
          'default-preset-pinned',
          'The Default Model Preset cannot be deleted',
        );
      return port.transaction(
        (database) =>
          database
            .prepare(
              "DELETE FROM model_presets WHERE id = ? AND json_extract(body, '$.revision') = ?",
            )
            .run(id, expectedRevision).changes !== 0,
        ['model-presets'],
      );
    },
  };
}
