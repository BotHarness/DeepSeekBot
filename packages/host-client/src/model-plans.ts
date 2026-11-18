import { HostAnswerInvalid, record, some, text, type HostCall } from './host-answer';
import { parseModelCatalog, type ModelCatalogAnswer } from './model-catalog';

export interface ModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface AssignmentModelOption {
  provider: string;
  model: string;
  allowedEfforts: string[];
  defaultEffort: string;
  note?: string;
}

export interface AssignmentGroupOption {
  group: string;
  allowedEfforts?: string[];
  defaultEffort?: string;
  note?: string;
}

export interface ModelPlanGroups {
  orchestratorGroupId?: string;
  assignmentGroups?: string[];
  assignmentDefaultGroupId?: string;
  assignmentGroupOptions?: AssignmentGroupOption[];
  openAssignmentModels?: true;
}

export interface ModelPlan extends ModelPlanGroups {
  revision: number;
  sourcePresetId: string;
  sourcePresetName: string;
  orchestrator: ModelRoute;
  assignmentDefault?: ModelRoute;
  assignmentModels?: AssignmentModelOption[];
  openAssignmentModels?: true;
  appliedAt?: string;
}

export interface ModelPreset extends ModelPlanGroups {
  id: string;
  name: string;
  revision: number;
  orchestrator: ModelRoute;
  assignmentDefault: ModelRoute;
  assignmentModels?: AssignmentModelOption[];
  openAssignmentModels?: true;
  createdAt?: string;
}

export interface ModelPlanState {
  revision?: number;
  plan?: ModelPlan;
  repair?: {
    code: 'legacy-ambiguous' | 'legacy-missing' | 'route-unavailable';
    message: string;
    legacyModel?: string;
  };
}

const REPAIRS = ['legacy-ambiguous', 'legacy-missing', 'route-unavailable'] as const;

export function parseModelRoute(value: unknown): ModelRoute | undefined {
  const row = record(value);
  if (!text(row?.['provider']) || !text(row['model'])) return undefined;
  return {
    provider: row['provider'],
    model: row['model'],
    ...(text(row['reasoningEffort']) ? { reasoningEffort: row['reasoningEffort'] } : {}),
  };
}

function assignmentOption(value: unknown): AssignmentModelOption | undefined {
  const row = record(value);
  if (
    !text(row?.['provider']) ||
    !text(row['model']) ||
    !Array.isArray(row['allowedEfforts']) ||
    !text(row['defaultEffort'])
  )
    return undefined;
  return {
    provider: row['provider'],
    model: row['model'],
    allowedEfforts: row['allowedEfforts'].filter(text),
    defaultEffort: row['defaultEffort'],
    ...(text(row['note']) ? { note: row['note'] } : {}),
  };
}

function groupOption(value: unknown): AssignmentGroupOption | undefined {
  const row = record(value);
  if (!text(row?.['group'])) return undefined;
  const efforts = row['allowedEfforts'];
  return {
    group: row['group'],
    ...(Array.isArray(efforts) && efforts.every(text) ? { allowedEfforts: [...efforts] } : {}),
    ...(text(row['defaultEffort']) ? { defaultEffort: row['defaultEffort'] } : {}),
    ...(text(row['note']) ? { note: row['note'] } : {}),
  };
}

function planGroups(row: Record<string, unknown>): ModelPlanGroups {
  const ids = Array.isArray(row['assignmentGroups']) ? row['assignmentGroups'].filter(text) : [];
  const options = some(row['assignmentGroupOptions'], groupOption);
  return {
    ...(text(row['orchestratorGroupId'])
      ? { orchestratorGroupId: row['orchestratorGroupId'] }
      : {}),
    ...(ids.length === 0 ? {} : { assignmentGroups: ids }),
    ...(text(row['assignmentDefaultGroupId']) && ids.includes(row['assignmentDefaultGroupId'])
      ? { assignmentDefaultGroupId: row['assignmentDefaultGroupId'] }
      : {}),
    ...(options.length === 0 ? {} : { assignmentGroupOptions: options }),
    ...(row['openAssignmentModels'] === true ? { openAssignmentModels: true as const } : {}),
  };
}

function assignmentModels(value: unknown): {
  assignmentModels?: AssignmentModelOption[];
} {
  return Array.isArray(value) ? { assignmentModels: some(value, assignmentOption) } : {};
}

export function parseModelPlan(value: unknown): ModelPlan | undefined {
  const row = record(value);
  const orchestrator = parseModelRoute(row?.['orchestrator']);
  const assignmentDefault = parseModelRoute(row?.['assignmentDefault']);
  if (
    row === undefined ||
    orchestrator === undefined ||
    typeof row['revision'] !== 'number' ||
    (row['assignmentDefault'] !== undefined && assignmentDefault === undefined)
  )
    return undefined;
  return {
    revision: row['revision'],
    sourcePresetId: text(row['sourcePresetId']) ? row['sourcePresetId'] : '',
    sourcePresetName: text(row['sourcePresetName']) ? row['sourcePresetName'] : '',
    orchestrator,
    ...planGroups(row),
    ...(assignmentDefault === undefined ? {} : { assignmentDefault }),
    ...assignmentModels(row['assignmentModels']),
    ...(text(row['appliedAt']) ? { appliedAt: row['appliedAt'] } : {}),
  };
}

export function parseModelPreset(value: unknown): ModelPreset | undefined {
  const row = record(value);
  const orchestrator = parseModelRoute(row?.['orchestrator']);
  const assignmentDefault = parseModelRoute(row?.['assignmentDefault']);
  if (
    !text(row?.['id']) ||
    !text(row['name']) ||
    typeof row['revision'] !== 'number' ||
    orchestrator === undefined ||
    assignmentDefault === undefined
  )
    return undefined;
  return {
    id: row['id'],
    name: row['name'],
    revision: row['revision'],
    orchestrator,
    assignmentDefault,
    ...assignmentModels(row['assignmentModels']),
    ...planGroups(row),
    ...(text(row['createdAt']) ? { createdAt: row['createdAt'] } : {}),
  };
}

function planAnswer(value: unknown, method: string): ModelPlan {
  const parsed = parseModelPlan(record(value)?.['plan']);
  if (parsed === undefined) throw new HostAnswerInvalid(`${method} returned no Model Plan.`);
  return parsed;
}

function presetAnswer(value: unknown, method: string): ModelPreset {
  const parsed = parseModelPreset(record(value)?.['preset']);
  if (parsed === undefined) throw new HostAnswerInvalid(`${method} returned no Model Preset.`);
  return parsed;
}

function revisionAnswer(value: unknown, method: string): { revision: number } {
  const revision = record(value)?.['revision'];
  if (typeof revision !== 'number') throw new HostAnswerInvalid(`${method} returned no revision.`);
  return { revision };
}

export async function loadModelCatalog(host: HostCall): Promise<ModelCatalogAnswer> {
  const value = await host.call('modelCatalog', {});
  if (!Array.isArray(record(value)?.['models']))
    throw new HostAnswerInvalid('modelCatalog returned no models.');
  return parseModelCatalog(value);
}

export async function loadModelPresets(host: HostCall): Promise<ModelPreset[]> {
  const presets = record(await host.call('modelPresets', {}))?.['presets'];
  if (!Array.isArray(presets)) throw new HostAnswerInvalid('modelPresets returned no list.');
  return some(presets, parseModelPreset);
}

export async function loadModelPlanState(host: HostCall, slug: string): Promise<ModelPlanState> {
  const value = record(await host.call('modelPlan', { slug }));
  if (value === undefined) throw new HostAnswerInvalid('modelPlan returned no answer.');
  const plan = parseModelPlan(value['plan']);
  if (value['plan'] !== undefined && plan === undefined)
    throw new HostAnswerInvalid('modelPlan returned an unreadable Model Plan.');
  const repair = record(value['repair']);
  const code = repair?.['code'];
  return {
    ...(typeof value['revision'] === 'number' ? { revision: value['revision'] } : {}),
    ...(plan === undefined ? {} : { plan }),
    ...(repair !== undefined && REPAIRS.some((known) => known === code)
      ? {
          repair: {
            code: code as (typeof REPAIRS)[number],
            message: text(repair['message']) ? repair['message'] : '',
            ...(text(repair['legacyModel']) ? { legacyModel: repair['legacyModel'] } : {}),
          },
        }
      : {}),
  };
}

export async function customizeModelPlan(
  host: HostCall,
  slug: string,
  change: { orchestrator: ModelRoute } | { orchestratorGroupId: string },
  expectedRevision?: number,
): Promise<ModelPlan> {
  return planAnswer(
    await host.call('modelPlanCustomize', {
      slug,
      ...change,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }),
    'modelPlanCustomize',
  );
}

export async function applyModelPreset(
  host: HostCall,
  slug: string,
  presetId: string,
): Promise<ModelPlan> {
  return planAnswer(await host.call('modelPresetApply', { slug, presetId }), 'modelPresetApply');
}

export interface ModelRoutes {
  orchestrator: ModelRoute;
  assignmentDefault: ModelRoute;
  assignmentModels: AssignmentModelOption[];
  openAssignmentModels?: boolean;
}

export interface ModelPlanGroupsInput {
  orchestratorGroupId?: string | null;
  assignmentGroups?: string[];
  assignmentDefaultGroupId?: string | null;
  assignmentGroupOptions?: AssignmentGroupOption[];
}

export type ModelPlanInput = Omit<ModelRoutes, 'orchestrator'> & {
  orchestrator?: ModelRoute;
} & ModelPlanGroupsInput;

function routes(input: Partial<ModelRoutes> & ModelPlanGroupsInput): Record<string, unknown> {
  return {
    ...(input.orchestrator === undefined ? {} : { orchestrator: input.orchestrator }),
    ...(input.orchestratorGroupId === undefined
      ? {}
      : { orchestratorGroupId: input.orchestratorGroupId }),
    ...(input.assignmentGroups === undefined ? {} : { assignmentGroups: input.assignmentGroups }),
    ...(input.assignmentDefaultGroupId === undefined
      ? {}
      : { assignmentDefaultGroupId: input.assignmentDefaultGroupId }),
    ...(input.assignmentGroupOptions === undefined
      ? {}
      : { assignmentGroupOptions: input.assignmentGroupOptions }),
    assignmentDefault: input.assignmentDefault,
    ...(input.assignmentModels === undefined ? {} : { assignmentModels: input.assignmentModels }),
    ...(input.openAssignmentModels === undefined
      ? {}
      : { openAssignmentModels: input.openAssignmentModels }),
  };
}

export async function setModelPlan(
  host: HostCall,
  slug: string,
  expectedRevision: number,
  input: ModelPlanInput,
): Promise<ModelPlan> {
  return planAnswer(
    await host.call('modelPlanSet', {
      slug,
      expectedRevision,
      ...routes(input),
    }),
    'modelPlanSet',
  );
}

export type ModelPresetInput = Pick<ModelRoutes, 'assignmentDefault'> &
  Partial<Pick<ModelRoutes, 'orchestrator' | 'assignmentModels' | 'openAssignmentModels'>> &
  ModelPlanGroupsInput & {
    name: string;
  };

export async function createModelPreset(
  host: HostCall,
  input: ModelPresetInput,
): Promise<ModelPreset> {
  return presetAnswer(
    await host.call('modelPresetCreate', {
      name: input.name,
      ...routes(input),
    }),
    'modelPresetCreate',
  );
}

export async function updateModelPreset(
  host: HostCall,
  id: string,
  expectedRevision: number,
  input: ModelPresetInput,
): Promise<ModelPreset> {
  return presetAnswer(
    await host.call('modelPresetUpdate', {
      id,
      expectedRevision,
      name: input.name,
      ...routes(input),
    }),
    'modelPresetUpdate',
  );
}

export async function inheritModelPlan(
  host: HostCall,
  slug: string,
  expectedRevision: number,
): Promise<{ revision: number }> {
  return revisionAnswer(
    await host.call('modelPlanInherit', { slug, expectedRevision }),
    'modelPlanInherit',
  );
}

export async function setOnboardingModel(
  host: HostCall,
  input: {
    slug?: string;
    expectedRevision: number;
    expectedDefaultRevision?: number;
    expectedDefaultGroupRevision?: number;
    route?: ModelRoute;
    groupId?: string;
    globalDefault: boolean;
  },
): Promise<{ revision: number; groupRevision?: number }> {
  const answer = await host.call('onboardingModel', { ...input });
  const groupRevision = record(answer)?.['groupRevision'];
  return {
    ...revisionAnswer(answer, 'onboardingModel'),
    ...(typeof groupRevision === 'number' ? { groupRevision } : {}),
  };
}
