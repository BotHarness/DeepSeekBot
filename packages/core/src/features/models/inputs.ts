import { invalidInput } from '../../bridge/method-utils.js';
import { isPresetSub, type PresetSub } from '../../models/preset-sub.js';
import {
  isAssignmentGroupOption,
  isModelPresetEngine,
  type ModelPresetEngineInput,
  type AssignmentGroupOption,
  type ModelPresetGroups,
} from '../../models/presets.js';
import {
  isRoutingGroupMember,
  ROUTING_GROUP_MEMBER_SHAPES,
  RoutingGroupError,
  type RoutingGroupInput,
} from '../../models/routing-groups.js';

export function routingGroupInput(source: Record<string, unknown>): RoutingGroupInput {
  const name = source['name'];
  const members = source['members'];
  if (typeof name !== 'string' || !Array.isArray(members) || !members.every(isRoutingGroupMember))
    throw new RoutingGroupError(
      'invalid-input',
      `A name and members are required. Member shapes: ${ROUTING_GROUP_MEMBER_SHAPES}`,
    );
  return { name, members };
}

const PRESET_GROUP_KEYS = [
  'orchestratorGroupId',
  'orchestratorGroupEffort',
  'assignmentGroups',
  'assignmentDefaultGroupId',
  'assignmentGroupOptions',
] as const;

export const invalidSub = () =>
  invalidInput('Provide valid sub choices without legacy Assignment fields');

export function presetSubInput(source: Record<string, unknown>): PresetSub | 'invalid' | undefined {
  const sub = source['sub'];
  if (sub === undefined) return undefined;
  if (
    !isPresetSub(sub) ||
    [
      'assignmentDefault',
      'assignmentFollowsMain',
      'assignmentModels',
      'openAssignmentModels',
      'assignmentGroups',
      'assignmentDefaultGroupId',
      'assignmentGroupOptions',
      'assignmentEngine',
    ].some((key) => source[key] !== undefined)
  )
    return 'invalid';
  return sub;
}

export function presetGroupsInput(
  source: Record<string, unknown>,
):
  | { given: false }
  | { given: true; groups: ModelPresetGroups; optionsGiven?: true }
  | { given: true; invalid: true } {
  if (!PRESET_GROUP_KEYS.some((key) => key in source)) return { given: false };
  const orchestrator = source['orchestratorGroupId'] ?? undefined;
  const effort = source['orchestratorGroupEffort'] ?? undefined;
  const ids = source['assignmentGroups'] ?? [];
  const defaultId = source['assignmentDefaultGroupId'] ?? undefined;
  const options = assignmentGroupOptionsInput(source['assignmentGroupOptions'], ids);
  if (
    (orchestrator !== undefined && (typeof orchestrator !== 'string' || !orchestrator.trim())) ||
    (effort !== undefined &&
      (typeof effort !== 'string' || orchestrator === undefined || effort.trim() === '')) ||
    !Array.isArray(ids) ||
    !ids.every((id) => typeof id === 'string' && id.trim() !== '') ||
    new Set(ids).size !== ids.length ||
    (defaultId !== undefined && (typeof defaultId !== 'string' || !ids.includes(defaultId))) ||
    options === 'invalid'
  )
    return { given: true, invalid: true };
  return {
    given: true,
    groups: {
      ...(orchestrator === undefined ? {} : { orchestratorGroupId: orchestrator.trim() }),
      ...(effort === undefined ? {} : { orchestratorGroupEffort: effort.trim() }),
      ...(ids.length === 0 ? {} : { assignmentGroups: ids as string[] }),
      ...(defaultId === undefined ? {} : { assignmentDefaultGroupId: defaultId }),
      ...(options === undefined || options.length === 0 ? {} : { assignmentGroupOptions: options }),
    },
    ...(options === undefined ? {} : { optionsGiven: true }),
  };
}

export function assignmentGroupOptionsInput(
  value: unknown,
  ids: unknown,
): AssignmentGroupOption[] | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (
    !Array.isArray(value) ||
    !value.every(isAssignmentGroupOption) ||
    !Array.isArray(ids) ||
    !value.every((option) => ids.includes(option.group)) ||
    new Set(value.map((option) => option.group)).size !== value.length
  )
    return 'invalid';
  return value;
}

export function presetEnginesInput(source: Record<string, unknown>): ModelPresetEngineInput {
  const read = (key: keyof ModelPresetEngineInput) => {
    const value = source[key];
    if (value == null || isModelPresetEngine(value)) return value;
    throw new Error('Invalid Model Preset Subscription Engine');
  };
  const orchestratorEngine = read('orchestratorEngine');
  const assignmentEngine = read('assignmentEngine');
  return {
    ...(orchestratorEngine === undefined ? {} : { orchestratorEngine }),
    ...(assignmentEngine === undefined ? {} : { assignmentEngine }),
  };
}
