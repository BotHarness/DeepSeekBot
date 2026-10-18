import { parseAgentContent, TOB_CONTENT_COMMAND_USAGE } from './cli-agent-content.js';
import { parseAgentSchedules, TOB_AGENT_SCHEDULE_COMMAND_USAGE } from './cli-agent-schedules.js';
import { parseAgentMemory, TOB_MEMORY_COMMAND_USAGE } from './cli-agent-memory.js';

import {
  parseClientPreferences,
  parseHumanPreferences,
  CLIENT_PREFERENCE_USAGE,
} from './cli-client-preferences.js';
import { parseAgentDevices, TOB_AGENT_DEVICE_COMMAND_USAGE } from './cli-agent-devices.js';
import { parseAgentBackup, TOB_AGENT_BACKUP_USAGE } from './cli-agent-backup.js';
import { parseAgentMarketplace, TOB_MARKETPLACE_USAGE } from './cli-agent-marketplace.js';
import { parseBotTransfer, BOT_TRANSFER_USAGE } from './cli-bot-transfer.js';
import { parseAgentChannels, TOB_AGENT_CHANNEL_COMMAND_USAGE } from './cli-agent-channels.js';
import { parseAgentBots, TOB_AGENT_BOT_COMMAND_USAGE } from './cli-agent-bots.js';
import { parseAgentPolicies, TOB_AGENT_POLICY_COMMAND_USAGE } from './cli-agent-policies.js';
import { parseAgentImSetup, TOB_IM_SETUP_USAGE } from './cli-agent-im-setup.js';
import {
  isAssignmentModelOption,
  isModelRoute,
  validateAssignmentModels,
  type ModelRoute,
} from '../models/presets.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export interface AgentManagementInvocation {
  command: string;
  args: Record<string, unknown>;
  write: boolean;
  upload?: Uint8Array;
}

export const TOB_AGENT_COMMAND_USAGE: Readonly<Record<string, string>> = {
  ...TOB_CONTENT_COMMAND_USAGE,
  ...TOB_AGENT_SCHEDULE_COMMAND_USAGE,
  ...TOB_MEMORY_COMMAND_USAGE,
  ...TOB_AGENT_DEVICE_COMMAND_USAGE,
  ...TOB_AGENT_BACKUP_USAGE,
  ...TOB_AGENT_BOT_COMMAND_USAGE,
  ...CLIENT_PREFERENCE_USAGE,
  'human-name-set':
    'deepseekbot human-name-set (--name <text> | --clear) --expected-state <observed-fingerprint>; changes this Human/Profile default',
  'messaging-defaults':
    'deepseekbot messaging-defaults <feishu|slack|discord|weixin>; Host/Profile scope',
  'messaging-defaults-set':
    'deepseekbot messaging-defaults-set <platform> --input-stdin; same schema and expectedRevision as existing Human CLI',
  ...BOT_TRANSFER_USAGE,
  ...TOB_MARKETPLACE_USAGE,
  ...TOB_AGENT_CHANNEL_COMMAND_USAGE,
  ...TOB_AGENT_POLICY_COMMAND_USAGE,
  ...TOB_IM_SETUP_USAGE,
  list: 'deepseekbot list',
  'model-catalog': 'deepseekbot model-catalog',
  'model-plan': 'deepseekbot model-plan <bot-slug>',
  'model-presets': 'deepseekbot model-presets',
  'home-model-set':
    'deepseekbot home-model-set --provider <provider> --model <model> [--orchestrator-effort <effort>] --expected-revision <observed-Host-default-revision>',
  'model-plan-customize':
    'deepseekbot model-plan-customize <bot-slug> --orchestrator-provider <provider> --orchestrator-model <model> [--orchestrator-effort <effort>] --expected-revision <observed-Bot-plan-revision>',
  'model-plan-set':
    'deepseekbot model-plan-set <bot-slug> --expected-revision <observed-Bot-plan-revision> --plan-stdin; stdin JSON: {orchestrator:{provider,model,reasoningEffort?},assignmentDefault:{provider,model,reasoningEffort?},assignmentModels:[{provider,model,allowedEfforts:string[],defaultEffort,note?}]}',
  'model-plan-assignments-set':
    'deepseekbot model-plan-assignments-set <bot-slug> --expected-revision <observed-Bot-plan-revision> --plan-stdin; stdin JSON: {assignmentDefault:{provider,model,reasoningEffort?},assignmentModels:[{provider,model,allowedEfforts:string[],defaultEffort,note?}]}',
  'model-plan-inherit':
    'deepseekbot model-plan-inherit <bot-slug> --expected-revision <observed-Bot-plan-revision>',
  'model-preset-create':
    'deepseekbot model-preset-create --name <name> --orchestrator-provider <provider> --orchestrator-model <model> [--orchestrator-effort <effort>] --assignment-provider <provider> --assignment-model <model> [--assignment-effort <effort>] [--plan-stdin]; optional stdin JSON: {assignmentModels:[{provider,model,allowedEfforts:string[],defaultEffort,note?}]}',
  'model-preset-update':
    'deepseekbot model-preset-update <preset-id> --name <name> --orchestrator-provider <provider> --orchestrator-model <model> [--orchestrator-effort <effort>] --assignment-provider <provider> --assignment-model <model> [--assignment-effort <effort>] --expected-revision <observed-preset-revision> [--plan-stdin]; optional stdin JSON: {assignmentModels:[{provider,model,allowedEfforts:string[],defaultEffort,note?}]}',
  'model-preset-apply':
    'deepseekbot model-preset-apply <bot-slug> --preset <preset-id> --expected-revision <observed-Bot-plan-revision> --preset-revision <observed-preset-revision>',
  'telemetry-status': 'deepseekbot telemetry-status',
  'telemetry-set': 'deepseekbot telemetry-set (--enabled | --disabled)',
  'git-status': 'deepseekbot git-status',
  'git-install': 'deepseekbot git-install',
  'release-info': 'deepseekbot release-info [--since <version>]',
  'release-check': 'deepseekbot release-check',
  'release-install': 'deepseekbot release-install <version> --confirm',
  'release-restart': 'deepseekbot release-restart --confirm',
};

const ROUTE_FLAGS = [
  'orchestrator-provider',
  'orchestrator-model',
  'orchestrator-effort',
  'assignment-provider',
  'assignment-model',
  'assignment-effort',
];
const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  list: [],
  'model-catalog': [],
  'model-plan': [],
  'model-presets': [],
  'home-model-set': ['provider', 'model', 'orchestrator-effort', 'expected-revision'],
  'model-plan-customize': [
    'orchestrator-provider',
    'orchestrator-model',
    'orchestrator-effort',
    'expected-revision',
  ],
  'model-plan-set': ['plan-stdin', 'expected-revision'],
  'model-plan-assignments-set': ['plan-stdin', 'expected-revision'],
  'model-plan-inherit': ['expected-revision'],
  'model-preset-create': ['name', ...ROUTE_FLAGS, 'plan-stdin'],
  'model-preset-update': ['name', ...ROUTE_FLAGS, 'plan-stdin', 'expected-revision'],
  'model-preset-apply': ['preset', 'expected-revision', 'preset-revision'],
  'telemetry-status': [],
  'telemetry-set': ['enabled', 'disabled'],
  'git-status': [],
  'git-install': [],
  'release-info': ['since'],
  'release-check': [],
  'release-install': ['confirm'],
  'release-restart': ['confirm'],
};
const READS = new Set([
  'list',
  'model-catalog',
  'model-plan',
  'model-presets',
  'telemetry-status',
  'git-status',
  'release-info',
  'release-check',
]);
const TARGETS = new Set([
  'model-plan',
  'model-plan-customize',
  'model-plan-set',
  'model-plan-assignments-set',
  'model-plan-inherit',
  'model-preset-update',
  'model-preset-apply',
  'release-install',
]);

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
function required(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 512 ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    usage(
      `${field} requires a nonempty string of at most 512 characters without control characters.`,
    );
  return value.trim();
}
function revision(value: unknown, field = '--expected-revision', min = 0): number {
  if (typeof value !== 'string' || !/^\d+$/u.test(value))
    usage(`${field} is required and must be a nonnegative integer.`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min)
    usage(`${field} is outside the supported revision range.`);
  return result;
}
function record(
  value: unknown,
  keys: readonly string[],
  requiredKeys = keys,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    usage('Plan input must be a JSON object.');
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).some((key) => !keys.includes(key)) ||
    requiredKeys.some((key) => !Object.hasOwn(result, key))
  )
    usage('Plan input has unsupported or missing fields.');
  return result;
}
function checkedRoute(value: unknown): ModelRoute {
  const route = record(value, ['provider', 'model', 'reasoningEffort'], ['provider', 'model']);
  if (!isModelRoute(route)) usage('A valid provider/model route is required.');
  required(route.provider, 'provider');
  required(route.model, 'model');
  if (route.reasoningEffort !== undefined) required(route.reasoningEffort, 'reasoning effort');
  return route;
}
function routeFlags(
  values: Record<string, unknown>,
  prefix: 'orchestrator' | 'assignment',
): ModelRoute {
  const effort = values[`${prefix}-effort`];
  return checkedRoute({
    provider: required(values[`${prefix}-provider`], `--${prefix}-provider`),
    model: required(values[`${prefix}-model`], `--${prefix}-model`),
    ...(effort === undefined ? {} : { reasoningEffort: required(effort, `--${prefix}-effort`) }),
  });
}
async function planInput(
  values: Record<string, unknown>,
  io: BotCreateCliIo,
  keys: string[],
): Promise<Record<string, unknown>> {
  if (values['plan-stdin'] !== true) usage('This operation requires --plan-stdin.');
  const raw = (await io.readStdin?.()) ?? '';
  if (Buffer.byteLength(raw, 'utf8') > 16 * 1024) usage('Plan input exceeds 16 KiB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return usage('Plan input must be valid JSON.');
  }
  return record(parsed, keys);
}
function assignments(defaultRoute: ModelRoute, value: unknown): unknown {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    usage('Choose between 1 and 20 Assignment models.');
  for (const item of value) {
    record(
      item,
      ['provider', 'model', 'allowedEfforts', 'defaultEffort', 'note'],
      ['provider', 'model', 'allowedEfforts', 'defaultEffort'],
    );
    if (!isAssignmentModelOption(item)) usage('An Assignment model option is invalid.');
    required(item.provider, 'Assignment provider');
    required(item.model, 'Assignment model');
  }
  if (!value.every(isAssignmentModelOption)) usage('An Assignment model option is invalid.');
  try {
    validateAssignmentModels(defaultRoute, value);
  } catch {
    usage('Assignment models must be unique and include the matching default model and effort.');
  }
  return value;
}

export async function parseAgentManagement(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
  io: BotCreateCliIo,
): Promise<AgentManagementInvocation | undefined> {
  const content = parseAgentContent(command, rest, values);
  if (content) return content;
  const schedule = parseAgentSchedules(command, rest, values);
  if (schedule) return schedule;
  const memory = await parseAgentMemory(command, rest, values, io);
  if (memory) return memory;

  const client = await parseClientPreferences(command, rest, values, io, true);
  if (client) return client;
  const human = await parseHumanPreferences(command, rest, values, io);
  if (human) return human;
  const imSetup = parseAgentImSetup(command, rest, values);
  if (imSetup) return imSetup;
  const policy = await parseAgentPolicies(command, rest, values, io);
  if (policy) return policy;
  const device = parseAgentDevices(command, rest, values);
  if (device) return device;
  const backup = parseAgentBackup(command, rest, values);
  if (backup) return backup;
  const marketplace = await parseAgentMarketplace(command, rest, values, io);
  if (marketplace) return marketplace;
  const transfer = parseBotTransfer(command, rest, values, true);
  if (transfer) return transfer;
  const channel = await parseAgentChannels(command, rest, values);
  if (channel) return channel;
  const bot = await parseAgentBots(command, rest, values, io);
  if (bot) return bot;
  if (!Object.hasOwn(OPTIONS, command)) return undefined;
  const allowed = new Set(['compact', 'help', 'timeout', ...OPTIONS[command]!]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is not available for the scoped CLI operation.',
    );
  const count = TARGETS.has(command) ? 1 : 0;
  if (rest.length !== count)
    usage(
      count
        ? 'This operation needs exactly one target.'
        : 'This operation takes no positional arguments.',
    );
  const target = count ? required(rest[0], 'target') : undefined;
  const args: Record<string, unknown> = {};
  switch (command) {
    case 'home-model-set': {
      const effort = values['orchestrator-effort'];
      args.route = checkedRoute({
        provider: required(values.provider, '--provider'),
        model: required(values.model, '--model'),
        ...(effort === undefined
          ? {}
          : { reasoningEffort: required(effort, '--orchestrator-effort') }),
      });
      args.expectedRevision = revision(values['expected-revision']);
      break;
    }
    case 'model-plan':
      args.slug = target;
      break;
    case 'model-plan-customize':
      Object.assign(args, {
        slug: target,
        expectedRevision: revision(values['expected-revision']),
        orchestrator: routeFlags(values, 'orchestrator'),
      });
      break;
    case 'model-plan-inherit':
      Object.assign(args, {
        slug: target,
        expectedRevision: revision(values['expected-revision']),
      });
      break;
    case 'model-plan-set':
    case 'model-plan-assignments-set': {
      const expectedRevision = revision(values['expected-revision']);
      const full = command === 'model-plan-set';
      const input = await planInput(values, io, [
        ...(full ? ['orchestrator'] : []),
        'assignmentDefault',
        'assignmentModels',
      ]);
      const assignmentDefault = checkedRoute(input.assignmentDefault);
      Object.assign(args, {
        slug: target,
        expectedRevision,
        ...(full ? { orchestrator: checkedRoute(input.orchestrator) } : {}),
        assignmentDefault,
        assignmentModels: assignments(assignmentDefault, input.assignmentModels),
      });
      break;
    }
    case 'model-preset-create':
    case 'model-preset-update': {
      const name = required(values.name, '--name');
      const orchestrator = routeFlags(values, 'orchestrator');
      const assignmentDefault = routeFlags(values, 'assignment');
      const expectedRevision =
        command === 'model-preset-update'
          ? revision(values['expected-revision'], '--expected-revision', 1)
          : undefined;
      Object.assign(args, {
        name,
        orchestrator,
        assignmentDefault,
        ...(expectedRevision === undefined ? {} : { id: target, expectedRevision }),
      });
      if (values['plan-stdin'] !== undefined) {
        const input = await planInput(values, io, ['assignmentModels']);
        args.assignmentModels = assignments(assignmentDefault, input.assignmentModels);
      }
      break;
    }
    case 'model-preset-apply':
      Object.assign(args, {
        slug: target,
        presetId: required(values.preset, '--preset'),
        expectedRevision: revision(values['expected-revision']),
        expectedPresetRevision: revision(values['preset-revision'], '--preset-revision', 1),
      });
      break;
    case 'telemetry-set':
      if ((values.enabled === true) === (values.disabled === true))
        usage('Choose exactly one of --enabled or --disabled.');
      args.enabled = values.enabled === true;
      break;
    case 'release-info':
      if (values.since !== undefined) args.since = required(values.since, '--since');
      break;
    case 'release-install':
    case 'release-restart':
      if (values.confirm !== true)
        usage('This disruptive operation requires --confirm and a reviewed Human request.');
      Object.assign(args, {
        ...(command === 'release-install' ? { version: target } : {}),
        confirm: true,
      });
      break;
  }
  return { command, args, write: !READS.has(command) };
}
