import type { PersonaBotSummary } from '@botharness/host-protocol/wire';
import {
  isAvatarAppearance,
  isRetainedAvatarAppearance,
} from '../../core/src/bots/avatar-appearance';
import { isBotPrimaryColor } from '../../core/src/bots/primary-color';
import {
  count,
  finiteNumber,
  HostAnswerInvalid,
  optional,
  record,
  strings,
  text,
  type HostCall,
} from './host-answer';

export interface BotDetailAnswer {
  bot: Record<string, unknown> & { slug: string };
  profileFingerprint: string;
}

function botRow(value: unknown, method: string): Record<string, unknown> & { slug: string } {
  const bot = record(value);
  if (!text(bot?.['slug']) || bot['slug'].length === 0)
    throw new HostAnswerInvalid(`${method} returned a Bot without a slug.`);
  return bot as Record<string, unknown> & { slug: string };
}

export function parseBotList(value: unknown): PersonaBotSummary[] {
  const bots = record(value)?.['bots'];
  if (!Array.isArray(bots)) throw new HostAnswerInvalid('list returned no Bots.');
  return bots.map((entry) => {
    const bot = botRow(entry, 'list');
    if (!text(bot['displayName']))
      throw new HostAnswerInvalid('list returned a Bot without a name.');
    return bot as unknown as PersonaBotSummary;
  });
}

export async function listBots(
  host: HostCall,
  filter: { query?: string } = {},
): Promise<PersonaBotSummary[]> {
  return parseBotList(
    await host.call('list', filter.query === undefined ? {} : { query: filter.query }),
  );
}

export async function loadBotDetail(host: HostCall, slug: string): Promise<BotDetailAnswer> {
  const answer = record(await host.call('get', { slug }));
  const profileFingerprint = answer?.['profileFingerprint'];
  if (!text(profileFingerprint))
    throw new HostAnswerInvalid('get returned no profile fingerprint.');
  return { bot: botRow(answer?.['bot'], 'get'), profileFingerprint };
}

export async function updateBot(
  host: HostCall,
  slug: string,
  patch: Record<string, unknown>,
  expectedProfile?: string,
): Promise<Record<string, unknown> & { slug: string }> {
  return botRow(
    record(
      await host.call('update', {
        slug,
        patch,
        ...(expectedProfile === undefined ? {} : { expectedProfile }),
      }),
    )?.['bot'],
    'update',
  );
}

export interface ChangedBotAnswer {
  bot: Record<string, unknown> & { slug: string; displayName: string };
}

function hasStrings(row: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => text(row[key]));
}

function isModelRoute(value: unknown): boolean {
  const row = record(value);
  return (
    row !== undefined &&
    hasStrings(row, ['provider', 'model']) &&
    optional(row['reasoningEffort'], text)
  );
}

function isModelPlan(value: unknown): boolean {
  const row = record(value);
  return (
    row !== undefined &&
    count(row['revision']) &&
    hasStrings(row, ['sourcePresetId', 'sourcePresetName', 'appliedAt']) &&
    isModelRoute(row['orchestrator']) &&
    optional(row['assignmentDefault'], isModelRoute) &&
    ['orchestratorGroupId', 'orchestratorGroupEffort', 'assignmentDefaultGroupId'].every((key) =>
      optional(row[key], text),
    ) &&
    optional(row['openAssignmentModels'], (open) => open === true) &&
    optional(row['assignmentGroups'], strings) &&
    optional(
      row['assignmentModels'],
      (rows) =>
        Array.isArray(rows) &&
        rows.every((entry: unknown) => {
          const option = record(entry);
          return (
            option !== undefined &&
            hasStrings(option, ['provider', 'model', 'defaultEffort']) &&
            strings(option['allowedEfforts']) &&
            optional(option['note'], text)
          );
        }),
    ) &&
    optional(
      row['assignmentGroupOptions'],
      (rows) =>
        Array.isArray(rows) &&
        rows.every((entry: unknown) => {
          const option = record(entry);
          return (
            text(option?.['group']) &&
            optional(option['allowedEfforts'], strings) &&
            optional(option['defaultEffort'], text) &&
            optional(option['note'], text)
          );
        }),
    )
  );
}

const aggregateStates: ReadonlySet<unknown> = new Set<PersonaBotSummary['aggregateState']>([
  'idle',
  'thinking',
  'working',
  'waiting',
  'blocked',
]);

function isChangedBot(value: unknown): value is ChangedBotAnswer['bot'] {
  const bot = record(value);
  if (!text(bot?.['slug']) || !bot['slug'] || !text(bot['displayName'])) return false;
  const standing = record(bot['standingLimits']);
  const sessions = record(bot['sessions']);
  return (
    aggregateStates.has(bot['aggregateState']) &&
    text(bot['createdAt']) &&
    strings(bot['roles']) &&
    strings(bot['workspaces']) &&
    count(standing?.['soul']) &&
    count(standing?.['coreMemory']) &&
    sessions !== undefined &&
    Object.values(sessions).every(
      (state) => state === 'done' || (state !== 'idle' && aggregateStates.has(state)),
    ) &&
    [
      'ownerHumanId',
      'description',
      'avatar',
      'approvalTemplate',
      'uploadedListing',
      'installedListing',
      'browserProfile',
      'model',
      'preset',
      'memoryDir',
    ].every((key) => optional(bot[key], text)) &&
    ['modelAllowed', 'owner', 'paused', 'deleted', 'browserAccess', 'computerAccess'].every((key) =>
      optional(bot[key], (flag) => typeof flag === 'boolean'),
    ) &&
    optional(bot['lastActivityAt'], finiteNumber) &&
    optional(bot['avatarSeed'], (seed) => seed === 2) &&
    optional(
      bot['appearance'],
      (appearance) => isAvatarAppearance(appearance) || isRetainedAvatarAppearance(appearance),
    ) &&
    optional(bot['primaryColor'], isBotPrimaryColor) &&
    optional(bot['banner'], (value) => {
      const banner = record(value);
      if (!banner) return false;
      if ('image' in banner) return text(banner['image']) && !('recipe' in banner);
      const recipe = record(banner['recipe']);
      return text(recipe?.['scene']) && finiteNumber(recipe['seed']);
    }) &&
    optional(bot['tob'], (value) => {
      const tob = record(value);
      return typeof tob?.['defaultName'] === 'boolean' && typeof tob['defaultAvatar'] === 'boolean';
    }) &&
    optional(bot['orchestratorRunner'], (value) => {
      const runner = record(value);
      return (
        runner !== undefined &&
        hasStrings(runner, ['engine', 'displayName']) &&
        optional(runner['account'], text) &&
        optional(runner['model'], text)
      );
    }) &&
    optional(bot['modelPlan'], isModelPlan)
  );
}

export function readChangedBot(value: unknown, method: string, slug?: string): ChangedBotAnswer {
  const bot = record(value)?.['bot'];
  if (!isChangedBot(bot) || (slug !== undefined && bot.slug !== slug))
    throw new HostAnswerInvalid(`${method} did not return the Bot.`);
  return { bot };
}
