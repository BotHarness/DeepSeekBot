import { isDeepStrictEqual } from 'node:util';

import {
  cleanPresetSub,
  effectiveSubForMain,
  isPresetSub,
  planSubProjection,
  storedPlanSub,
  type PresetSub,
} from './preset-sub.js';
import {
  defaultPresetPlan,
  isPersonaBotModelPlan,
  type ModelPreset,
  type PersonaBotModelPlan,
} from './presets.js';

export type BotModelSlot = 'main' | 'sub';
export const BOT_MODEL_SLOTS: readonly BotModelSlot[] = ['main', 'sub'];

const MAIN_KEYS = ['orchestrator', 'orchestratorGroupId', 'orchestratorGroupEffort'] as const;
const SUB_KEYS = [
  'sub',
  'assignmentDefault',
  'assignmentModels',
  'openAssignmentModels',
  'assignmentGroups',
  'assignmentDefaultGroupId',
  'assignmentGroupOptions',
] as const;

export type BotMainOverride = Pick<PersonaBotModelPlan, (typeof MAIN_KEYS)[number]>;
export type BotSubOverride = Pick<PersonaBotModelPlan, (typeof SUB_KEYS)[number]>;

export interface BotModelLink {
  presetId: string;
  linkedAt: string;
  main?: BotMainOverride;
  sub?: BotSubOverride;
}

function pick<K extends string>(source: Record<string, unknown>, keys: readonly K[]) {
  const result: Record<string, unknown> = {};
  for (const key of keys) if (source[key] !== undefined) result[key] = structuredClone(source[key]);
  return result as Partial<Record<K, unknown>>;
}

function omit<T extends object>(source: T, keys: readonly string[]): T {
  const result = { ...source } as Record<string, unknown>;
  for (const key of keys) delete result[key];
  return result as T;
}

export function mainOverrideOf(plan: BotMainOverride): BotMainOverride {
  return pick(plan as unknown as Record<string, unknown>, MAIN_KEYS) as BotMainOverride;
}

export function subOverrideOf(plan: BotSubOverride): BotSubOverride {
  return pick(plan as unknown as Record<string, unknown>, SUB_KEYS) as BotSubOverride;
}

export function withPlanSub(plan: PersonaBotModelPlan, input: PresetSub): PersonaBotModelPlan {
  const kept = omit(plan, SUB_KEYS);
  const sub = cleanPresetSub(input);
  const { assignmentGroupOptions, ...projection } = planSubProjection(sub, kept);
  return {
    ...kept,
    ...projection,
    ...(assignmentGroupOptions === undefined || assignmentGroupOptions.length === 0
      ? {}
      : { assignmentGroupOptions }),
    sub,
  };
}

export function resolveLinkedPlan(
  preset: ModelPreset,
  link: BotModelLink,
  revision: number,
): PersonaBotModelPlan {
  const base = defaultPresetPlan(preset);
  let plan: PersonaBotModelPlan = {
    ...base,
    revision: Math.max(1, revision),
    sourcePresetId: preset.id,
    sourcePresetName: preset.name,
    appliedAt: link.linkedAt,
  };
  if (link.main !== undefined) {
    plan = { ...omit(plan, MAIN_KEYS), ...structuredClone(link.main) };
  }
  if (link.sub !== undefined) {
    plan = { ...omit(plan, SUB_KEYS), ...structuredClone(link.sub) };
    if (link.sub.sub?.default === null) plan = withPlanSub(plan, link.sub.sub);
  }
  const overrides = BOT_MODEL_SLOTS.filter((slot) => link[slot] !== undefined);
  return overrides.length === 0 ? plan : { ...plan, overrides };
}

export function resolveOwnSlots(
  link: BotModelLink,
  revision: number,
): PersonaBotModelPlan | undefined {
  if (link.main === undefined) return undefined;
  let plan: PersonaBotModelPlan = {
    revision: Math.max(1, revision),
    sourcePresetId: '',
    sourcePresetName: '',
    appliedAt: link.linkedAt,
    ...structuredClone(link.main),
    ...structuredClone(link.sub ?? {}),
  };
  if (link.sub?.sub?.default === null) plan = withPlanSub(plan, link.sub.sub);
  return { ...plan, overrides: BOT_MODEL_SLOTS.filter((slot) => link[slot] !== undefined) };
}

function sameMain(left: BotMainOverride, right: BotMainOverride): boolean {
  if (left.orchestratorGroupId !== undefined || right.orchestratorGroupId !== undefined)
    return (
      left.orchestratorGroupId === right.orchestratorGroupId &&
      left.orchestratorGroupEffort === right.orchestratorGroupEffort
    );
  return isDeepStrictEqual(
    pick(left.orchestrator as unknown as Record<string, unknown>, [
      'provider',
      'model',
      'reasoningEffort',
    ]),
    pick(right.orchestrator as unknown as Record<string, unknown>, [
      'provider',
      'model',
      'reasoningEffort',
    ]),
  );
}

function sameSub(plan: PersonaBotModelPlan, base: PersonaBotModelPlan): boolean {
  if ((plan.openAssignmentModels === true) !== (base.openAssignmentModels === true)) return false;
  if (plan.assignmentDefault === undefined) return true;
  const own = storedPlanSub(plan);
  const preset = storedPlanSub(base);
  if (own.default === null && preset.default === null) return true;
  return isDeepStrictEqual(
    cleanPresetSub(effectiveSubForMain(plan, own)),
    cleanPresetSub(effectiveSubForMain(base, preset)),
  );
}

export function linkFromCopiedPlan(
  plan: PersonaBotModelPlan,
  preset: ModelPreset,
  linkedAt: string,
): BotModelLink {
  const base = resolveLinkedPlan(preset, { presetId: preset.id, linkedAt }, plan.revision);
  return {
    presetId: preset.id,
    linkedAt: plan.appliedAt || linkedAt,
    ...(sameMain(plan, base) ? {} : { main: mainOverrideOf(plan) }),
    ...(sameSub(plan, base) ? {} : { sub: subOverrideOf(plan) }),
  };
}

export function isBotModelLink(value: unknown): value is BotModelLink {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const link = value as Record<string, unknown>;
  if (
    typeof link['presetId'] !== 'string' ||
    link['presetId'].trim() === '' ||
    typeof link['linkedAt'] !== 'string'
  )
    return false;
  const probe = {
    revision: 1,
    sourcePresetId: link['presetId'],
    sourcePresetName: '',
    appliedAt: link['linkedAt'],
    orchestrator: { provider: 'probe', model: 'probe' },
  };
  const main = link['main'];
  if (main !== undefined && !isPersonaBotModelPlan({ ...probe, ...(main as object) })) return false;
  const sub = link['sub'] as Record<string, unknown> | undefined;
  if (sub !== undefined) {
    if (typeof sub !== 'object' || sub === null) return false;
    if (sub['sub'] !== undefined && !isPresetSub(sub['sub'])) return false;
    if (!isPersonaBotModelPlan({ ...probe, ...sub })) return false;
  }
  return true;
}

export function cloneBotModelLink(link: BotModelLink): BotModelLink {
  return structuredClone(link);
}
