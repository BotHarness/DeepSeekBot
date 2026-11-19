import { readFile } from 'node:fs/promises';
export { MODELS_USAGE_OPTIONS } from './cli-option-spec.js';
import { resolveBotDm } from './cli-bot-dm.js';
import type { ModelFavorite } from '../models/favorites.js';
import { isEngineId } from '../engines/engine-session.js';
import type {
  ModelPreset,
  ModelPresetEngine,
  ModelPresetEngineInput,
  ModelRoute,
} from '../models/presets.js';
import type { ModelPlanState } from '../models/readiness.js';
import type { RoutingGroup } from '../models/routing-groups.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { isUsageOverviewPeriod, usageOverviewPeriods } from '../usage/overview.js';

type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

export const MODELS_USAGE_COMMANDS = [
  { command: 'model-providers', description: 'list API key providers and their revisions' },
  {
    command: 'model-provider-add',
    description:
      'add an API key provider (--template, --name, --key-stdin or --key-file, --expected-revision)',
  },
  {
    command: 'model-provider-edit',
    description: 'rename or replace the key of an API key provider at its revision',
  },
  {
    command: 'model-provider-remove',
    description: 'remove an unused API key provider at its revision (--confirm)',
  },
  {
    command: 'home-model-set',
    description:
      'set the Host default model (--provider and --model, or --group <routing-group-id>; --orchestrator-effort; --expected-revision)',
  },
  {
    command: 'model-catalog',
    description: 'list the models the Host can run, with the default',
  },
  {
    command: 'model-favorite-add',
    description:
      'star a model (<provider>/<model>), a Model Route Group (group:<id>) or a Model Preset (preset:<id>) for you on every device',
  },
  {
    command: 'model-favorite-remove',
    description:
      'unstar a model (<provider>/<model>), a Model Route Group (group:<id>) or a Model Preset (preset:<id>)',
  },
  {
    command: 'model-plan-set',
    description: "replace a Bot's whole model plan with JSON from stdin",
  },
  {
    command: 'model-plan-customize',
    description: "change only a Bot's Orchestrator model, keeping its Assignment models",
  },
  {
    command: 'model-plan-inherit',
    description: "drop a Bot's own model so it follows the Profile default model",
  },
  {
    command: 'model-plan-assignments-set',
    description: "set a Bot's Assignment default and allowed Assignment models from stdin",
  },
  {
    command: 'model-preset-update',
    description: 'rename or change the routes of a Model Preset',
  },
  {
    command: 'model-preset-delete',
    description: 'delete a Model Preset at its revision and keep applied Bot plans (--confirm)',
  },
  {
    command: 'model-groups',
    description:
      'list Routing Groups and their ordered model, Routing Group and Subscription Engine members',
  },
  {
    command: 'model-group',
    description: 'read one Routing Group and the DSH model routes it expands to, in order',
  },
  {
    command: 'model-group-create',
    description: 'create a Routing Group (--name, members JSON from --members-stdin)',
  },
  {
    command: 'model-group-update',
    description: 'rename a Routing Group or replace its members at its revision',
  },
  {
    command: 'model-group-delete',
    description: 'delete a Routing Group that no Bot or group uses',
  },
  {
    command: 'overview-usage',
    description: 'read token usage per Bot for today or this week (Overview page)',
  },
  {
    command: 'overview-memory',
    description: 'read Memory activity per Bot (Overview page)',
  },
  {
    command: 'activity-overview',
    description: 'read what every Bot is doing right now',
  },
  {
    command: 'channel-activity-today',
    description: "read today's message activity per Channel",
  },
  {
    command: 'bot-usage',
    description: "read a Bot's token usage by day, model and purpose for a date range",
  },
  {
    command: 'bot-session-usage',
    description: "read a Bot's token usage per Session and Assignment",
  },
  {
    command: 'bot-activity-history',
    description: "read a Bot's activity calendar by day over recent weeks",
  },
  {
    command: 'group-activity',
    description: "read a group Channel's activity per member Bot",
  },
] as const;

export interface ModelsUsageValues {
  'orchestrator-engine'?: string;
  'orchestrator-engine-model'?: string;
  'orchestrator-engine-effort'?: string;
  'assignment-engine'?: string;
  'assignment-engine-model'?: string;
  'assignment-engine-effort'?: string;
  name?: string;
  template?: string;
  endpoint?: string;
  'key-stdin'?: boolean;
  'key-file'?: string;
  confirm?: boolean;
  'orchestrator-provider'?: string;
  'orchestrator-model'?: string;
  'orchestrator-effort'?: string;
  'assignment-provider'?: string;
  'assignment-model'?: string;
  'assignment-effort'?: string;
  'expected-revision'?: string;
  'plan-stdin'?: boolean;
  'assignment-models'?: string;
  'members-stdin'?: boolean;
  'orchestrator-group'?: string;
  group?: string;
  'assignment-groups'?: string;
  'assignment-default-group'?: string;
  period?: string;
  after?: string;
  start?: string;
  end?: string;
  model?: string;
  provider?: string;
  purpose?: string;
  before?: string;
  weeks?: string;
}

const NO_TARGET = new Set([
  'model-providers',
  'model-provider-add',
  'home-model-set',
  'model-catalog',
  'model-groups',
  'model-group-create',
  'overview-usage',
  'overview-memory',
  'activity-overview',
  'channel-activity-today',
]);
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function favoriteChoice(target: string): ModelFavorite {
  if (target.startsWith('group:')) {
    const id = target.slice('group:'.length).trim();
    if (!id) usage('group:<id> needs a nonempty Model Route Group id.');
    return { kind: 'group', id };
  }
  if (target.startsWith('preset:')) {
    const id = target.slice('preset:'.length).trim();
    if (!id) usage('preset:<id> needs a nonempty Model Preset id.');
    return { kind: 'preset', id };
  }
  const slash = target.indexOf('/');
  const provider = slash < 0 ? '' : target.slice(0, slash).trim();
  const model = slash < 0 ? '' : target.slice(slash + 1).trim();
  if (!provider || !model)
    usage('Name a model as <provider>/<model>, a group as group:<id>, or a preset as preset:<id>.');
  return { kind: 'model', provider, model };
}

function revision(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed))
    usage('--expected-revision must be a nonnegative integer.');
  return parsed;
}

function cursor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.length > 255) usage('--after must be 1–255 characters.');
  return value;
}

function day(value: string | undefined, flag: string): string | undefined {
  if (value === undefined) return undefined;
  if (!DAY.test(value)) usage(`--${flag} must be a YYYY-MM-DD day.`);
  return value;
}

async function membersInput(io: BotCreateCliIo, values: ModelsUsageValues): Promise<unknown[]> {
  if (!values['members-stdin'])
    usage('Pass the members as JSON on stdin with --members-stdin: {"members":[...]}.');
  let input: unknown;
  try {
    input = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
  } catch {
    usage('Members stdin must be one JSON object.');
  }
  const members =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)['members']
      : undefined;
  if (!Array.isArray(members) || Object.keys(input as object).length !== 1)
    usage(
      'Members stdin must be {"members":[...]} with model, Routing Group or engine member objects.',
    );
  return members;
}

async function planInput(
  io: BotCreateCliIo,
  values: ModelsUsageValues,
  keys: readonly string[],
  required: readonly string[],
): Promise<Record<string, unknown>> {
  if (!values['plan-stdin']) usage('This command reads its plan JSON with --plan-stdin.');
  let input: unknown;
  try {
    input = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
  } catch {
    usage('Plan stdin must be one JSON object.');
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    usage('Plan stdin must be one JSON object.');
  const plan = input as Record<string, unknown>;
  const extra = Object.keys(plan).filter((key) => !keys.includes(key));
  if (extra.length > 0) usage(`Plan stdin accepts only ${keys.join(', ')}.`);
  const missing = required.filter((key) => plan[key] === undefined);
  if (missing.length > 0) usage(`Plan stdin requires ${missing.join(', ')}.`);
  return plan;
}

export function presetEngineFlags(
  values: ModelsUsageValues,
  update = false,
): ModelPresetEngineInput {
  const read = (role: 'orchestrator' | 'assignment'): ModelPresetEngine | null | undefined => {
    const engine = values[`${role}-engine`]?.trim();
    const model = values[`${role}-engine-model`]?.trim();
    const effort = values[`${role}-engine-effort`]?.trim();
    if (engine === undefined && model === undefined && effort === undefined) return undefined;
    if (update && engine === 'none' && model === undefined && effort === undefined) return null;
    if (!isEngineId(engine) || model === '' || effort === '')
      usage(
        `--${role}-engine must be codex or claude${update ? ' (or none to clear)' : ''}; model and effort must be nonempty.`,
      );
    return {
      engine,
      ...(model === undefined ? {} : { model }),
      ...(effort === undefined ? {} : { effort }),
    };
  };
  const orchestratorEngine = read('orchestrator');
  const assignmentEngine = read('assignment');
  return {
    ...(orchestratorEngine === undefined ? {} : { orchestratorEngine }),
    ...(assignmentEngine === undefined ? {} : { assignmentEngine }),
  };
}

export function presetGroupFlags(values: {
  'orchestrator-group'?: string | undefined;
  'assignment-groups'?: string | undefined;
  'assignment-default-group'?: string | undefined;
}): {
  orchestratorGroupId?: string | null;
  assignmentGroups?: string[];
  assignmentDefaultGroupId?: string | null;
} {
  const orchestrator = values['orchestrator-group'];
  const list = values['assignment-groups'];
  const defaultId = values['assignment-default-group'];
  return {
    ...(orchestrator === undefined ? {} : { orchestratorGroupId: orchestrator.trim() || null }),
    ...(list === undefined
      ? {}
      : {
          assignmentGroups: list
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
        }),
    ...(defaultId === undefined ? {} : { assignmentDefaultGroupId: defaultId.trim() || null }),
  };
}

export function assignmentModelsMode(value: string | undefined): {
  openAssignmentModels?: boolean;
} {
  if (value === undefined) return {};
  if (value !== 'open' && value !== 'listed') usage('--assignment-models must be open or listed.');
  return { openAssignmentModels: value === 'open' };
}

function routeOverride(
  values: ModelsUsageValues,
  prefix: 'orchestrator' | 'assignment',
  current: ModelRoute,
): ModelRoute {
  const provider = values[`${prefix}-provider`]?.trim();
  const model = values[`${prefix}-model`]?.trim();
  const effort = values[`${prefix}-effort`]?.trim();
  for (const [flag, value] of [
    ['provider', provider],
    ['model', model],
    ['effort', effort],
  ] as const)
    if (value === '') usage(`--${prefix}-${flag} must not be empty.`);
  const next = {
    provider: provider ?? current.provider,
    model: model ?? current.model,
  };
  const sameModel = next.provider === current.provider && next.model === current.model;
  const keptEffort = effort ?? (sameModel ? current.reasoningEffort : undefined);
  return keptEffort === undefined ? next : { ...next, reasoningEffort: keptEffort };
}

export function isModelsUsageCommand(command: string): boolean {
  return MODELS_USAGE_COMMANDS.some((entry) => entry.command === command);
}

export async function runModelsUsage(
  command: string,
  rest: string[],
  values: ModelsUsageValues,
  io: BotCreateCliIo,
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  const noTarget = NO_TARGET.has(command);
  if (rest.length !== (noTarget ? 0 : 1))
    usage(
      `${command} ${noTarget ? 'takes no positional arguments' : 'needs exactly one target id'}.`,
    );
  const target = rest[0]?.trim() ?? '';
  if (!noTarget && !target) usage(`${command} requires a nonempty target id.`);
  const expected = revision(values['expected-revision']);

  if (command === 'model-providers') return (await connect())('modelProviders', {});
  if (
    command === 'model-provider-add' ||
    command === 'model-provider-edit' ||
    command === 'model-provider-remove'
  ) {
    if (expected === undefined) usage('Provide --expected-revision from model-providers.');
    if (command === 'model-provider-remove') {
      if (values.confirm !== true) usage('Add --confirm to remove the provider.');
      return (await connect())('modelProviderRemove', { id: target, expectedRevision: expected });
    }
    const name = values.name?.trim();
    if (values.name !== undefined && !name) usage('--name must not be empty.');
    if (values['key-stdin'] && values['key-file'] !== undefined)
      usage('Choose one key input: --key-stdin or --key-file.');
    let key: string | undefined;
    try {
      if (values['key-stdin']) key = ((await io.readStdin?.()) ?? '').trim();
      if (values['key-file'] !== undefined)
        key = (await readFile(values['key-file'], 'utf8')).trim();
    } catch {
      usage('Could not read the API key.');
    }
    if (key === '') usage('The API key input is empty.');
    if (command === 'model-provider-edit') {
      if (name === undefined && key === undefined) usage('Provide a name or an API key input.');
      return (await connect())('modelProviderEdit', {
        id: target,
        expectedRevision: expected,
        ...(name === undefined ? {} : { name }),
        ...(key === undefined ? {} : { key }),
      });
    }
    const template = values.template;
    if (template !== 'opencode-go' && template !== 'deepseek' && template !== 'custom')
      usage('Choose --template opencode-go, deepseek or custom.');
    if (name === undefined || key === undefined) usage('Provide a name and an API key input.');
    if (template === 'custom' && (!values.endpoint || !values.model))
      usage('The custom template requires --endpoint and --model.');
    return (await connect())('modelProviderAdd', {
      template,
      name,
      key,
      expectedRevision: expected,
      ...(template === 'custom' ? { endpoint: values.endpoint, model: values.model } : {}),
    });
  }

  if (command === 'home-model-set') {
    const group = values.group?.trim();
    if (values.group !== undefined && !group) usage('--group must not be empty.');
    if (group && (values.provider !== undefined || values.model !== undefined))
      usage('Use either --group or --provider/--model.');
    if (!group && (!values.provider || !values.model))
      usage('home-model-set requires --provider and --model, or --group.');
    const rpc = await connect();
    const catalog =
      expected === undefined
        ? await rpc<{ defaultRevision?: number; defaultGroupRevision?: number }>('modelCatalog', {})
        : {};
    const expectedDefaultRevision = expected ?? catalog.defaultRevision;
    if (!Number.isSafeInteger(expectedDefaultRevision) || Number(expectedDefaultRevision) < 0)
      throw new CliLiveError(
        'settings-unavailable',
        'The Host does not expose its native default model revision.',
      );
    return rpc('onboardingModel', {
      expectedRevision: 0,
      expectedDefaultRevision,
      ...(catalog.defaultGroupRevision === undefined
        ? {}
        : { expectedDefaultGroupRevision: catalog.defaultGroupRevision }),
      ...(group
        ? {
            groupId: group,
            ...(values['orchestrator-effort']
              ? { groupEffort: values['orchestrator-effort'] }
              : {}),
          }
        : {
            route: {
              provider: values.provider,
              model: values.model,
              ...(values['orchestrator-effort']
                ? { reasoningEffort: values['orchestrator-effort'] }
                : {}),
            },
          }),
      globalDefault: true,
    });
  }
  if (command === 'model-catalog') return (await connect())('modelCatalog', {});
  if (command === 'model-favorite-add' || command === 'model-favorite-remove')
    return (await connect())('modelFavoriteSet', {
      choice: favoriteChoice(target),
      favorite: command === 'model-favorite-add',
    });
  if (command === 'activity-overview') return (await connect())('activityOverview', {});
  if (command === 'channel-activity-today') return (await connect())('channelActivityToday', {});
  if (command === 'overview-memory') {
    const after = cursor(values.after);
    return (await connect())('overviewMemory', after === undefined ? {} : { after });
  }
  if (command === 'overview-usage') {
    const period = values.period ?? 'today';
    if (!isUsageOverviewPeriod(period))
      usage(`--period must be one of ${usageOverviewPeriods.join(', ')}.`);
    const after = cursor(values.after);
    return (await connect())('overviewUsage', {
      period,
      ...(after === undefined ? {} : { after }),
    });
  }
  if (command === 'group-activity')
    return (await connect())('groupProfileActivity', { channelId: target });
  if (command === 'bot-session-usage') {
    const rpc = await connect();
    return rpc('profileSessionUsage', { channelId: await resolveBotDm(rpc, target) });
  }
  if (command === 'bot-activity-history') {
    const before = day(values.before, 'before');
    const weeks = values.weeks === undefined ? undefined : Number(values.weeks);
    if (weeks !== undefined && (!Number.isInteger(weeks) || weeks < 1 || weeks > 104))
      usage('--weeks must be an integer from 1 to 104.');
    const rpc = await connect();
    return rpc('profileActivity', {
      channelId: await resolveBotDm(rpc, target),
      ...(before === undefined ? {} : { before }),
      ...(weeks === undefined ? {} : { weeks }),
    });
  }
  if (command === 'bot-usage') {
    const start = day(values.start, 'start');
    const end = day(values.end, 'end');
    if (start === undefined || end === undefined) usage('bot-usage requires --start and --end.');
    const filter = {
      start,
      end,
      ...(values.model === undefined ? {} : { model: values.model }),
      ...(values.provider === undefined ? {} : { provider: values.provider }),
      ...(values.purpose === undefined ? {} : { purpose: values.purpose }),
    };
    const rpc = await connect();
    return rpc('profileUsage', {
      channelId: await resolveBotDm(rpc, target),
      filter,
    });
  }

  if (command === 'model-groups') return (await connect())('modelGroups', {});
  if (command === 'model-group') return (await connect())('modelGroup', { id: target });
  if (command === 'model-group-create') {
    const name = values.name?.trim();
    if (!name) usage('model-group-create requires --name.');
    const members = await membersInput(io, values);
    return (await connect())('modelGroupCreate', { name, members });
  }
  if (command === 'model-group-update') {
    const name = values.name?.trim();
    if (values.name !== undefined && !name) usage('--name must not be empty.');
    if (name === undefined && !values['members-stdin'])
      usage('model-group-update needs --name, --members-stdin or both.');
    const members = values['members-stdin'] ? await membersInput(io, values) : undefined;
    const rpc = await connect();
    const { group } = await rpc<{ group: RoutingGroup }>('modelGroup', { id: target });
    return rpc('modelGroupUpdate', {
      id: target,
      expectedRevision: expected ?? group.revision,
      name: name ?? group.name,
      members: members ?? group.members,
    });
  }
  if (command === 'model-group-delete') {
    const rpc = await connect();
    const expectedRevision =
      expected ?? (await rpc<{ group: RoutingGroup }>('modelGroup', { id: target })).group.revision;
    return rpc('modelGroupDelete', { id: target, expectedRevision });
  }
  if (command === 'model-plan-customize') {
    const group = values['orchestrator-group']?.trim();
    const provider = values['orchestrator-provider']?.trim();
    const model = values['orchestrator-model']?.trim();
    const effort = values['orchestrator-effort']?.trim();
    if (values['orchestrator-group'] !== undefined && !group)
      usage('--orchestrator-group must not be empty.');
    if (group && (provider || model))
      usage('Use either --orchestrator-group or --orchestrator-provider/--orchestrator-model.');
    if (!group && (!provider || !model))
      usage(
        '--orchestrator-provider and --orchestrator-model, or --orchestrator-group, are required.',
      );
    const rpc = await connect();
    const expectedRevision =
      expected ?? (await rpc<ModelPlanState>('modelPlan', { slug: target })).revision ?? 0;
    return rpc('modelPlanCustomize', {
      slug: target,
      expectedRevision,
      ...(group
        ? { orchestratorGroupId: group, ...(effort ? { orchestratorGroupEffort: effort } : {}) }
        : {
            orchestrator: {
              provider,
              model,
              ...(effort ? { reasoningEffort: effort } : {}),
            },
          }),
    });
  }
  if (command === 'model-plan-set' || command === 'model-plan-assignments-set') {
    const full = command === 'model-plan-set';
    const required = ['assignmentDefault', 'assignmentModels'];
    const plan = await planInput(
      io,
      values,
      [
        ...required,
        ...(full ? ['orchestrator', 'orchestratorGroupId', 'orchestratorGroupEffort'] : []),
        'assignmentGroups',
        'assignmentDefaultGroupId',
        'assignmentGroupOptions',
      ],
      required,
    );
    if (full && (plan['orchestrator'] == null) === (plan['orchestratorGroupId'] == null))
      usage('Plan stdin needs either orchestrator or orchestratorGroupId.');
    const mode = assignmentModelsMode(values['assignment-models']);
    const rpc = await connect();
    const expectedRevision =
      expected ?? (await rpc<ModelPlanState>('modelPlan', { slug: target })).revision ?? 0;
    const { orchestrator, orchestratorGroupId, ...rest } = plan;
    return rpc(full ? 'modelPlanSet' : 'modelPlanAssignmentsSet', {
      slug: target,
      expectedRevision,
      ...rest,
      ...(orchestrator == null ? {} : { orchestrator }),
      ...(orchestratorGroupId == null ? {} : { orchestratorGroupId }),
      ...mode,
    });
  }
  if (command === 'model-plan-inherit') {
    const rpc = await connect();
    const expectedRevision =
      expected ?? (await rpc<ModelPlanState>('modelPlan', { slug: target })).revision ?? 0;
    return rpc('modelPlanInherit', { slug: target, expectedRevision });
  }
  if (command === 'model-preset-delete') {
    if (values.confirm !== true) usage('Add --confirm to delete the Model Preset.');
    if (expected === undefined || expected < 1)
      usage('Provide --expected-revision from model-presets.');
    return (await connect())('modelPresetDelete', {
      id: target,
      expectedRevision: expected,
      confirmed: true,
    });
  }
  if (command === 'model-preset-update') {
    const engines = presetEngineFlags(values, true);
    const name = values.name?.trim();
    if (values.name !== undefined && !name) usage('--name must not be empty.');
    const plan = values['plan-stdin']
      ? await planInput(io, values, ['assignmentModels', 'assignmentGroupOptions'], [])
      : {};
    const mode = assignmentModelsMode(values['assignment-models']);
    const rpc = await connect();
    const { presets } = await rpc<{ presets: ModelPreset[] }>('modelPresets', {});
    const current = presets.find((preset) => preset.id === target);
    if (current === undefined)
      throw new CliLiveError(
        'unknown-preset',
        'The specified Model Preset does not exist on this Host.',
      );
    const flags = presetGroupFlags(values);
    const routeGiven = ['provider', 'model'].some(
      (part) => values[`orchestrator-${part}` as 'orchestrator-provider'] !== undefined,
    );
    const effortGiven = values['orchestrator-effort'] !== undefined;
    if (routeGiven && flags.orchestratorGroupId)
      usage('Use either --orchestrator-group or --orchestrator-provider/--orchestrator-model.');
    const orchestratorGroupId =
      'orchestratorGroupId' in flags
        ? flags.orchestratorGroupId
        : routeGiven || (effortGiven && current.orchestratorGroupId === undefined)
          ? null
          : (current.orchestratorGroupId ?? null);
    const orchestratorGroupEffort = !orchestratorGroupId
      ? null
      : effortGiven
        ? values['orchestrator-effort']!.trim() || null
        : orchestratorGroupId === current.orchestratorGroupId
          ? (current.orchestratorGroupEffort ?? null)
          : null;
    const assignmentGroups = flags.assignmentGroups ?? current.assignmentGroups ?? [];
    const assignmentDefaultGroupId =
      'assignmentDefaultGroupId' in flags
        ? flags.assignmentDefaultGroupId
        : (current.assignmentDefaultGroupId ?? null);
    if (assignmentDefaultGroupId && !assignmentGroups.includes(assignmentDefaultGroupId))
      usage('--assignment-default-group must be one of the Assignment Routing Groups.');
    return rpc('modelPresetUpdate', {
      id: target,
      expectedRevision: expected ?? current.revision,
      name: name ?? current.name,
      ...(orchestratorGroupId
        ? {}
        : { orchestrator: routeOverride(values, 'orchestrator', current.orchestrator) }),
      assignmentDefault: routeOverride(values, 'assignment', current.assignmentDefault),
      orchestratorGroupId,
      orchestratorGroupEffort,
      assignmentGroups,
      assignmentDefaultGroupId,
      ...engines,
      ...plan,
      ...mode,
    });
  }
  return usage(`Unsupported models or usage command ${command}.`);
}
