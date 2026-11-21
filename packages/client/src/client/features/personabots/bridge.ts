import {
  asRecord,
  bridgeHost,
  stringArray,
  unwrap,
  type BridgeCall,
} from '../../bridge-transport.js';
import * as rosterReaders from '@botharness/host-client/roster-readers';
import { isPixelBannerRecipe } from '@botharness/pixel-banner';
import { listBots, updateBot } from '@botharness/host-client/bots';
import * as channels from '@botharness/host-client/channel-management';
import type { BotBannerView, BotSummary, StandingLimitsView } from '../../store.js';
import {
  parseRosterSnapshot,
  type RosterSection,
  type RosterSnapshot,
  type TopOrderEntry,
} from '../../roster.js';

export interface CreatePersonaBotInput {
  operationKey?: string;
  expectedCommit?: string;
  displayName: string;
  persona?: string;
  roles: string[];
  description?: string;
  gitUrl?: string;
  avatar?: string;
  origin?: 'marketplace';
  listingId?: string;
  memoryLocation?: string;
}

function parseStandingLimits(value: unknown): { standingLimits: StandingLimitsView } | undefined {
  const limits = asRecord(value);
  const soul = limits?.['soul'];
  const coreMemory = limits?.['coreMemory'];
  if (typeof soul !== 'number' || typeof coreMemory !== 'number') return undefined;
  return { standingLimits: { soul, coreMemory } };
}

function parseBanner(value: unknown): { banner: BotBannerView } | undefined {
  const banner = asRecord(value);
  if (banner === undefined) return undefined;
  if (isPixelBannerRecipe(banner['recipe'])) return { banner: { recipe: banner['recipe'] } };
  const image = banner['image'];
  return typeof image === 'string' && image.length > 0 ? { banner: { image } } : undefined;
}

export async function botExists(call: BridgeCall, slug: string): Promise<boolean> {
  return (await listBots(bridgeHost(call))).some((bot) => bot.slug === slug);
}

export type SshFailureReason =
  | 'auth'
  | 'host-key'
  | 'unreachable'
  | 'ssh-missing'
  | 'timeout'
  | 'other';

const SSH_FAILURE_REASONS: readonly SshFailureReason[] = [
  'auth',
  'host-key',
  'unreachable',
  'ssh-missing',
  'timeout',
  'other',
];

export interface HttpsFallback {
  from: string;
  to: string;
  reason: SshFailureReason;
  detail?: string;
}

export type CreatedBot = BotSummary & { httpsFallback?: HttpsFallback };

function parseHttpsFallback(value: unknown): HttpsFallback | undefined {
  const item = asRecord(value);
  if (typeof item?.['from'] !== 'string' || typeof item['to'] !== 'string') return undefined;
  const reason = SSH_FAILURE_REASONS.find((known) => known === item['reason']) ?? 'other';
  const detail = item['detail'];
  return typeof detail === 'string' && detail.length > 0
    ? { from: item['from'], to: item['to'], reason, detail }
    : { from: item['from'], to: item['to'], reason };
}

export function createPersonaBotReaders(
  isAvatarAppearance: (value: unknown) => value is NonNullable<BotSummary['appearance']>,
  isRetainedAvatarAppearance: (value: unknown) => boolean,
  isBotPrimaryColor: (value: unknown) => value is NonNullable<BotSummary['primaryColor']>,
) {
  function parseBotSummary(value: unknown): BotSummary | undefined {
    const record = asRecord(value);
    if (record === undefined) return undefined;
    const slug = record['slug'];
    const displayName = record['displayName'];
    if (typeof slug !== 'string' || slug.length === 0 || typeof displayName !== 'string') {
      return undefined;
    }
    const aggregateState = record['aggregateState'];
    const createdAt = record['createdAt'];
    const roles = stringArray(record['roles']);
    const legacyTag = record['tag'];
    const description = record['description'];
    const avatar = record['avatar'];
    const runner = asRecord(record['orchestratorRunner']);
    const engine = runner?.['engine'];
    const runnerName = runner?.['displayName'];
    const account = runner?.['account'];
    const runnerModel = runner?.['model'];
    return {
      ...(typeof engine === 'string' &&
      engine.trim() &&
      typeof runnerName === 'string' &&
      runnerName.trim() &&
      (account === undefined || typeof account === 'string')
        ? {
            orchestratorRunner: {
              engine,
              displayName: runnerName,
              ...(account === undefined ? {} : { account }),
              ...(typeof runnerModel === 'string' && runnerModel.trim()
                ? { model: runnerModel }
                : {}),
            },
          }
        : {}),
      slug,
      displayName,
      ...(typeof asRecord(record['tob'])?.['defaultName'] === 'boolean' &&
      typeof asRecord(record['tob'])?.['defaultAvatar'] === 'boolean'
        ? {
            tob: record['tob'] as {
              defaultName: boolean;
              defaultAvatar: boolean;
            },
          }
        : {}),
      ...(typeof record['lastActivityAt'] === 'number' && Number.isFinite(record['lastActivityAt'])
        ? { lastActivityAt: record['lastActivityAt'] }
        : {}),
      ...(typeof asRecord(record['sharedBy'])?.['displayName'] === 'string'
        ? { sharedBy: asRecord(record['sharedBy'])?.['displayName'] as string }
        : {}),
      aggregateState: typeof aggregateState === 'string' ? aggregateState : 'idle',
      workspaces: stringArray(record['workspaces']),
      createdAt: typeof createdAt === 'string' ? createdAt : '',
      roles: roles.length > 0 ? roles : typeof legacyTag === 'string' ? [legacyTag] : [],
      ...(typeof description === 'string' ? { description } : {}),
      ...(typeof avatar === 'string' ? { avatar } : {}),
      ...(isAvatarAppearance(record['appearance'])
        ? { appearance: record['appearance'] }
        : isRetainedAvatarAppearance(record['appearance'])
          ? { appearanceUnsupported: true as const }
          : {}),
      ...(parseBanner(record['banner']) ?? {}),
      ...(isBotPrimaryColor(record['primaryColor'])
        ? { primaryColor: record['primaryColor'] }
        : {}),
      ...(record['avatarSeed'] === 2 ? { avatarSeed: 2 as const } : {}),
      ...(typeof record['paused'] === 'boolean' ? { paused: record['paused'] } : {}),
      ...(record['deleted'] === true ? { deleted: true } : {}),
      ...(record['modelAllowed'] === false ? { modelAllowed: false as const } : {}),
      ...(typeof record['uploadedListing'] === 'string'
        ? { uploadedListing: record['uploadedListing'] }
        : {}),
      ...(typeof record['installedListing'] === 'string'
        ? { installedListing: record['installedListing'] }
        : {}),
      ...(parseStandingLimits(record['standingLimits']) ?? {}),
    };
  }

  function parseBotSummaries(value: unknown): BotSummary[] {
    const bots = asRecord(value)?.['bots'];
    if (!Array.isArray(bots)) return [];
    return bots.flatMap((entry) => {
      const bot = parseBotSummary(entry);
      return bot === undefined ? [] : [bot];
    });
  }

  async function loadBots(call: BridgeCall, signal?: AbortSignal): Promise<BotSummary[]> {
    return parseBotSummaries({ bots: await listBots(bridgeHost(call, signal)) });
  }

  async function createPersonaBot(
    call: BridgeCall,
    input: CreatePersonaBotInput,
    signal?: AbortSignal,
  ): Promise<CreatedBot> {
    const value = await unwrap(
      call,
      input.gitUrl === undefined ? 'create' : 'createFromGit',
      { ...input },
      signal,
    );
    const bot = parseBotSummary(asRecord(value)?.['bot']);
    if (bot === undefined) throw new Error('invalid create response');
    const httpsFallback = parseHttpsFallback(asRecord(value)?.['httpsFallback']);
    return httpsFallback === undefined ? bot : { ...bot, httpsFallback };
  }

  async function updateBotProfile(
    call: BridgeCall,
    slug: string,
    patch: { roles?: string[]; description?: string },
  ): Promise<BotSummary> {
    const bot = parseBotSummary(await updateBot(bridgeHost(call), slug, patch));
    if (bot === undefined) throw new Error('invalid update response');
    return bot;
  }

  async function setStandingLimits(
    call: BridgeCall,
    slug: string,
    limits: StandingLimitsView,
  ): Promise<BotSummary> {
    const value = asRecord(await unwrap(call, 'standingLimitsSet', { slug, ...limits }));
    const bot = parseBotSummary(value?.['bot']);
    if (bot === undefined) throw new Error('Invalid PersonaBot result');
    return bot;
  }
  return {
    parseBotSummary,
    parseBotSummaries,
    loadBots,
    createPersonaBot,
    updateBotProfile,
    setStandingLimits,
  };
}

export async function loadRoster(call: BridgeCall, signal?: AbortSignal): Promise<RosterSnapshot> {
  return parseRosterSnapshot(await rosterReaders.readRoster(bridgeHost(call, signal)));
}

export interface RosterBatchInput {
  action: 'pin' | 'unpin' | 'hide' | 'move';
  channelIds: readonly string[];
  sectionId?: string;
}

export async function applyRosterBatch(
  call: BridgeCall,
  input: RosterBatchInput,
  signal?: AbortSignal,
): Promise<RosterSnapshot> {
  const payload = {
    action: input.action,
    channelIds: [...input.channelIds],
    ...(input.sectionId === undefined ? {} : { sectionId: input.sectionId }),
  };
  return parseRosterSnapshot(
    await rosterReaders.applyRosterBatch(bridgeHost(call, signal), payload),
  );
}

export async function createRosterSection(
  call: BridgeCall,
  name: string,
  signal?: AbortSignal,
): Promise<RosterSection> {
  return channels.createRosterSection(bridgeHost(call, signal), name);
}

export async function renameRosterSection(
  call: BridgeCall,
  sectionId: string,
  name: string,
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'sectionRename', { sectionId, name }, signal);
}

export async function removeRosterSection(
  call: BridgeCall,
  sectionId: string,
  signal?: AbortSignal,
): Promise<void> {
  await channels.removeRosterSection(bridgeHost(call, signal), sectionId);
}

export async function assignRosterChannel(
  call: BridgeCall,
  channelId: string,
  sectionId: string | undefined,
  index?: number,
  signal?: AbortSignal,
): Promise<void> {
  await channels.assignRosterChannel(bridgeHost(call, signal), { channelId, sectionId, index });
}

export async function reorderRosterSections(
  call: BridgeCall,
  order: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'sectionReorder', { order }, signal);
}

export async function reorderTopOrder(
  call: BridgeCall,
  order: readonly TopOrderEntry[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'topReorder', { order }, signal);
}

export async function setRosterPins(
  call: BridgeCall,
  pins: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'pinsSet', { pins }, signal);
}

export async function setRosterHidden(
  call: BridgeCall,
  hidden: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'hiddenSet', { hidden }, signal);
}

export async function setChannelMute(
  call: BridgeCall,
  channelId: string,
  muted: boolean,
  signal?: AbortSignal,
): Promise<void> {
  await channels.setChannelMuted(bridgeHost(call, signal), channelId, muted);
}
