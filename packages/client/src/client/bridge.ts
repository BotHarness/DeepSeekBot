import { isPixelBannerRecipe, type PixelBannerRecipe } from '@botharness/pixel-banner';
import { parseToolApprovalActor } from '../../../core/src/workspaces/tool-approval-actor.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { PairingRequest, PairingReviewInput } from '../../../core/src/messaging/pairing.js';
import type { SenderAccessInput } from '../../../core/src/messaging/sender-access.js';
import { parsePublicAttention } from './activity-attention.js';
import {
  isAvatarAppearance,
  isRetainedAvatarAppearance,
  type AvatarAppearance,
  type AvatarRecipe,
} from '../../../core/src/bots/avatar-appearance.js';
import { parsePublicToolActivity } from './activity-detail.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {
  MessagingDefaults,
  MessagingDefaultsInput,
} from '../../../core/src/messaging/defaults.js';
import type { GroupMemberWakePolicy } from '../../../core/src/channels/channel.js';
import type { AllBotPreview, AllBotMention } from '../../../core/src/channels/all-bot-mention.js';

import type {
  ChannelBridgeInput,
  ChannelBridgeSnapshot,
} from '../../../core/src/messaging/channel-bridge.js';
import type {
  MessagingIdentity,
  MessagingIdentityInput,
} from '../../../core/src/messaging/identity.js';
import type { OverviewMemory } from '../../../core/src/memory/overview.js';
import type {
  BotSchedule,
  BotScheduleChange,
  BotScheduleFiring,
  BotScheduleInput,
  BotScheduleTrigger,
} from '../../../core/src/schedules/bot-schedules.js';
import {
  parseMarketplaceDetail,
  parseMarketplacePage,
  parseMarketplaceSubmission,
  parseMarketplaceTopics,
  type MarketplaceDetail,
  type MarketplaceEntry,
  type MarketplacePage,
  type MarketplaceQuery,
  type MarketplaceTopic,
} from '../../../core/src/marketplace/client.js';
import { parseChallenge, type AltchaChallenge } from '../../../core/src/marketplace/altcha.js';
import type { OverviewUsage } from '../../../core/src/bridge/methods.js';
import type { UsageOverviewPeriod } from '../../../core/src/usage/overview.js';
import type { ChannelActivityToday } from '../../../core/src/channels/activity-today.js';
import type { GroupReceptionInput } from '../../../core/src/messaging/group-policy.js';
import type { MessagingConversationInput } from '../../../core/src/messaging/conversations.js';
import { isPartLibraryEntry, type PartLibraryEntry } from '../../../core/src/bots/part-library.js';
import type { PixelCustomPart } from '../../../core/src/bots/avatar-appearance.js';
import type { ActivityOverview } from '../../../core/src/bridge/methods.js';
import type { ExternalSource } from '../../../core/src/messaging/inbound.js';
import type {
  ConversationIngestInput,
  ConversationIngestSnapshot,
} from '../../../core/src/messaging/conversation-ingest.js';
import type { HumanAssignmentContext } from '../../../core/src/runtime/assignment-human-context.js';
export type { HumanAssignmentContext } from '../../../core/src/runtime/assignment-human-context.js';
import type {
  MessagingApp,
  MessagingSnapshot,
  MessagingGrant,
  OutboxIntent,
} from '../../../core/src/messaging/outbound.js';
import type { MessagingTarget } from '../../../core/src/messaging/provider.js';
import type { HostFileTarget } from './host-file-actions.js';
import type { UsageFilter, UsageQueryResult } from '../../../core/src/usage/query.js';
export type { UsageFilter, UsageQueryResult } from '../../../core/src/usage/query.js';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client';

import type {
  BotAttentionItem,
  BotAttentionPage,
  BotAttentionStatus,
  HumanAttentionItem,
  HumanAttentionPage,
  HumanInboxCategory,
  HumanInboxFilters,
  BotBannerView,
  BotSummary,
  ChannelAuthor,
  ChannelAttachmentRef,
  ChannelMessage,
  ChannelSummary,
  OwnedSessionSummary,
  StandingLimitsView,
  UserQuestionAnswerItem,
} from './store.js';
import {
  parseRosterSection,
  parseRosterSnapshot,
  type RosterSection,
  type RosterSnapshot,
  type TopOrderEntry,
} from './roster.js';

export class BridgeCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BridgeCallError';
  }
}

export interface BridgeRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<ConnectionRpcResult<unknown>>;
}

export type BridgeCall = (
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<ConnectionRpcResult<unknown>>;

export interface ModelRouteView {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface AssignmentModelOptionView {
  provider: string;
  model: string;
  allowedEfforts: string[];
  defaultEffort: string;
}

export interface ModelCatalogEntryView {
  provider: string;
  providerName: string;
  model: string;
  modelName: string;
  efforts: { id: string; name: string }[];
  defaultEffort?: string;
  credential?: 'missing' | 'invalid';
}

export interface ModelCatalogView {
  models: ModelCatalogEntryView[];
  default?: ModelRouteView;
}

export interface ModelPresetView {
  id: string;
  name: string;
  revision: number;
  orchestrator: ModelRouteView;
  assignmentDefault: ModelRouteView;
  assignmentModels?: AssignmentModelOptionView[];
  createdAt: string;
}

export interface ModelPlanView {
  revision: number;
  sourcePresetId: string;
  sourcePresetName: string;
  orchestrator: ModelRouteView;
  assignmentDefault: ModelRouteView;
  assignmentModels?: AssignmentModelOptionView[];
  appliedAt: string;
}

export async function loadActivitySnapshot(
  call: BridgeCall,
  signal: AbortSignal,
): Promise<unknown> {
  return unwrap(call, 'activitySnapshot', {}, signal);
}

export async function loadModelCatalog(call: BridgeCall): Promise<ModelCatalogView> {
  const value = asRecord(await unwrap(call, 'modelCatalog', {}));
  if (!Array.isArray(value?.['models'])) throw new Error('Invalid model catalog');
  const fallback = asRecord(value['default']);
  return {
    models: value['models'] as ModelCatalogEntryView[],
    ...(typeof fallback?.['provider'] === 'string' && typeof fallback['model'] === 'string'
      ? {
          default: { provider: fallback['provider'], model: fallback['model'] },
        }
      : {}),
  };
}

export async function loadModelPresets(call: BridgeCall): Promise<ModelPresetView[]> {
  const value = asRecord(await unwrap(call, 'modelPresets', {}));
  if (!Array.isArray(value?.['presets'])) throw new Error('Invalid Model Presets');
  return value['presets'] as ModelPresetView[];
}

export async function loadModelPlan(
  call: BridgeCall,
  slug: string,
): Promise<ModelPlanView | undefined> {
  return (await loadModelPlanState(call, slug)).plan;
}

export interface ModelPlanStateView {
  revision?: number;
  plan?: ModelPlanView;
  repair?: {
    code: 'legacy-ambiguous' | 'legacy-missing' | 'route-unavailable';
    message: string;
    legacyModel?: string;
  };
}

export async function loadModelPlanState(
  call: BridgeCall,
  slug: string,
): Promise<ModelPlanStateView> {
  const value = asRecord(await unwrap(call, 'modelPlan', { slug }));
  return value === undefined ? {} : (value as ModelPlanStateView);
}

export async function createModelPreset(
  call: BridgeCall,
  name: string,
  orchestrator: ModelRouteView,
  assignmentDefault: ModelRouteView,
  assignmentModels?: AssignmentModelOptionView[],
): Promise<ModelPresetView> {
  const value = asRecord(
    await unwrap(call, 'modelPresetCreate', {
      name,
      orchestrator,
      assignmentDefault,
      ...(assignmentModels === undefined ? {} : { assignmentModels }),
    }),
  );
  if (asRecord(value?.['preset']) === undefined) throw new Error('Invalid Model Preset result');
  return value!['preset'] as ModelPresetView;
}

export async function updateModelPreset(
  call: BridgeCall,
  id: string,
  expectedRevision: number,
  name: string,
  orchestrator: ModelRouteView,
  assignmentDefault: ModelRouteView,
): Promise<ModelPresetView> {
  const value = asRecord(
    await unwrap(call, 'modelPresetUpdate', {
      id,
      expectedRevision,
      name,
      orchestrator,
      assignmentDefault,
    }),
  );
  if (asRecord(value?.['preset']) === undefined) throw new Error('Invalid Model Preset result');
  return value!['preset'] as ModelPresetView;
}

export async function applyModelPreset(
  call: BridgeCall,
  slug: string,
  presetId: string,
): Promise<ModelPlanView> {
  const value = asRecord(await unwrap(call, 'modelPresetApply', { slug, presetId }));
  if (asRecord(value?.['plan']) === undefined) throw new Error('Invalid Model Plan result');
  return value!['plan'] as ModelPlanView;
}

export async function customizeModelPlan(
  call: BridgeCall,
  slug: string,
  orchestrator: ModelRouteView,
): Promise<ModelPlanView> {
  const value = asRecord(await unwrap(call, 'modelPlanCustomize', { slug, orchestrator }));
  if (asRecord(value?.['plan']) === undefined) throw new Error('Invalid Model Plan result');
  return value!['plan'] as ModelPlanView;
}

export async function setModelPlanAssignments(
  call: BridgeCall,
  slug: string,
  expectedRevision: number,
  assignmentDefault: ModelRouteView,
  assignmentModels: AssignmentModelOptionView[],
): Promise<ModelPlanView> {
  const value = asRecord(
    await unwrap(call, 'modelPlanAssignmentsSet', {
      slug,
      expectedRevision,
      assignmentDefault,
      assignmentModels,
    }),
  );
  if (asRecord(value?.['plan']) === undefined) throw new Error('Invalid Model Plan result');
  return value!['plan'] as ModelPlanView;
}

export interface CreatePersonaBotInput {
  displayName: string;
  persona?: string;
  roles: string[];
  description?: string;
  gitUrl?: string;
  origin?: 'marketplace';
}

export interface BotSourcePolicyView {
  sourceClass:
    | 'human-dm'
    | 'bot-dm'
    | 'group-mention'
    | 'group-ordinary'
    | 'group-invite'
    | 'group-join-request'
    | 'group-join-decision'
    | 'assignment-report'
    | 'assignment-lifecycle';
  admission: 'admit';
  wake: 'immediate' | 'digest' | 'conditional' | 'mentions' | 'silent';
  delivery: 'steer' | 'turn';
  digestCount?: number;
  digestIntervalSeconds?: number;
  revision: number;
  lastActor: { kind: 'built-in' | 'human' | 'template' } | { kind: 'bot'; botSlug: string };
  changedAt: string;
  overrideActive: boolean;
  recentWakeCount: number;
}

export type BotSourcePolicyEdit =
  | { sourceClass: 'assignment-report'; wake: 'conditional' | 'immediate' }
  | {
      sourceClass: 'group-ordinary';
      wake: 'immediate' | 'digest' | 'mentions' | 'silent';
      digestCount: number;
      digestIntervalSeconds: number;
    }
  | {
      sourceClass: 'human-dm' | 'bot-dm' | 'group-mention';
      wake: 'immediate';
      delivery: 'steer' | 'turn';
    };

export async function loadBotSourcePolicies(
  call: BridgeCall,
  slug: string,
): Promise<BotSourcePolicyView[]> {
  const result = asRecord(await unwrap(call, 'botSourcePolicies', { slug }));
  const raw = result?.['policies'];
  if (!Array.isArray(raw)) throw new Error('invalid Bot source policies');
  return raw.map((entry): BotSourcePolicyView => {
    const policy = asRecord(entry);
    const actor = asRecord(policy?.['lastActor']);
    if (
      policy === undefined ||
      ![
        'human-dm',
        'bot-dm',
        'group-mention',
        'group-ordinary',
        'group-invite',
        'group-join-request',
        'group-join-decision',
        'assignment-report',
        'assignment-lifecycle',
      ].includes(String(policy?.['sourceClass'])) ||
      policy['admission'] !== 'admit' ||
      !['immediate', 'digest', 'conditional', 'mentions', 'silent'].includes(
        String(policy['wake']),
      ) ||
      typeof policy['revision'] !== 'number' ||
      !Number.isSafeInteger(policy['revision']) ||
      !['built-in', 'human', 'bot', 'template'].includes(String(actor?.['kind'])) ||
      (actor?.['kind'] === 'bot' && typeof actor['botSlug'] !== 'string') ||
      typeof policy['changedAt'] !== 'string' ||
      typeof policy['overrideActive'] !== 'boolean' ||
      !Number.isSafeInteger(policy['recentWakeCount']) ||
      (policy['recentWakeCount'] as number) < 0 ||
      (policy['wake'] === 'digest' &&
        (!Number.isSafeInteger(policy['digestCount']) ||
          !Number.isSafeInteger(policy['digestIntervalSeconds'])))
    )
      throw new Error('invalid Bot source policy');
    return policy as unknown as BotSourcePolicyView;
  });
}

export type {
  BotSchedule as BotScheduleView,
  BotScheduleChange,
  BotScheduleFiring as BotScheduleFiringView,
  BotScheduleInput,
  BotScheduleTrigger,
} from '../../../core/src/schedules/bot-schedules.js';

function isScheduleTrigger(value: unknown): boolean {
  const trigger = asRecord(value);
  if (trigger?.['kind'] === 'every') return Number.isSafeInteger(trigger['everySeconds']);
  if (typeof trigger?.['timeZone'] !== 'string') return false;
  if (trigger['kind'] === 'cron') return typeof trigger['expression'] === 'string';
  if (typeof trigger['time'] !== 'string') return false;
  if (trigger['kind'] === 'daily') return true;
  if (trigger['kind'] === 'weekly')
    return (
      Array.isArray(trigger['weekdays']) &&
      trigger['weekdays'].every((day) => Number.isSafeInteger(day))
    );
  return trigger['kind'] === 'once' && typeof trigger['date'] === 'string';
}

function parseScheduleFiring(value: unknown): BotScheduleFiring {
  const firing = asRecord(value);
  if (
    typeof firing?.['id'] !== 'string' ||
    typeof firing['scheduleId'] !== 'string' ||
    !['planned', 'manual'].includes(String(firing['trigger'])) ||
    typeof firing['occurrenceAt'] !== 'string' ||
    typeof firing['firedAt'] !== 'string' ||
    !['pending', 'observed', 'handled', 'coalesced', 'skipped'].includes(String(firing['state']))
  )
    throw new Error('invalid Bot Schedule firing');
  return firing as unknown as BotScheduleFiring;
}

function parseSchedule(value: unknown): BotSchedule {
  const schedule = asRecord(value);
  if (
    typeof schedule?.['id'] !== 'string' ||
    typeof schedule['botSlug'] !== 'string' ||
    typeof schedule['title'] !== 'string' ||
    typeof schedule['prompt'] !== 'string' ||
    !isScheduleTrigger(schedule['trigger']) ||
    typeof schedule['enabled'] !== 'boolean' ||
    !['human', 'personabot'].includes(String(schedule['creator'])) ||
    typeof schedule['locked'] !== 'boolean' ||
    (schedule['nextRunAt'] !== undefined && typeof schedule['nextRunAt'] !== 'string')
  )
    throw new Error('invalid Bot Schedule');
  if (schedule['lastFiring'] !== undefined) parseScheduleFiring(schedule['lastFiring']);
  return schedule as unknown as BotSchedule;
}

export async function loadBotSchedules(call: BridgeCall, slug: string): Promise<BotSchedule[]> {
  const raw = asRecord(await unwrap(call, 'scheduleList', { slug }))?.['schedules'];
  if (!Array.isArray(raw)) throw new Error('invalid Bot Schedules');
  return raw.map(parseSchedule);
}

export async function createBotSchedule(
  call: BridgeCall,
  slug: string,
  input: BotScheduleInput,
): Promise<BotSchedule> {
  return parseSchedule(
    asRecord(await unwrap(call, 'scheduleCreate', { slug, input }))?.['schedule'],
  );
}

export async function updateBotSchedule(
  call: BridgeCall,
  slug: string,
  id: string,
  change: BotScheduleChange,
): Promise<BotSchedule> {
  return parseSchedule(
    asRecord(await unwrap(call, 'scheduleUpdate', { slug, id, change }))?.['schedule'],
  );
}

export async function deleteBotSchedule(call: BridgeCall, slug: string, id: string): Promise<void> {
  await unwrap(call, 'scheduleDelete', { slug, id });
}

export async function loadBotScheduleHistory(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<BotScheduleFiring[]> {
  const raw = asRecord(await unwrap(call, 'scheduleHistory', { slug, id }))?.['firings'];
  if (!Array.isArray(raw)) throw new Error('invalid Bot Schedule history');
  return raw.map(parseScheduleFiring);
}

export async function runBotScheduleNow(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<BotScheduleFiring> {
  return parseScheduleFiring(
    asRecord(await unwrap(call, 'scheduleRunNow', { slug, id }))?.['firing'],
  );
}

export async function previewBotSchedule(
  call: BridgeCall,
  trigger: BotScheduleTrigger,
): Promise<string[]> {
  const raw = asRecord(await unwrap(call, 'schedulePreview', { trigger }))?.['occurrences'];
  if (!Array.isArray(raw) || !raw.every((value) => typeof value === 'string'))
    throw new Error('invalid Bot Schedule preview');
  return raw as string[];
}

export async function setBotSourcePolicy(
  call: BridgeCall,
  slug: string,
  edit: BotSourcePolicyEdit,
): Promise<void> {
  await unwrap(call, 'botSourcePolicySet', { slug, ...edit });
}

export async function resetBotSourcePolicy(
  call: BridgeCall,
  slug: string,
  sourceClass: BotSourcePolicyEdit['sourceClass'],
): Promise<void> {
  await unwrap(call, 'botSourcePolicyReset', { slug, sourceClass });
}

export function connectionRpc(ctx: ClientContext): BridgeRpc | undefined {
  const candidate = (ctx as unknown as { connection?: { rpc?: BridgeRpc } }).connection;
  return candidate?.rpc;
}

function remoteArgs(payload: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) args[key] = value;
  }
  return args;
}

export function createBridgeCall(ctx: ClientContext): BridgeCall {
  return async (endpoint, payload, signal) => {
    const rpc = connectionRpc(ctx);
    if (rpc === undefined) {
      return {
        ok: false,
        error: { code: 'unavailable', message: 'Connection RPC is not available', details: {} },
      };
    }
    return rpc.call('/api', `botharness/${endpoint}`, { args: remoteArgs(payload) }, signal);
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

async function unwrap(
  call: BridgeCall,
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const result = await call(endpoint, payload, signal);
  if (!result.ok)
    throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
  return result.value;
}

export function parseBotSummary(value: unknown): BotSummary | undefined {
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
  return {
    slug,
    displayName,
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
    ...(record['avatarSeed'] === 2 ? { avatarSeed: 2 as const } : {}),
    ...(typeof record['paused'] === 'boolean' ? { paused: record['paused'] } : {}),
    ...(record['deleted'] === true ? { deleted: true } : {}),
    ...(parseStandingLimits(record['standingLimits']) ?? {}),
  };
}

function parseBanner(value: unknown): { banner: BotBannerView } | undefined {
  const banner = asRecord(value);
  if (banner === undefined) return undefined;
  if (isPixelBannerRecipe(banner['recipe'])) return { banner: { recipe: banner['recipe'] } };
  const image = banner['image'];
  return typeof image === 'string' && image.length > 0 ? { banner: { image } } : undefined;
}

function parseStandingLimits(value: unknown): { standingLimits: StandingLimitsView } | undefined {
  const limits = asRecord(value);
  const soul = limits?.['soul'];
  const coreMemory = limits?.['coreMemory'];
  if (typeof soul !== 'number' || typeof coreMemory !== 'number') return undefined;
  return { standingLimits: { soul, coreMemory } };
}

export async function setStandingLimits(
  call: BridgeCall,
  slug: string,
  limits: StandingLimitsView,
): Promise<BotSummary> {
  const value = asRecord(await unwrap(call, 'standingLimitsSet', { slug, ...limits }));
  const bot = parseBotSummary(value?.['bot']);
  if (bot === undefined) throw new Error('Invalid PersonaBot result');
  return bot;
}

export function parseBotSummaries(value: unknown): BotSummary[] {
  const bots = asRecord(value)?.['bots'];
  if (!Array.isArray(bots)) return [];
  return bots.flatMap((entry) => {
    const bot = parseBotSummary(entry);
    return bot === undefined ? [] : [bot];
  });
}

export function parseChannelRecord(value: unknown): ChannelSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const type = record['type'];
  const name = record['name'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (type !== 'dm' && type !== 'group') return undefined;
  if (typeof name !== 'string') return undefined;
  const botSlug = record['botSlug'];
  const createdAt = record['createdAt'];
  const updatedAt = record['updatedAt'];
  const latestMessage = parseChannelMessage(record['latestMessage']);
  const invitations = Array.isArray(record['invitations'])
    ? record['invitations'].flatMap((value: unknown) => {
        const item = asRecord(value);
        if (
          item === undefined ||
          typeof item['id'] !== 'string' ||
          typeof item['targetBotSlug'] !== 'string' ||
          !(
            (typeof item['inviterBotSlug'] === 'string' && item['inviterHuman'] === undefined) ||
            (item['inviterBotSlug'] === undefined && item['inviterHuman'] === true)
          ) ||
          !['pending', 'accepted', 'declined', 'cancelled'].includes(String(item['status'])) ||
          typeof item['createdAt'] !== 'string'
        )
          return [];
        return [
          {
            id: item['id'],
            targetBotSlug: item['targetBotSlug'],
            ...(typeof item['inviterBotSlug'] === 'string'
              ? { inviterBotSlug: item['inviterBotSlug'] }
              : { inviterHuman: true as const }),
            status: item['status'] as 'pending' | 'accepted' | 'declined' | 'cancelled',
            createdAt: item['createdAt'],
            ...(typeof item['respondedAt'] === 'string'
              ? { respondedAt: item['respondedAt'] }
              : {}),
          },
        ];
      })
    : undefined;
  const joinRequests = Array.isArray(record['joinRequests'])
    ? record['joinRequests'].flatMap((value: unknown) => {
        const item = asRecord(value);
        if (
          item === undefined ||
          typeof item['id'] !== 'string' ||
          typeof item['requesterBotSlug'] !== 'string' ||
          !['pending', 'accepted', 'declined', 'cancelled'].includes(String(item['status'])) ||
          typeof item['createdAt'] !== 'string'
        )
          return [];
        return [
          {
            id: item['id'],
            requesterBotSlug: item['requesterBotSlug'],
            status: item['status'] as 'pending' | 'accepted' | 'declined' | 'cancelled',
            createdAt: item['createdAt'],
            ...(typeof item['decidedAt'] === 'string' ? { decidedAt: item['decidedAt'] } : {}),
            ...(typeof item['decidedBy'] === 'string' ? { decidedBy: item['decidedBy'] } : {}),
          },
        ];
      })
    : undefined;
  const rawWakePolicies = asRecord(record['wakePolicies']);
  const wakePolicies =
    rawWakePolicies === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(rawWakePolicies).flatMap(([slug, raw]) => {
            const value = asRecord(raw);
            if (
              value === undefined ||
              (value['mode'] !== 'all' &&
                value['mode'] !== 'mentions' &&
                value['mode'] !== 'digest' &&
                value['mode'] !== 'silent') ||
              typeof value['count'] !== 'number' ||
              typeof value['intervalSeconds'] !== 'number' ||
              typeof value['revision'] !== 'number'
            )
              return [];
            return [
              [
                slug,
                {
                  mode: value['mode'] as 'all' | 'mentions' | 'digest' | 'silent',
                  count: value['count'],
                  intervalSeconds: value['intervalSeconds'],
                  revision: value['revision'],
                },
              ],
            ];
          }),
        );
  return {
    id,
    type,
    name,
    ...(type === 'group' && typeof record['avatar'] === 'string'
      ? { avatar: record['avatar'] }
      : {}),
    members: stringArray(record['members']),
    ...(record['humanNickname'] === null || typeof record['humanNickname'] === 'string'
      ? { humanNickname: record['humanNickname'] as string | null }
      : {}),
    ...(Array.isArray(record['humanMembers'])
      ? {
          humanMembers: record['humanMembers'].flatMap((raw: unknown) => {
            const member = asRecord(raw);
            return typeof member?.['humanId'] === 'string' &&
              typeof member['displayName'] === 'string'
              ? [{ humanId: member['humanId'], displayName: member['displayName'] }]
              : [];
          }),
        }
      : {}),
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    ...(typeof botSlug === 'string' ? { botSlug } : {}),
    ...(typeof record['ownerBotSlug'] === 'string' ? { ownerBotSlug: record['ownerBotSlug'] } : {}),
    ...(invitations === undefined ? {} : { invitations }),
    ...(joinRequests === undefined ? {} : { joinRequests }),
    ...(wakePolicies === undefined ? {} : { wakePolicies }),
    ...(latestMessage === undefined ? {} : { latestMessage }),
  };
}

export function parseChannelRecords(value: unknown): ChannelSummary[] {
  const channels = asRecord(value)?.['channels'];
  if (!Array.isArray(channels)) return [];
  return channels.flatMap((entry) => {
    const channel = parseChannelRecord(entry);
    return channel === undefined ? [] : [channel];
  });
}

function parseAuthor(value: unknown): ChannelAuthor | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  switch (record['kind']) {
    case 'human':
      return { kind: 'human' };
    case 'system':
      return { kind: 'system' };
    case 'bot':
      return typeof record['slug'] === 'string' && record['slug'].length > 0
        ? { kind: 'bot', slug: record['slug'] }
        : undefined;
    case 'bridged':
      return typeof record['source'] === 'string' && record['source'].length > 0
        ? { kind: 'bridged', source: record['source'] }
        : undefined;
    default:
      return undefined;
  }
}

export function parseChannelAttachment(value: unknown): ChannelAttachmentRef | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const { hash, fileId, name, mime, size } = record;
  if (
    !(
      (typeof hash === 'string' && /^sha256:[0-9a-f]{64}$/u.test(hash) && fileId === undefined) ||
      (typeof fileId === 'string' &&
        /^file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          fileId,
        ) &&
        hash === undefined)
    ) ||
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 180 ||
    /[/\\\u0000-\u001f\u007f]/u.test(name) ||
    typeof mime !== 'string' ||
    !/^[a-z][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/u.test(mime) ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 0
  )
    return undefined;
  return typeof fileId === 'string'
    ? { fileId, name, mime, size }
    : { hash: hash as string, name, mime, size };
}

export function channelAttachmentUrl(
  ref: ChannelAttachmentRef,
  owner: { channelId: string; messageId: string },
): string {
  if (owner === undefined) throw new Error('Message ownership is required for attachments');
  if (ref.fileId !== undefined) {
    return '/api/botharness/attachment?' + new URLSearchParams({ ...owner, fileId: ref.fileId });
  }
  return (
    '/api/botharness/attachment?' +
    new URLSearchParams({ hash: ref.hash, name: ref.name, ...owner })
  );
}

export async function uploadChannelAttachment(
  file: File,
  signal?: AbortSignal,
  uploadId?: string,
): Promise<ChannelAttachmentRef> {
  const response = await fetch(
    `/api/botharness/attachment/upload?${new URLSearchParams({ name: file.name, ...(uploadId === undefined ? {} : { uploadId }) })}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  const payload = asRecord(await response.json());
  const ref = parseChannelAttachment(payload?.['attachment']);
  if (ref === undefined) throw new Error('Invalid attachment upload response');
  return ref;
}

export function parseChannelMessage(value: unknown): ChannelMessage | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const at = record['at'];
  const body = record['body'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (typeof at !== 'string' || at.length === 0) return undefined;
  if (typeof body !== 'string') return undefined;
  const author = parseAuthor(record['author']);
  if (author === undefined) return undefined;
  const memorySwitchTarget = record['memorySwitchTarget'];
  if (
    memorySwitchTarget !== undefined &&
    (author.kind !== 'human' ||
      typeof memorySwitchTarget !== 'string' ||
      memorySwitchTarget.length === 0 ||
      memorySwitchTarget.length > 255)
  )
    return undefined;
  const grantRequest = record['grantRequest'];
  if (grantRequest !== undefined && (grantRequest !== true || author.kind !== 'bot'))
    return undefined;
  let grantRequestResolution: ChannelMessage['grantRequestResolution'];
  let assignmentReply: ChannelMessage['assignmentReply'];
  if (record['assignmentReply'] !== undefined) {
    const target = asRecord(record['assignmentReply']);
    if (
      target === undefined ||
      author.kind !== 'human' ||
      typeof target['sessionId'] !== 'string' ||
      target['sessionId'].length === 0 ||
      typeof target['sourceEventId'] !== 'string' ||
      target['sourceEventId'].length === 0
    )
      return undefined;
    assignmentReply = { sessionId: target['sessionId'], sourceEventId: target['sourceEventId'] };
  }
  if (record['grantRequestResolution'] !== undefined) {
    const resolution = asRecord(record['grantRequestResolution']);
    if (
      resolution === undefined ||
      author.kind !== 'human' ||
      typeof resolution['requestMessageId'] !== 'string' ||
      typeof resolution['grantId'] !== 'string' ||
      resolution['requestMessageId'].length === 0 ||
      resolution['grantId'].length === 0 ||
      record['replyTo'] !== resolution['requestMessageId']
    )
      return undefined;
    grantRequestResolution = {
      requestMessageId: resolution['requestMessageId'],
      grantId: resolution['grantId'],
    };
  }
  let toolApprovalRequest: ChannelMessage['toolApprovalRequest'];
  if (record['toolApprovalRequest'] !== undefined) {
    const request = asRecord(record['toolApprovalRequest']);
    if (
      request === undefined ||
      author.kind !== 'bot' ||
      typeof request['sessionId'] !== 'string' ||
      typeof request['callId'] !== 'string' ||
      typeof request['toolName'] !== 'string' ||
      typeof request['cwd'] !== 'string' ||
      typeof request['input'] !== 'string' ||
      (request['role'] !== 'orchestrator' && request['role'] !== 'assignment')
    )
      return undefined;
    toolApprovalRequest = {
      sessionId: request['sessionId'],
      callId: request['callId'],
      toolName: request['toolName'],
      role: request['role'],
      cwd: request['cwd'],
      input: request['input'],
    };
  }
  let userQuestionRequest: ChannelMessage['userQuestionRequest'];
  if (record['userQuestionRequest'] !== undefined) {
    const request = asRecord(record['userQuestionRequest']);
    const questions = request?.['questions'];
    if (
      request === undefined ||
      author.kind !== 'bot' ||
      typeof request['sessionId'] !== 'string' ||
      !Array.isArray(questions) ||
      questions.length === 0 ||
      questions.length > 3
    )
      return undefined;
    const parsed = questions.map((value) => {
      const item = asRecord(value);
      if (
        item === undefined ||
        typeof item['id'] !== 'string' ||
        typeof item['question'] !== 'string'
      )
        return undefined;
      const options = item['options'];
      if (
        options !== undefined &&
        (!Array.isArray(options) ||
          !options.every((option) => {
            const row = asRecord(option);
            return (
              row !== undefined &&
              typeof row['label'] === 'string' &&
              (row['description'] === undefined || typeof row['description'] === 'string')
            );
          }))
      )
        return undefined;
      return {
        id: item['id'],
        question: item['question'],
        ...(typeof item['detail'] === 'string' ? { detail: item['detail'] } : {}),
        ...(typeof item['header'] === 'string' ? { header: item['header'] } : {}),
        ...(item['multiSelect'] === true ? { multiSelect: true } : {}),
        ...(Array.isArray(options) ? { options } : {}),
      };
    });
    if (parsed.some((item) => item === undefined)) return undefined;
    userQuestionRequest = {
      sessionId: request['sessionId'],
      ...(typeof request['callId'] === 'string' ? { callId: request['callId'] } : {}),
      questions: parsed as NonNullable<ChannelMessage['userQuestionRequest']>['questions'],
    };
  }
  let sessionFailure: ChannelMessage['sessionFailure'];
  if (record['sessionFailure'] !== undefined) {
    const failure = asRecord(record['sessionFailure']);
    if (
      failure === undefined ||
      author.kind !== 'bot' ||
      (failure['role'] !== 'orchestrator' && failure['role'] !== 'assignment') ||
      typeof failure['sessionId'] !== 'string' ||
      typeof failure['detail'] !== 'string' ||
      (failure['code'] !== undefined && typeof failure['code'] !== 'string') ||
      (failure['status'] !== undefined && typeof failure['status'] !== 'number') ||
      (failure['context'] !== undefined && typeof failure['context'] !== 'string')
    )
      return undefined;
    sessionFailure = {
      role: failure['role'],
      sessionId: failure['sessionId'],
      detail: failure['detail'],
      ...(typeof failure['requestMessageId'] === 'string'
        ? { requestMessageId: failure['requestMessageId'] }
        : {}),
      ...(typeof failure['code'] === 'string' ? { code: failure['code'] } : {}),
      ...(typeof failure['status'] === 'number' ? { status: failure['status'] } : {}),
      ...(typeof failure['context'] === 'string' ? { context: failure['context'] } : {}),
    };
  }
  let memberDeparture: ChannelMessage['memberDeparture'];
  if (record['memberDeparture'] !== undefined) {
    const departure = asRecord(record['memberDeparture']);
    if (
      departure === undefined ||
      author.kind !== 'system' ||
      (departure['memberKind'] !== 'bot' && departure['memberKind'] !== 'human') ||
      typeof departure['memberId'] !== 'string' ||
      departure['memberId'].length === 0 ||
      typeof departure['displayName'] !== 'string' ||
      departure['displayName'].length === 0 ||
      (departure['departureType'] !== undefined &&
        departure['departureType'] !== 'left' &&
        departure['departureType'] !== 'removed')
    )
      return undefined;
    memberDeparture = {
      memberKind: departure['memberKind'],
      memberId: departure['memberId'],
      displayName: departure['displayName'],
      departureType: departure['departureType'] === 'removed' ? 'removed' : 'left',
    };
  } else if (record['memoryCommit'] !== undefined) {
    if (author.kind !== 'system') return undefined;
  } else if (author.kind === 'system' && asRecord(record['onboardingWelcome'])?.['version'] !== 1) {
    return undefined;
  }
  let memoryCommit: ChannelMessage['memoryCommit'];
  if (record['memoryCommit'] !== undefined) {
    const commit = asRecord(record['memoryCommit']);
    const count = (value: unknown): number | null | undefined =>
      value === null
        ? null
        : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
          ? value
          : undefined;
    const files = Array.isArray(commit?.['files'])
      ? commit['files'].flatMap((item: unknown) => {
          const file = asRecord(item);
          const added = count(file?.['added']);
          const deleted = count(file?.['deleted']);
          return file !== undefined &&
            typeof file['path'] === 'string' &&
            added !== undefined &&
            deleted !== undefined
            ? [{ path: file['path'], added, deleted }]
            : [];
        })
      : undefined;
    if (
      commit === undefined ||
      typeof commit['botSlug'] !== 'string' ||
      typeof commit['sha'] !== 'string' ||
      !/^[0-9a-f]{40}$/u.test(commit['sha']) ||
      typeof commit['subject'] !== 'string' ||
      typeof commit['authorName'] !== 'string' ||
      typeof commit['authoredAt'] !== 'string' ||
      files === undefined ||
      count(commit['moreFiles']) == null
    )
      return undefined;
    memoryCommit = {
      botSlug: commit['botSlug'],
      sha: commit['sha'],
      subject: commit['subject'],
      authorName: commit['authorName'],
      authoredAt: commit['authoredAt'],
      files,
      moreFiles: commit['moreFiles'] as number,
    };
  }
  let botDmAction: ChannelMessage['botDmAction'];
  if (record['botDmAction'] !== undefined) {
    const action = asRecord(record['botDmAction']);
    if (
      action === undefined ||
      author.kind !== 'bot' ||
      typeof action['channelId'] !== 'string' ||
      typeof action['messageId'] !== 'string' ||
      typeof action['recipientBotSlug'] !== 'string'
    )
      return undefined;
    botDmAction = {
      channelId: action['channelId'],
      messageId: action['messageId'],
      recipientBotSlug: action['recipientBotSlug'],
    };
  }
  const rawAttachments = record['attachments'];
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments.map(parseChannelAttachment)
    : undefined;
  if (
    rawAttachments !== undefined &&
    (attachments === undefined ||
      attachments.length > 10 ||
      attachments.some((entry) => entry === undefined))
  )
    return undefined;
  let bridgeOrigin: ChannelMessage['bridgeOrigin'];
  if (record['bridgeOrigin'] !== undefined) {
    const origin = asRecord(record['bridgeOrigin']);
    if (
      author.kind !== 'bridged' ||
      !origin ||
      ![
        'sourceEventId',
        'platform',
        'conversationId',
        'conversationName',
        'messageId',
        'senderId',
      ].every((key) => typeof origin[key] === 'string' && origin[key].length > 0) ||
      (origin['threadId'] !== undefined &&
        (typeof origin['threadId'] !== 'string' || origin['threadId'].length === 0))
    )
      return undefined;
    bridgeOrigin = origin as NonNullable<ChannelMessage['bridgeOrigin']>;
  }
  let bridgeMedia: ChannelMessage['bridgeMedia'];
  if (record['bridgeMedia'] !== undefined) {
    const media = asRecord(record['bridgeMedia']);
    if (
      !bridgeOrigin ||
      !media ||
      Object.keys(media).some((key) => !['items', 'parts'].includes(key)) ||
      !Array.isArray(media['items']) ||
      media['items'].length > 32
    )
      return;
    const ids = new Set<string>();
    for (const raw of media['items']) {
      const item = asRecord(raw);
      if (
        !item ||
        item['kind'] !== 'image' ||
        typeof item['id'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(item['id']) ||
        typeof item['name'] !== 'string' ||
        ids.has(item['id']) ||
        Object.keys(item).some((key) => !['id', 'kind', 'name'].includes(key))
      )
        return;
      ids.add(item['id']);
    }
    if (media['parts'] !== undefined) {
      if (!Array.isArray(media['parts']) || media['parts'].length > 256) return;
      for (const raw of media['parts']) {
        const part = asRecord(raw);
        if (
          !part ||
          Object.keys(part).some(
            (key) => !(part['kind'] === 'text' ? ['kind', 'text'] : ['kind', 'id']).includes(key),
          ) ||
          (part['kind'] === 'text'
            ? typeof part['text'] !== 'string' || part['text'].length > 16000
            : part['kind'] !== 'attachment' ||
              typeof part['id'] !== 'string' ||
              !ids.has(part['id']))
        )
          return;
      }
    }
    bridgeMedia = media as NonNullable<ChannelMessage['bridgeMedia']>;
  }
  const format = record['format'];
  if (format !== undefined && format !== 'markdown' && format !== 'text') return undefined;
  const replyTo = record['replyTo'];
  if (replyTo !== undefined && (typeof replyTo !== 'string' || replyTo.length === 0))
    return undefined;
  let toolApprovalDecision: ChannelMessage['toolApprovalDecision'];
  if (record['toolApprovalDecision'] !== undefined) {
    const decision = asRecord(record['toolApprovalDecision']);
    if (
      decision === undefined ||
      author.kind !== 'human' ||
      typeof decision['requestMessageId'] !== 'string' ||
      (decision['outcome'] !== 'allowed-once' &&
        decision['outcome'] !== 'allowed-always-exact' &&
        decision['outcome'] !== 'allowed-always-all' &&
        decision['outcome'] !== 'rejected') ||
      replyTo !== decision['requestMessageId']
    )
      return undefined;
    const actor =
      decision['actor'] === undefined ? undefined : parseToolApprovalActor(decision['actor']);
    if (decision['actor'] !== undefined && !actor) return undefined;
    toolApprovalDecision = {
      requestMessageId: decision['requestMessageId'],
      outcome: decision['outcome'],
      ...(actor ? { actor } : {}),
    };
  }
  let userQuestionResolution: ChannelMessage['userQuestionResolution'];
  if (record['userQuestionResolution'] !== undefined) {
    const resolution = asRecord(record['userQuestionResolution']);
    if (
      resolution === undefined ||
      typeof resolution['requestMessageId'] !== 'string' ||
      replyTo !== resolution['requestMessageId'] ||
      (resolution['state'] !== 'answered' && resolution['state'] !== 'cancelled')
    )
      return undefined;
    if (resolution['state'] === 'answered') {
      if (author.kind !== 'human' || !Array.isArray(resolution['answers'])) return undefined;
      const answers = resolution['answers'] as unknown[];
      if (
        !answers.every((value) => {
          const item = asRecord(value);
          return (
            item !== undefined &&
            typeof item['id'] === 'string' &&
            Array.isArray(item['selected']) &&
            item['selected'].every((label) => typeof label === 'string') &&
            (item['custom'] === undefined || typeof item['custom'] === 'string')
          );
        })
      )
        return undefined;
      userQuestionResolution = {
        requestMessageId: resolution['requestMessageId'],
        state: 'answered',
        answers: answers as UserQuestionAnswerItem[],
      };
    } else {
      if (author.kind !== 'bot') return undefined;
      userQuestionResolution = {
        requestMessageId: resolution['requestMessageId'],
        state: 'cancelled',
      };
    }
  }
  const rawPreview = record['replyToPreview'];
  let replyToPreview: ChannelMessage['replyToPreview'];
  if (rawPreview === null) {
    replyToPreview = null;
  } else if (rawPreview !== undefined) {
    const preview = asRecord(rawPreview);
    if (preview === undefined || typeof preview['body'] !== 'string') return undefined;
    const previewAuthor = parseAuthor(preview['author']);
    if (previewAuthor === undefined) return undefined;
    replyToPreview = { author: previewAuthor, body: preview['body'] };
  }
  const mentions = record['mentions'];
  if (
    mentions !== undefined &&
    (!Array.isArray(mentions) ||
      mentions.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['botSlug'] !== 'string' ||
          typeof item['label'] !== 'string' ||
          typeof item['start'] !== 'number' ||
          typeof item['end'] !== 'number'
        );
      }))
  )
    return undefined;
  const channelRefs = record['channelRefs'];
  const humanMentions = record['humanMentions'];
  if (
    humanMentions !== undefined &&
    (!Array.isArray(humanMentions) ||
      author.kind !== 'bot' ||
      humanMentions.some((entry) => {
        const mention = asRecord(entry);
        return (
          mention === undefined ||
          typeof mention['humanId'] !== 'string' ||
          mention['humanId'].length === 0 ||
          typeof mention['label'] !== 'string' ||
          mention['label'].length === 0 ||
          typeof mention['start'] !== 'number' ||
          typeof mention['end'] !== 'number' ||
          !Number.isSafeInteger(mention['start']) ||
          !Number.isSafeInteger(mention['end']) ||
          mention['start'] < 0 ||
          mention['end'] <= mention['start'] ||
          body.slice(mention['start'], mention['end']) !== '@' + mention['label']
        );
      }))
  )
    return undefined;
  if (
    channelRefs !== undefined &&
    (!Array.isArray(channelRefs) ||
      channelRefs.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['channelId'] !== 'string' ||
          typeof item['label'] !== 'string' ||
          typeof item['start'] !== 'number' ||
          typeof item['end'] !== 'number'
        );
      }))
  )
    return undefined;
  const channelRevision = record['channelRevision'];
  if (
    channelRevision !== undefined &&
    (typeof channelRevision !== 'number' ||
      !Number.isSafeInteger(channelRevision) ||
      channelRevision < 1)
  )
    return undefined;
  const humanReceipts = record['humanReceipts'];
  if (
    humanReceipts !== undefined &&
    (!Array.isArray(humanReceipts) ||
      humanReceipts.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['humanId'] !== 'string' ||
          typeof item['displayName'] !== 'string' ||
          (item['state'] !== 'unread' && item['state'] !== 'read')
        );
      }))
  )
    return undefined;
  const deliveries = record['deliveries'];
  if (
    deliveries !== undefined &&
    (!Array.isArray(deliveries) ||
      deliveries.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['botSlug'] !== 'string' ||
          ![
            'pending',
            'observed',
            'running',
            'retryable',
            'needs-repair',
            'handled',
            'ignored',
          ].includes(String(item['state']))
        );
      }))
  )
    return undefined;
  return {
    id,
    at,
    author,
    body,
    ...(asRecord(record['onboardingWelcome'])?.['version'] === 1 && author.kind === 'system'
      ? { onboardingWelcome: { version: 1 as const } }
      : {}),
    ...(body === '' && asRecord(record['contentPurge'])?.['actor'] === 'local-human'
      ? { contentPurged: true as const }
      : {}),
    ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
    ...(mentions === undefined
      ? {}
      : { mentions: mentions as NonNullable<ChannelMessage['mentions']> }),
    ...(humanMentions === undefined
      ? {}
      : { humanMentions: humanMentions as NonNullable<ChannelMessage['humanMentions']> }),
    ...(channelRefs === undefined
      ? {}
      : { channelRefs: channelRefs as NonNullable<ChannelMessage['channelRefs']> }),
    ...(deliveries === undefined
      ? {}
      : { deliveries: deliveries as NonNullable<ChannelMessage['deliveries']> }),
    ...(humanReceipts === undefined
      ? {}
      : { humanReceipts: humanReceipts as NonNullable<ChannelMessage['humanReceipts']> }),
    ...(channelRevision === undefined ? {} : { channelRevision }),
    ...(grantRequest === true ? { grantRequest: true as const } : {}),
    ...(grantRequest === true && record['grantRequestResolved'] === true
      ? { grantRequestResolved: true }
      : {}),
    ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
    ...(assignmentReply === undefined ? {} : { assignmentReply }),
    ...(botDmAction === undefined ? {} : { botDmAction }),
    ...(memoryCommit === undefined ? {} : { memoryCommit }),
    ...(memberDeparture === undefined ? {} : { memberDeparture }),
    ...(toolApprovalRequest === undefined ? {} : { toolApprovalRequest }),
    ...(sessionFailure === undefined ? {} : { sessionFailure }),
    ...(toolApprovalDecision === undefined ? {} : { toolApprovalDecision }),
    ...(userQuestionRequest === undefined ? {} : { userQuestionRequest }),
    ...(userQuestionResolution === undefined ? {} : { userQuestionResolution }),
    ...(attachments === undefined ? {} : { attachments: attachments as ChannelAttachmentRef[] }),
    ...(format === undefined ? {} : { format }),
    ...(bridgeOrigin === undefined ? {} : { bridgeOrigin }),
    ...(bridgeMedia === undefined ? {} : { bridgeMedia }),
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(replyToPreview === undefined ? {} : { replyToPreview }),
  };
}

export function parseChannelMessages(value: unknown): ChannelMessage[] {
  const messages = asRecord(value)?.['messages'];
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((entry) => {
    const message = parseChannelMessage(entry);
    return message === undefined ? [] : [message];
  });
}

export interface SessionBotOwner {
  botSlug: string;
  displayName: string;
  avatar?: string;
  appearance?: AvatarAppearance;
  avatarSeed?: 2;
  role: 'orchestrator' | 'assignment';
}

export function parseSessionBotOwner(value: unknown): SessionBotOwner | undefined {
  const owner = asRecord(asRecord(value)?.['owner']);
  if (owner === undefined) return undefined;
  const botSlug = owner['botSlug'];
  const displayName = owner['displayName'];
  const role = owner['role'];
  if (typeof botSlug !== 'string' || botSlug.length === 0) return undefined;
  if (typeof displayName !== 'string' || displayName.length === 0) return undefined;
  if (role !== 'orchestrator' && role !== 'assignment') return undefined;
  const avatar = owner['avatar'];
  return {
    botSlug,
    displayName,
    ...(typeof avatar === 'string' && avatar.length > 0 ? { avatar } : {}),
    ...(isAvatarAppearance(owner['appearance']) ? { appearance: owner['appearance'] } : {}),
    ...(owner['avatarSeed'] === 2 ? { avatarSeed: 2 as const } : {}),
    role,
  };
}

export function parseOwnedSessionSummaries(value: unknown): OwnedSessionSummary[] {
  const sessions = asRecord(value)?.['sessions'];
  if (!Array.isArray(sessions)) return [];
  return sessions.flatMap((entry) => {
    const record = asRecord(entry);
    if (record === undefined) return [];
    const sessionId = record['sessionId'];
    const role = record['role'];
    const createdAt = record['createdAt'];
    const activity = record['assignmentActivity'];
    const accessMode = record['assignmentAccessMode'];
    if (typeof sessionId !== 'string' || sessionId.length === 0) return [];
    if (role !== 'orchestrator' && role !== 'assignment') return [];
    if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) return [];
    if (
      activity !== undefined &&
      activity !== 'working' &&
      activity !== 'idle' &&
      activity !== 'error' &&
      activity !== 'stopping' &&
      activity !== 'stopped'
    )
      return [];
    const cwdReference = record['cwdReference'];
    return [
      {
        sessionId,
        role,
        createdAt,
        ...(typeof cwdReference === 'string' ? { cwdReference } : {}),
        ...(activity === undefined ? {} : { assignmentActivity: activity }),
        ...(role === 'assignment' &&
        (accessMode === 'workspace-write' || accessMode === 'danger-full-access')
          ? { assignmentAccessMode: accessMode }
          : {}),
      },
    ];
  });
}

export async function loadBots(call: BridgeCall, signal?: AbortSignal): Promise<BotSummary[]> {
  return parseBotSummaries(await unwrap(call, 'list', {}, signal));
}

export async function botExists(call: BridgeCall, slug: string): Promise<boolean> {
  const bots = asRecord(await unwrap(call, 'list', {}))?.['bots'];
  if (!Array.isArray(bots))
    throw new BridgeCallError('invalid-response', 'Invalid Bot identity list');
  const identities = bots.map((entry) => asRecord(entry)?.['slug']);
  if (!identities.every((identity) => typeof identity === 'string' && identity.length > 0))
    throw new BridgeCallError('invalid-response', 'Invalid Bot identity list');
  return identities.includes(slug);
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

export async function createPersonaBot(
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

function botZipUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`./api/botharness/${path}`, document.baseURI);
  url.search = new URLSearchParams(params).toString();
  return url.href;
}

async function botZipError(response: Response): Promise<BridgeCallError> {
  let code = response.status === 413 ? 'too-large' : 'unavailable';
  let message = `Bot zip request failed (${response.status})`;
  try {
    const error = asRecord(asRecord(await response.json())?.['error']);
    if (typeof error?.['code'] === 'string') code = error['code'];
    if (typeof error?.['message'] === 'string') message = error['message'];
  } catch {}
  return new BridgeCallError(code, message);
}

function attachmentFileName(header: string | null, fallback: string): string {
  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(header ?? '')?.[1];
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded);
    } catch {}
  }
  return fallback;
}

export async function importBotZip(file: File, signal?: AbortSignal): Promise<BotSummary> {
  const response = await fetch(botZipUrl('bot-zip/import', { name: file.name }), {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: file,
    credentials: 'same-origin',
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw await botZipError(response);
  const bot = parseBotSummary(asRecord(await response.json())?.['bot']);
  if (bot === undefined) throw new Error('invalid Bot zip import response');
  return bot;
}

export interface BotZipFileListing {
  files: Array<{ path: string; size: number }>;
  always: string[];
}

export async function loadBotZipFiles(
  slug: string,
  signal?: AbortSignal,
): Promise<BotZipFileListing> {
  const response = await fetch(botZipUrl('bot-zip/files', { slug }), {
    credentials: 'same-origin',
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw await botZipError(response);
  const value = asRecord(await response.json());
  const files: BotZipFileListing['files'] = [];
  for (const item of Array.isArray(value?.['files']) ? value['files'] : []) {
    const entry = asRecord(item);
    if (typeof entry?.['path'] === 'string' && typeof entry['size'] === 'number') {
      files.push({ path: entry['path'], size: entry['size'] });
    }
  }
  const always = Array.isArray(value?.['always'])
    ? value['always'].filter((path): path is string => typeof path === 'string')
    : [];
  return { files, always };
}

export interface BotZipExportChoice {
  include?: readonly string[];
  history?: boolean;
}

export async function downloadBotZip(
  slug: string,
  fallbackName: string,
  choice: BotZipExportChoice = {},
  signal?: AbortSignal,
): Promise<{ blob: Blob; name: string }> {
  const { include } = choice;
  const query = include === undefined ? { slug, ...(choice.history ? { history: '1' } : {}) } : {};
  const response = await fetch(botZipUrl('bot-zip', query), {
    credentials: 'same-origin',
    ...(include === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug, include }),
        }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw await botZipError(response);
  return {
    blob: await response.blob(),
    name: attachmentFileName(response.headers.get('content-disposition'), `${fallbackName}.zip`),
  };
}

export async function loadMarketplacePage(
  call: BridgeCall,
  query: MarketplaceQuery = {},
): Promise<MarketplacePage> {
  const page = parseMarketplacePage(await unwrap(call, 'marketplaceList', { query }));
  if (page === undefined) throw new Error('invalid marketplaceList response');
  return page;
}

export async function loadMarketplaceDetail(
  call: BridgeCall,
  id: string,
): Promise<MarketplaceDetail> {
  const detail = parseMarketplaceDetail(await unwrap(call, 'marketplaceDetail', { id }));
  if (detail === undefined) throw new Error('invalid marketplaceDetail response');
  return detail;
}

export async function loadMarketplaceTopics(call: BridgeCall): Promise<MarketplaceTopic[]> {
  const topics = parseMarketplaceTopics({ topics: await unwrap(call, 'marketplaceTopics', {}) });
  if (topics === undefined) throw new Error('invalid marketplaceTopics response');
  return topics;
}

export async function loadMarketplaceChallenge(call: BridgeCall): Promise<AltchaChallenge> {
  const challenge = parseChallenge(await unwrap(call, 'marketplaceChallenge', {}));
  if (challenge === undefined) throw new Error('invalid marketplaceChallenge response');
  return challenge;
}

export async function submitMarketplaceRepository(
  call: BridgeCall,
  url: string,
  altcha: string,
): Promise<MarketplaceEntry> {
  const result = parseMarketplaceSubmission(
    await unwrap(call, 'marketplaceSubmit', { url, altcha }),
  );
  if (result === undefined) throw new Error('invalid marketplaceSubmit response');
  return result.bot;
}

export async function reportMarketplaceBot(
  call: BridgeCall,
  id: string,
  altcha: string,
  reason?: string,
): Promise<void> {
  await unwrap(call, 'marketplaceReport', {
    id,
    altcha,
    ...(reason === undefined ? {} : { reason }),
  });
}

export async function loadChannels(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<ChannelSummary[]> {
  return parseChannelRecords(await unwrap(call, 'channels', {}, signal));
}

export async function openDmChannel(
  call: BridgeCall,
  slug: string,
  displayName: string,
  signal?: AbortSignal,
): Promise<ChannelSummary> {
  const value = await unwrap(call, 'channelDm', { slug, displayName }, signal);
  const channel = parseChannelRecord(asRecord(value)?.['channel']);
  if (channel === undefined) throw new Error('invalid channelDm response');
  return channel;
}

export async function createGroupChannel(
  call: BridgeCall,
  name: string,
  signal?: AbortSignal,
): Promise<ChannelSummary> {
  const value = await unwrap(call, 'channelCreate', { name, members: [] }, signal);
  const channel = parseChannelRecord(asRecord(value)?.['channel']);

  if (channel === undefined) throw new Error('invalid channelCreate response');
  return channel;
}

export interface RenameChannelResult {
  channel: ChannelSummary;
  bot?: BotSummary;
}

export async function renameChannel(
  call: BridgeCall,
  channelId: string,
  name: string,
  signal?: AbortSignal,
): Promise<RenameChannelResult> {
  const value = asRecord(await unwrap(call, 'channelRename', { channelId, name }, signal));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelRename response');
  const bot = parseBotSummary(value?.['bot']);
  return { channel, ...(bot === undefined ? {} : { bot }) };
}

export interface LocalHumanIdentity {
  humanId: string;
  defaultDisplayName: string | null;
  displayName: string;
}

function parseHumanIdentity(value: unknown): LocalHumanIdentity {
  const item = asRecord(value);
  const name = item?.['defaultDisplayName'];
  if (
    item?.['humanId'] !== 'local-human' ||
    (name !== null &&
      (typeof name !== 'string' || name.trim().length === 0 || name.length > 128)) ||
    item['displayName'] !== (name ?? 'Human')
  )
    throw new Error('invalid local Human identity');
  return {
    humanId: 'local-human',
    defaultDisplayName: name,
    displayName: item['displayName'] as string,
  };
}

export type TelemetryLock = 'config' | 'DO_NOT_TRACK' | 'BOTHARNESS_TELEMETRY';

export interface TelemetryStatus {
  enabled: boolean;
  preference: boolean;
  lockedBy?: TelemetryLock;
}

const TELEMETRY_LOCKS: readonly TelemetryLock[] = [
  'config',
  'DO_NOT_TRACK',
  'BOTHARNESS_TELEMETRY',
];

export function parseTelemetryStatus(value: unknown): TelemetryStatus {
  const item = asRecord(value);
  if (typeof item?.['enabled'] !== 'boolean') throw new Error('invalid telemetry status');
  const lockedBy = TELEMETRY_LOCKS.find((lock) => lock === item['lockedBy']);
  return {
    enabled: item['enabled'],
    preference: item['preference'] !== false,
    ...(lockedBy === undefined ? {} : { lockedBy }),
  };
}

export type GitUnavailableReason = 'missing' | 'unrunnable' | 'too-old';

export type GitInstallFailure = 'unsupported' | 'network' | 'checksum' | 'unpack' | 'unrunnable';

export type GitInstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; received: number; total?: number }
  | { phase: 'verifying' }
  | { phase: 'unpacking' }
  | { phase: 'failed'; reason: GitInstallFailure; detail?: string };

export type GitAvailability = (
  | { available: true; version: string; source: 'system' | 'managed' }
  | { available: false; reason: GitUnavailableReason; version?: string }
) & { installable: boolean; install: GitInstallState };

const GIT_UNAVAILABLE_REASONS: readonly GitUnavailableReason[] = [
  'missing',
  'unrunnable',
  'too-old',
];

const GIT_INSTALL_FAILURES: readonly GitInstallFailure[] = [
  'unsupported',
  'network',
  'checksum',
  'unpack',
  'unrunnable',
];

function parseGitInstall(value: unknown): GitInstallState {
  const item = asRecord(value);
  const phase = item?.['phase'];
  if (phase === 'downloading') {
    const received = typeof item?.['received'] === 'number' ? item['received'] : 0;
    const total = typeof item?.['total'] === 'number' ? item['total'] : undefined;
    return { phase, received, ...(total === undefined ? {} : { total }) };
  }
  if (phase === 'verifying' || phase === 'unpacking') return { phase };
  if (phase === 'failed') {
    const reason = GIT_INSTALL_FAILURES.find((candidate) => candidate === item?.['reason']);
    const detail = typeof item?.['detail'] === 'string' ? item['detail'] : undefined;
    return {
      phase,
      reason: reason ?? 'unpack',
      ...(detail === undefined ? {} : { detail }),
    };
  }
  return { phase: 'idle' };
}

export function gitInstalling(git: GitAvailability | undefined): boolean {
  const phase = git?.install.phase;
  return phase === 'downloading' || phase === 'verifying' || phase === 'unpacking';
}

export function parseGitAvailability(value: unknown): GitAvailability {
  const item = asRecord(value);
  const version = typeof item?.['version'] === 'string' ? item['version'] : undefined;
  const extra = {
    installable: item?.['installable'] === true,
    install: parseGitInstall(item?.['install']),
  };
  if (item?.['available'] === true && version !== undefined) {
    const source = item['source'] === 'managed' ? 'managed' : 'system';
    return { available: true, version, source, ...extra };
  }
  const reason = GIT_UNAVAILABLE_REASONS.find((candidate) => candidate === item?.['reason']);
  if (item?.['available'] !== false || reason === undefined) throw new Error('invalid Git status');
  return { available: false, reason, ...(version === undefined ? {} : { version }), ...extra };
}

export async function loadGitAvailability(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<GitAvailability> {
  return parseGitAvailability(await unwrap(call, 'gitStatus', {}, signal));
}

export async function startGitInstall(call: BridgeCall): Promise<GitAvailability> {
  return parseGitAvailability(await unwrap(call, 'gitInstall', {}));
}

export async function loadTelemetryStatus(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<TelemetryStatus> {
  return parseTelemetryStatus(await unwrap(call, 'telemetryStatus', {}, signal));
}

export async function setTelemetryPreference(
  call: BridgeCall,
  enabled: boolean,
): Promise<TelemetryStatus> {
  return parseTelemetryStatus(await unwrap(call, 'telemetrySet', { enabled }));
}

export async function loadHumanIdentity(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<LocalHumanIdentity> {
  return parseHumanIdentity(await unwrap(call, 'humanIdentity', {}, signal));
}

export async function setHumanDefaultName(
  call: BridgeCall,
  displayName: string | null,
): Promise<LocalHumanIdentity> {
  return parseHumanIdentity(await unwrap(call, 'humanNameSet', { displayName }));
}

export async function setChannelHumanName(
  call: BridgeCall,
  channelId: string,
  nickname: string | null,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelHumanNameSet', { channelId, nickname }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined || channel.id !== channelId)
    throw new Error('invalid channelHumanNameSet response');
  return channel;
}

export async function setGroupAvatar(
  call: BridgeCall,
  channelId: string,
  avatar: string | null,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupAvatarSet', { channelId, avatar }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupAvatarSet response');
  return channel;
}

export async function setBotAvatar(
  call: BridgeCall,
  channelId: string,
  avatar: string | null,
): Promise<BotSummary> {
  const value = asRecord(await unwrap(call, 'botAvatarSet', { channelId, avatar }));
  const bot = parseBotSummary(value?.['bot']);
  if (bot === undefined) throw new Error('invalid botAvatarSet response');
  return bot;
}

export async function setBotBanner(
  call: BridgeCall,
  channelId: string,
  banner: { recipe: PixelBannerRecipe } | { image: string } | null,
): Promise<BotSummary> {
  const value = asRecord(await unwrap(call, 'botBannerSet', { channelId, banner }));
  const bot = parseBotSummary(value?.['bot']);
  if (bot === undefined) throw new Error('invalid botBannerSet response');
  return bot;
}

export async function updateBotProfile(
  call: BridgeCall,
  slug: string,
  patch: { roles?: string[]; description?: string },
): Promise<BotSummary> {
  const value = asRecord(await unwrap(call, 'update', { slug, patch }));
  const bot = parseBotSummary(value?.['bot']);
  if (bot === undefined) throw new Error('invalid update response');
  return bot;
}

export async function setBotAppearance(
  call: BridgeCall,
  channelId: string,
  recipe: AvatarRecipe,
): Promise<BotSummary> {
  const value = asRecord(await unwrap(call, 'botAppearanceSet', { channelId, recipe }));
  const bot = parseBotSummary(value?.['bot']);
  if (bot === undefined) throw new Error('invalid botAppearanceSet response');
  return bot;
}

export async function loadPartLibrary(call: BridgeCall): Promise<PartLibraryEntry[]> {
  const parts = asRecord(await unwrap(call, 'partLibraryList', {}))?.['parts'];
  if (!Array.isArray(parts)) throw new Error('invalid partLibraryList response');
  return parts.filter(isPartLibraryEntry);
}

export async function exportLibraryParts(
  call: BridgeCall,
  id?: string,
  part?: PixelCustomPart,
): Promise<{ fileName: string; data: string }> {
  const value = asRecord(
    await unwrap(
      call,
      'partLibraryExport',
      part !== undefined ? { part } : id === undefined ? {} : { id },
    ),
  );
  const fileName = value?.['fileName'];
  const data = value?.['data'];
  if (typeof fileName !== 'string' || typeof data !== 'string')
    throw new Error('invalid partLibraryExport response');
  return { fileName, data };
}

export async function importLibraryParts(
  call: BridgeCall,
  data: string,
): Promise<{ added: PartLibraryEntry[]; refused: number; image?: PartImageInfo }> {
  const value = asRecord(await unwrap(call, 'partLibraryImport', { data }));
  const added = value?.['added'];
  const refused = value?.['refused'];
  if (!Array.isArray(added) || !Array.isArray(refused))
    throw new Error('invalid partLibraryImport response');
  const image = asRecord(value?.['image']);
  const info =
    image &&
    typeof image['width'] === 'number' &&
    typeof image['height'] === 'number' &&
    typeof image['colors'] === 'number' &&
    Array.isArray(image['slots']) &&
    image['slots'].every((slot) => typeof slot === 'string')
      ? {
          width: image['width'],
          height: image['height'],
          colors: image['colors'],
          slots: image['slots'] as string[],
        }
      : undefined;
  return {
    added: added.filter(isPartLibraryEntry),
    refused: refused.length,
    ...(info ? { image: info } : {}),
  };
}

export interface PartImageInfo {
  width: number;
  height: number;
  colors: number;
  slots: string[];
}

export async function importLibraryImage(
  call: BridgeCall,
  data: string,
  slot: string,
  colors: number,
  name: string,
): Promise<PartLibraryEntry> {
  const entry = asRecord(
    await unwrap(call, 'partLibraryImportImage', { data, slot, colors, name }),
  )?.['entry'];
  if (!isPartLibraryEntry(entry)) throw new Error('invalid partLibraryImportImage response');
  return entry;
}

export async function addLibraryPart(
  call: BridgeCall,
  part: PixelCustomPart,
  name: string,
  parent?: string,
): Promise<PartLibraryEntry> {
  const entry = asRecord(
    await unwrap(call, 'partLibraryAdd', { part, name, ...(parent ? { parent } : {}) }),
  )?.['entry'];
  if (!isPartLibraryEntry(entry)) throw new Error('invalid partLibraryAdd response');
  return entry;
}

export async function inviteGroupBot(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupInvite', { channelId, botSlug }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupInvite response');
  return channel;
}

export async function cancelGroupInvitation(
  call: BridgeCall,
  channelId: string,
  invitationId: string,
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupInviteCancel', { channelId, invitationId }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupInviteCancel response');
  return channel;
}

export async function decideGroupJoin(
  call: BridgeCall,
  channelId: string,
  requestId: string,
  accept: boolean,
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupJoinDecide', { channelId, requestId, accept }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupJoinDecide response');
  return channel;
}

export async function removeGroupMember(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupMemberRemove', { channelId, botSlug }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupMemberRemove response');
  return channel;
}

export async function loadGroupWakePolicies(
  call: BridgeCall,
  channelId: string,
): Promise<GroupMemberWakePolicy[]> {
  const value = asRecord(await unwrap(call, 'channelGroupWakePolicies', { channelId }));
  const members = value?.['members'];
  if (
    !Array.isArray(members) ||
    members.some(
      (row) =>
        typeof row.botSlug !== 'string' ||
        typeof row.inherited !== 'boolean' ||
        !row.policy ||
        !['all', 'mentions', 'digest', 'silent'].includes(row.policy.mode) ||
        !Number.isSafeInteger(row.policy.count) ||
        !Number.isSafeInteger(row.policy.intervalSeconds),
    )
  )
    throw new Error('invalid channelGroupWakePolicies response');
  return members;
}

export async function setGroupWakePolicy(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
  policy: {
    mode: 'all' | 'mentions' | 'digest' | 'silent';
    count: number;
    intervalSeconds: number;
    inherit?: boolean;
  },
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupWakeSet', {
      channelId,
      botSlug,
      ...policy,
    }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupWakeSet response');
  return channel;
}

export async function deleteGroupChannel(call: BridgeCall, channelId: string): Promise<void> {
  await unwrap(call, 'channelGroupDelete', { channelId });
}

export async function loadChannelMessages(
  call: BridgeCall,
  channelId: string,
  signal?: AbortSignal,
): Promise<{ messages: ChannelMessage[]; revision: number }> {
  const value = await unwrap(call, 'channelMessages', { channelId }, signal);
  const revision = asRecord(value)?.['revision'];
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('invalid channelMessages revision');
  }
  return { messages: parseChannelMessages(value).reverse(), revision };
}
export interface TimelinePage {
  entries: ChannelMessage[];
  olderCursor: string | null;
  newerCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
}

export interface TimelinePageRequest {
  direction?: 'older' | 'newer' | 'around';
  cursor?: string;
  around?: string;
  limit?: number;
  olderLimit?: number;
  newerLimit?: number;
}

export async function loadTimelinePage(
  call: BridgeCall,
  channelId: string,
  request: TimelinePageRequest = {},
  signal?: AbortSignal,
): Promise<{ page: TimelinePage; revision: number }> {
  const response = asRecord(
    await unwrap(call, 'channelTimeline', { channelId, ...request }, signal),
  );
  const revision = response?.['revision'];
  const raw = asRecord(response?.['page']);
  const entries = raw?.['entries'];
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Array.isArray(entries) ||
    !entries.every((entry) => parseChannelMessage(entry) !== undefined) ||
    !(raw?.['olderCursor'] === null || typeof raw?.['olderCursor'] === 'string') ||
    !(raw?.['newerCursor'] === null || typeof raw?.['newerCursor'] === 'string') ||
    typeof raw?.['hasOlder'] !== 'boolean' ||
    typeof raw?.['hasNewer'] !== 'boolean'
  )
    throw new Error('invalid channelTimeline response');
  return {
    revision,
    page: {
      entries: entries.map((entry) => parseChannelMessage(entry)!),
      olderCursor: raw['olderCursor'] as string | null,
      newerCursor: raw['newerCursor'] as string | null,
      hasOlder: raw['hasOlder'],
      hasNewer: raw['hasNewer'],
    },
  };
}

export async function loadReadPosition(
  call: BridgeCall,
  channelId: string,
): Promise<string | undefined> {
  const value = asRecord(await unwrap(call, 'channelReadPosition', { channelId }));
  const position = value?.['position'];
  if (position === undefined) return undefined;
  const messageId = asRecord(position)?.['messageId'];
  if (typeof messageId !== 'string' || messageId.length === 0)
    throw new Error('invalid channelReadPosition response');
  return messageId;
}

export async function markReadPosition(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<void> {
  await unwrap(call, 'channelMarkRead', { channelId, messageId });
}

export async function loadHumanAssignmentContext(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  sourceEventId: string,
  signal?: AbortSignal,
): Promise<HumanAssignmentContext> {
  const context = asRecord(
    asRecord(
      await unwrap(call, 'humanAssignmentContext', { slug, sessionId, sourceEventId }, signal),
    )?.['context'],
  );
  if (
    context === undefined ||
    context['botSlug'] !== slug ||
    context['sessionId'] !== sessionId ||
    context['sourceEventId'] !== sourceEventId ||
    typeof context['purpose'] !== 'string' ||
    typeof context['canReply'] !== 'boolean' ||
    !Array.isArray(context['reports']) ||
    context['reports'].length > 5
  )
    throw new Error('invalid Assignment context');
  const reports: HumanAssignmentContext['reports'] = [];
  for (const value of context['reports']) {
    const row = asRecord(value);
    if (
      row === undefined ||
      typeof row['sourceEventId'] !== 'string' ||
      typeof row['at'] !== 'string' ||
      typeof row['summary'] !== 'string' ||
      (row['state'] !== 'progress' &&
        row['state'] !== 'completed' &&
        row['state'] !== 'blocked' &&
        row['state'] !== 'waiting-human' &&
        row['state'] !== 'failed')
    )
      throw new Error('invalid Assignment report');
    reports.push({
      sourceEventId: row['sourceEventId'],
      at: row['at'],
      summary: row['summary'],
      state: row['state'],
    });
  }
  if (!reports.some((row) => row.sourceEventId === sourceEventId))
    throw new Error('Assignment source report is unavailable');
  let reply: HumanAssignmentContext['reply'];
  if (context['reply'] !== undefined) {
    const row = asRecord(context['reply']);
    if (
      row === undefined ||
      typeof row['id'] !== 'string' ||
      typeof row['at'] !== 'string' ||
      typeof row['body'] !== 'string'
    )
      throw new Error('invalid Assignment response');
    reply = { id: row['id'], at: row['at'], body: row['body'] };
  }
  return {
    botSlug: slug,
    sessionId,
    sourceEventId,
    purpose: context['purpose'],
    canReply: context['canReply'],
    reports,
    ...(typeof context['hasOlder'] === 'boolean' ? { hasOlder: context['hasOlder'] } : {}),
    ...(typeof context['hasNewer'] === 'boolean' ? { hasNewer: context['hasNewer'] } : {}),
    ...(reply === undefined ? {} : { reply }),
  };
}

export async function loadAllBotPreview(
  call: BridgeCall,
  channelId: string,
): Promise<AllBotPreview> {
  const value = parseAllBotPreview(await unwrap(call, 'channelAllBotPreview', { channelId }));
  if (value === undefined) throw new Error('invalid channelAllBotPreview response');
  return value;
}
export function parseAllBotPreview(raw: unknown): AllBotPreview | undefined {
  const value = asRecord(raw);
  if (
    typeof value?.['revision'] !== 'string' ||
    !Array.isArray(value['recipients']) ||
    !value['recipients'].every((item: unknown) => {
      const row = asRecord(item);
      return typeof row?.['botSlug'] === 'string' && typeof row['label'] === 'string';
    })
  )
    return undefined;
  return {
    revision: value['revision'],
    recipients: value['recipients'].map((item) => {
      const row = asRecord(item)!;
      return { botSlug: row['botSlug'] as string, label: row['label'] as string };
    }),
  };
}
export async function sendChannelMessage(
  call: BridgeCall,
  channelId: string,
  body: string,
  replyTo?: string,
  attachments?: ChannelAttachmentRef[],
  messageId?: string,
  signal?: AbortSignal,
  memorySwitchTarget?: string,
  mentions?: ChannelMessage['mentions'],
  channelRefs?: ChannelMessage['channelRefs'],
  grantRequestResolution?: ChannelMessage['grantRequestResolution'],
  assignmentReply?: ChannelMessage['assignmentReply'],
  allBotMention?: AllBotMention,
): Promise<ChannelMessage> {
  const value = await unwrap(
    call,
    'channelSend',
    {
      channelId,
      body,
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(attachments === undefined ? {} : { attachments }),
      ...(messageId === undefined ? {} : { messageId }),
      ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
      ...(mentions === undefined ? {} : { mentions }),
      ...(channelRefs === undefined ? {} : { channelRefs }),
      ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
      ...(assignmentReply === undefined ? {} : { assignmentReply }),
      ...(allBotMention === undefined ? {} : { allBotMention }),
    },
    signal,
  );
  const message = parseChannelMessage(asRecord(value)?.['message']);
  if (message === undefined) throw new Error('invalid channelSend response');
  return message;
}

export interface AssignmentAccessPresetView {
  botSlug: string;
  mode: 'workspace-write' | 'danger-full-access';
  revision: number;
  changedAt?: string;
}
export async function loadAssignmentAccess(
  call: BridgeCall,
  slug: string,
): Promise<AssignmentAccessPresetView> {
  const response = asRecord(await unwrap(call, 'assignmentAccessGet', { slug }));
  const preset = asRecord(response?.['preset']);
  if (
    preset?.['botSlug'] !== slug ||
    (preset['mode'] !== 'workspace-write' && preset['mode'] !== 'danger-full-access') ||
    typeof preset['revision'] !== 'number'
  )
    throw new Error('invalid assignmentAccessGet response');
  return preset as unknown as AssignmentAccessPresetView;
}
export async function setAssignmentAccess(
  call: BridgeCall,
  slug: string,
  mode: AssignmentAccessPresetView['mode'],
  acknowledgeRisk: boolean,
): Promise<AssignmentAccessPresetView> {
  const response = asRecord(
    await unwrap(call, 'assignmentAccessSet', { slug, mode, acknowledgeRisk }),
  );
  const preset = asRecord(response?.['preset']);
  if (preset?.['botSlug'] !== slug || preset['mode'] !== mode)
    throw new Error('invalid assignmentAccessSet response');
  return preset as unknown as AssignmentAccessPresetView;
}

export interface ToolApprovalRuleView {
  id: string;
  botSlug: string;
  role: 'orchestrator' | 'assignment';
  scopeKey: string;
  kind: 'exact' | 'all-opaque';
  toolName: string;
  input: string;
  createdAt: string;
  revokedAt?: string;
}
export async function loadToolApprovalRules(
  call: BridgeCall,
  slug: string,
): Promise<ToolApprovalRuleView[]> {
  const response = asRecord(await unwrap(call, 'toolApprovalRules', { slug }));
  const rules = response?.['rules'];
  if (!Array.isArray(rules)) throw new Error('invalid toolApprovalRules response');
  return rules as ToolApprovalRuleView[];
}
export async function revokeToolApprovalRule(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<void> {
  const response = asRecord(await unwrap(call, 'toolApprovalRuleRevoke', { slug, id }));
  if (asRecord(response?.['rule'])?.['id'] !== id)
    throw new Error('invalid toolApprovalRuleRevoke response');
}

export async function loadToolApprovalStatus(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<'pending' | 'expired'> {
  const response = asRecord(await unwrap(call, 'toolApprovalStatus', { channelId, messageId }));
  const status = response?.['status'];
  if (status !== 'pending' && status !== 'expired') {
    throw new Error('invalid toolApprovalStatus response');
  }
  return status;
}

export type ToolApprovalExecutionState =
  | 'waiting-human'
  | 'waiting-capacity'
  | 'running'
  | 'settled'
  | 'needs-repair';

export async function loadToolApprovalExecutionState(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<ToolApprovalExecutionState | undefined> {
  const response = asRecord(await unwrap(call, 'toolApprovalStatus', { channelId, messageId }));
  const execution = response?.['execution'];
  if (
    execution !== undefined &&
    execution !== 'waiting-human' &&
    execution !== 'waiting-capacity' &&
    execution !== 'running' &&
    execution !== 'settled' &&
    execution !== 'needs-repair'
  )
    throw new Error('invalid toolApprovalStatus execution');
  return execution;
}

export async function decideToolApproval(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected',
): Promise<void> {
  const response = asRecord(
    await unwrap(call, 'toolApprovalDecide', {
      channelId,
      messageId,
      outcome,
    }),
  );
  if (response?.['accepted'] !== true) throw new Error('Tool approval was not accepted');
}

export async function loadUserQuestionStatus(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<'pending' | 'submitted' | 'answered' | 'expired'> {
  const response = asRecord(await unwrap(call, 'userQuestionStatus', { channelId, messageId }));
  const status = response?.['status'];
  if (
    status !== 'pending' &&
    status !== 'submitted' &&
    status !== 'answered' &&
    status !== 'expired'
  )
    throw new Error('invalid userQuestionStatus response');
  return status;
}

export async function answerUserQuestion(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  answers: UserQuestionAnswerItem[],
): Promise<void> {
  const response = asRecord(
    await unwrap(call, 'userQuestionAnswer', { channelId, messageId, answer: { answers } }),
  );
  if (response?.['accepted'] !== true) throw new Error('Question answer was not accepted');
}

export interface WorkspaceOption {
  id: string;
  path: string;
  title: string;
}

export interface WorkspaceGrantView extends WorkspaceOption {
  botSlug: string;
  workspaceId: string;
  workspacePath: string;
  workspaceTitle: string;
  createdAt: string;
  revokedAt?: string;
  orchestratorWrite?: boolean;
  writeRevision?: number;
}

function parseWorkspaceOption(value: unknown): WorkspaceOption | undefined {
  const row = asRecord(value);
  if (
    row === undefined ||
    typeof row['id'] !== 'string' ||
    typeof row['path'] !== 'string' ||
    typeof row['title'] !== 'string'
  )
    return undefined;
  return { id: row['id'], path: row['path'], title: row['title'] };
}

function parseWorkspaceGrant(value: unknown): WorkspaceGrantView | undefined {
  const row = asRecord(value);
  if (
    row === undefined ||
    typeof row['id'] !== 'string' ||
    typeof row['botSlug'] !== 'string' ||
    typeof row['workspaceId'] !== 'string' ||
    typeof row['workspacePath'] !== 'string' ||
    typeof row['workspaceTitle'] !== 'string' ||
    typeof row['createdAt'] !== 'string'
  )
    return undefined;
  return {
    id: row['id'],
    path: row['workspacePath'],
    title: row['workspaceTitle'],
    botSlug: row['botSlug'],
    workspaceId: row['workspaceId'],
    workspacePath: row['workspacePath'],
    workspaceTitle: row['workspaceTitle'],
    createdAt: row['createdAt'],
    orchestratorWrite: row['orchestratorWrite'] === true,
    writeRevision: typeof row['writeRevision'] === 'number' ? row['writeRevision'] : 0,
    ...(typeof row['revokedAt'] === 'string' ? { revokedAt: row['revokedAt'] } : {}),
  };
}

export async function loadWorkspaceOptions(call: BridgeCall): Promise<WorkspaceOption[]> {
  const rows = asRecord(await unwrap(call, 'workspaceOptions', {}))?.['workspaces'];
  if (!Array.isArray(rows)) throw new Error('invalid workspaceOptions response');
  return rows.flatMap((row) => {
    const parsed = parseWorkspaceOption(row);
    return parsed === undefined ? [] : [parsed];
  });
}

export async function loadWorkspaceGrants(
  call: BridgeCall,
  slug: string,
): Promise<WorkspaceGrantView[]> {
  const rows = asRecord(await unwrap(call, 'grants', { slug }))?.['grants'];
  if (!Array.isArray(rows)) throw new Error('invalid grants response');
  return rows.flatMap((row) => {
    const parsed = parseWorkspaceGrant(row);
    return parsed === undefined ? [] : [parsed];
  });
}

export async function createWorkspaceGrant(
  call: BridgeCall,
  slug: string,
  workspaceId: string,
): Promise<WorkspaceGrantView> {
  const value = asRecord(await unwrap(call, 'grantCreate', { slug, workspaceId }))?.['grant'];
  const grant = parseWorkspaceGrant(value);
  if (grant === undefined) throw new Error('invalid grantCreate response');
  return grant;
}

export async function setWorkspaceGrantWrite(
  call: BridgeCall,
  slug: string,
  grantId: string,
  enabled: boolean,
): Promise<WorkspaceGrantView> {
  const value = asRecord(await unwrap(call, 'grantWriteSet', { slug, grantId, enabled }))?.[
    'grant'
  ];
  const grant = parseWorkspaceGrant(value);
  if (grant === undefined) throw new Error('invalid grantWriteSet response');
  return grant;
}

export async function revokeWorkspaceGrant(
  call: BridgeCall,
  slug: string,
  grantId: string,
): Promise<WorkspaceGrantView> {
  const value = asRecord(await unwrap(call, 'grantRevoke', { slug, grantId }))?.['grant'];
  const grant = parseWorkspaceGrant(value);
  if (grant === undefined) throw new Error('invalid grantRevoke response');
  return grant;
}

function parseBotAttentionItem(value: unknown): BotAttentionItem | undefined {
  const row = asRecord(value);
  if (row === undefined) return undefined;
  const required = ['id', 'botSlug', 'reason', 'createdAt', 'sourceKind', 'summary'] as const;
  if (required.some((key) => typeof row[key] !== 'string')) return undefined;
  if (
    ![
      'pending',
      'processing',
      'observed',
      'deferred',
      'needs-repair',
      'handled',
      'ignored',
    ].includes(String(row['state']))
  )
    return undefined;
  if (!['human', 'bot', 'bridged', 'system'].includes(String(row['authorKind']))) return undefined;
  if (typeof row['sourceAvailable'] !== 'boolean') return undefined;
  if (row['externalOrigin'] !== undefined) {
    const origin = asRecord(row['externalOrigin']);
    if (
      !origin ||
      ['platform', 'accountName', 'conversationName', 'conversationId', 'senderId'].some(
        (key) => typeof origin[key] !== 'string',
      ) ||
      (origin['senderName'] !== undefined && typeof origin['senderName'] !== 'string')
    )
      return undefined;
  }
  for (const key of [
    'observedAt',
    'handledAt',
    'ignoredAt',
    'sourceChannelId',
    'sourceChannelName',
    'sourceMessageId',
    'assignmentSessionId',
    'assignmentPurpose',
    'authorBotSlug',
    'scheduleId',
  ])
    if (row[key] !== undefined && typeof row[key] !== 'string') return undefined;
  if (
    row['assignmentReportState'] !== undefined &&
    !['progress', 'completed', 'blocked', 'waiting-human', 'failed'].includes(
      String(row['assignmentReportState']),
    )
  )
    return undefined;
  return row as unknown as BotAttentionItem;
}

export function parseBotAttentionPage(value: unknown): BotAttentionPage {
  const row = asRecord(value);
  const raw = row?.['items'];
  if (!Array.isArray(raw)) throw new Error('invalid Bot attention page');
  const items = raw.map(parseBotAttentionItem);
  if (items.some((item) => item === undefined)) throw new Error('invalid Bot attention item');
  const cursor = row?.['nextCursor'];
  if (cursor !== undefined && typeof cursor !== 'string')
    throw new Error('invalid Bot attention cursor');
  return {
    items: items as BotAttentionItem[],
    ...(cursor === undefined ? {} : { nextCursor: cursor }),
  };
}

export async function loadBotAttention(
  call: BridgeCall,
  slug: string,
  limit = 50,
  cursor?: string,
  state?: BotAttentionStatus,
): Promise<BotAttentionPage> {
  return parseBotAttentionPage(await unwrap(call, 'botAttention', { slug, limit, cursor, state }));
}

function parseHumanAttentionPage(value: unknown): HumanAttentionPage {
  const row = asRecord(value);
  const raw = row?.['items'];
  if (!Array.isArray(raw)) throw new Error('invalid Human attention page');
  const items = raw.map((entry): HumanAttentionItem | undefined => {
    const item = asRecord(entry);
    if (item === undefined) return undefined;
    for (const key of ['id', 'createdAt', 'botSlug', 'summary'])
      if (typeof item[key] !== 'string') return undefined;
    if (
      item['category'] !== 'action' &&
      item['category'] !== 'info' &&
      item['category'] !== 'unread' &&
      item['category'] !== 'replies' &&
      item['category'] !== 'handled'
    )
      return undefined;
    if (
      item['kind'] !== 'group-join-request' &&
      item['kind'] !== 'user-question' &&
      item['kind'] !== 'tool-approval' &&
      item['kind'] !== 'workspace-grant-request' &&
      item['kind'] !== 'bot-dm-message' &&
      item['kind'] !== 'assignment-waiting-human' &&
      item['kind'] !== 'assignment-blocked' &&
      item['kind'] !== 'assignment-report' &&
      item['kind'] !== 'bot-message-needs-repair' &&
      item['kind'] !== 'channel-unread' &&
      item['kind'] !== 'channel-reply' &&
      item['kind'] !== 'channel-mention'
    )
      return undefined;
    if (item['channelId'] !== undefined && typeof item['channelId'] !== 'string') return undefined;
    if (item['channelName'] !== undefined && typeof item['channelName'] !== 'string')
      return undefined;
    if (
      item['kind'] === 'assignment-waiting-human' ||
      item['kind'] === 'assignment-blocked' ||
      item['kind'] === 'assignment-report'
        ? typeof item['assignmentSessionId'] !== 'string'
        : typeof item['channelId'] !== 'string' || typeof item['channelName'] !== 'string'
    )
      return undefined;
    if (
      item['assignmentSessionId'] !== undefined &&
      typeof item['assignmentSessionId'] !== 'string'
    )
      return undefined;
    if (item['sourceEventId'] !== undefined && typeof item['sourceEventId'] !== 'string')
      return undefined;
    if (
      (item['kind'] === 'assignment-report' || item['kind'] === 'bot-message-needs-repair') &&
      typeof item['sourceEventId'] !== 'string'
    )
      return undefined;
    if (item['requestId'] !== undefined && typeof item['requestId'] !== 'string') return undefined;
    if (item['messageId'] !== undefined && typeof item['messageId'] !== 'string') return undefined;
    if (
      item['kind'] === 'channel-unread' &&
      (!Number.isSafeInteger(item['unreadCount']) ||
        (item['unreadCount'] as number) < 1 ||
        typeof item['messageId'] !== 'string')
    )
      return undefined;
    if (
      (item['kind'] === 'channel-reply' ||
        item['kind'] === 'channel-mention' ||
        item['category'] === 'replies') &&
      ((item['kind'] !== 'channel-reply' && item['kind'] !== 'channel-mention') ||
        item['category'] !== 'replies' ||
        typeof item['messageId'] !== 'string' ||
        typeof item['sourceEventId'] !== 'string' ||
        typeof item['isUnread'] !== 'boolean')
    )
      return undefined;
    if (
      item['category'] === 'handled' &&
      (![
        'user-question',
        'tool-approval',
        'workspace-grant-request',
        'assignment-waiting-human',
        'assignment-blocked',
      ].includes(String(item['kind'])) ||
        typeof item['channelId'] !== 'string' ||
        typeof item['responseMessageId'] !== 'string' ||
        typeof item['responseSourceEventId'] !== 'string' ||
        typeof item['sourceEventId'] !== 'string' ||
        (item['kind'] !== 'assignment-waiting-human' &&
          item['kind'] !== 'assignment-blocked' &&
          typeof item['messageId'] !== 'string'))
    )
      return undefined;
    return item as unknown as HumanAttentionItem;
  });
  if (items.some((item) => item === undefined)) throw new Error('invalid Human attention item');
  const cursor = row?.['nextCursor'];
  if (cursor !== undefined && typeof cursor !== 'string')
    throw new Error('invalid Human attention cursor');
  return {
    items: items as HumanAttentionItem[],
    ...(cursor === undefined ? {} : { nextCursor: cursor }),
  };
}

export async function loadHumanAttention(
  call: BridgeCall,
  category: HumanInboxCategory,
  limit = 50,
  cursor?: string,
  filters: HumanInboxFilters = { botSlug: undefined, channelId: undefined, sort: 'newest' },
): Promise<HumanAttentionPage> {
  return parseHumanAttentionPage(
    await unwrap(call, 'humanAttention', {
      category,
      limit,
      cursor,
      botSlug: filters.botSlug,
      channelId: filters.channelId,
      sort: filters.sort,
    }),
  );
}
export async function loadHumanAttentionStatus(
  call: BridgeCall,
): Promise<{ unreadCount: number; hasAction: boolean }> {
  const row = asRecord(await unwrap(call, 'humanAttentionStatus', {}));
  if (
    row === undefined ||
    !Number.isSafeInteger(row['unreadCount']) ||
    (row['unreadCount'] as number) < 0 ||
    typeof row['hasAction'] !== 'boolean'
  )
    throw new Error('invalid Human attention status');
  return { unreadCount: row['unreadCount'] as number, hasAction: row['hasAction'] };
}
export async function dismissHumanInboxItem(
  call: BridgeCall,
  itemId: string,
  sourceKey: string,
): Promise<void> {
  const value = asRecord(await unwrap(call, 'humanAttentionDismiss', { itemId, sourceKey }));
  if (value?.['accepted'] !== true) throw new Error('Inbox dismissal was not confirmed');
}

export async function ignoreHumanAssignmentReport(
  call: BridgeCall,
  sourceEventId: string,
): Promise<void> {
  const response = asRecord(await unwrap(call, 'humanAttentionIgnore', { sourceEventId }));
  if (response?.['accepted'] !== true) throw new Error('Human attention decision was not accepted');
}

export async function loadSessionBotOwner(
  call: BridgeCall,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionBotOwner | undefined> {
  return parseSessionBotOwner(await unwrap(call, 'sessionOwner', { sessionId }, signal));
}

export async function loadSessions(
  call: BridgeCall,
  slug: string,
  signal?: AbortSignal,
): Promise<OwnedSessionSummary[]> {
  return parseOwnedSessionSummaries(await unwrap(call, 'sessions', { slug }, signal));
}

export async function loadRoster(call: BridgeCall, signal?: AbortSignal): Promise<RosterSnapshot> {
  return parseRosterSnapshot(await unwrap(call, 'rosterGet', {}, signal));
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
  return parseRosterSnapshot(await unwrap(call, 'rosterBatch', payload, signal));
}

export async function createRosterSection(
  call: BridgeCall,
  name: string,
  signal?: AbortSignal,
): Promise<RosterSection> {
  const value = await unwrap(call, 'sectionCreate', { name }, signal);
  const section = parseRosterSection(asRecord(value)?.['section']);
  if (section === undefined) throw new Error('invalid sectionCreate response');
  return section;
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
  await unwrap(call, 'sectionRemove', { sectionId }, signal);
}

export async function assignRosterChannel(
  call: BridgeCall,
  channelId: string,
  sectionId: string | undefined,
  index?: number,
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'channelAssign', { channelId, sectionId, index }, signal);
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

export interface MemoryAcceptedCommit {
  botSlug: string;
  sha: string;
  parentSha: string | null;
  actorKind: 'agent' | 'human' | 'system';
  actorId: string;
  causeKind: 'source-event' | 'human-edit' | 'repository-init';
  causeId: string;
  validationResult: string;
  acceptedAt: string;
}

export interface MemoryGitCommit {
  sha: string;
  parents: string[];
  subject: string;
  authoredAt: string;
  branches: string[];
  status: 'accepted' | 'pending' | 'needs-repair';
}

export interface MemoryGitGraph {
  head: string;
  currentBranch: string | null;
  branches: string[];
  dirty: boolean;
  commits: MemoryGitCommit[];
  hasMore: boolean;
}

export interface MemoryGitCommitDiff {
  sha: string;
  subject?: string;
  files: { path: string; status: string }[];
  diff: string;
}

export type MemoryWorkingKind = 'staged' | 'unstaged' | 'untracked' | 'current';
export interface MemoryWorkingChange {
  path: string;
  kind: MemoryWorkingKind;
  status: string;
}
export interface MemoryWorkingDiff extends MemoryWorkingChange {
  diff: string;
  binary: boolean;
}

export interface MemoryRecoveryCheckpoint {
  id: string;
  branch: string;
  head: string;
  indexTree: string;
  workingTree: string;
  origin: 'host-observation' | 'agent-session' | 'human-command';
  originId: string;
  causeKind: 'memory-scan' | 'source-event' | 'human-edit' | 'turn-abort' | 'human-restore';
  causeId: string;
  capturedAt: string;
}

export interface MemoryRepairEvent {
  id: string;
  acceptedHeadSha: string;
  provisionalHeadSha: string;
  backupPath: string;
  status: 'started' | 'completed';
  completedAt: string | null;
}

export interface ProfileActivityDay {
  day: string;
  count: number;
}

export interface ProfileActivityReasonDay extends ProfileActivityDay {
  reason: string;
}

export interface ProfileTokenBuckets {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ProfileActivityTokensDay extends ProfileTokenBuckets {
  day: string;
}

export interface ProfileModelUsageRow {
  day: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
}

export interface ProfileActivity {
  slug: string;
  weeks: number;
  since: string;
  before?: string;
  createdDay?: string;
  today: string;
  events: ProfileActivityReasonDay[];
  memoryCommits: ProfileActivityDay[];
  tokens: ProfileActivityTokensDay[];
  tokenTotals: ProfileTokenBuckets;
  modelUsageRows?: ProfileModelUsageRow[];
  modelUsageStatus?: 'ready' | 'unavailable';
}

export interface GroupProfileAuthorActivity {
  author: ChannelAuthor;
  bridgeOrigin?: Pick<
    NonNullable<ChannelMessage['bridgeOrigin']>,
    'platform' | 'conversationId' | 'conversationName'
  >;
  total: number;
  days: ProfileActivityDay[];
}

export interface GroupProfileActivity {
  channelId: string;
  weeks: number;
  since: string;
  today: string;
  days: ProfileActivityDay[];
  authors: GroupProfileAuthorActivity[];
}

export interface MemoryStandingUsage {
  path: string;
  role: 'soul' | 'coreMemory';
  chars: number;
  limit: number;
}

export interface MemorySnapshot {
  head: string | null;
  files: string[];
  provisional: boolean;
  standing: MemoryStandingUsage[];
}

function parseStandingUsage(value: unknown): MemoryStandingUsage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): MemoryStandingUsage[] => {
    const row = asRecord(entry);
    if (
      row === undefined ||
      typeof row['path'] !== 'string' ||
      (row['role'] !== 'soul' && row['role'] !== 'coreMemory') ||
      typeof row['chars'] !== 'number' ||
      typeof row['limit'] !== 'number'
    )
      return [];
    return [{ path: row['path'], role: row['role'], chars: row['chars'], limit: row['limit'] }];
  });
}

function parseMemoryCommit(value: unknown): MemoryAcceptedCommit {
  const row = asRecord(value);
  if (
    row === undefined ||
    typeof row['botSlug'] !== 'string' ||
    typeof row['sha'] !== 'string' ||
    !(row['parentSha'] === null || typeof row['parentSha'] === 'string') ||
    !['agent', 'human', 'system'].includes(String(row['actorKind'])) ||
    typeof row['actorId'] !== 'string' ||
    !['source-event', 'human-edit', 'repository-init'].includes(String(row['causeKind'])) ||
    typeof row['causeId'] !== 'string' ||
    typeof row['validationResult'] !== 'string' ||
    typeof row['acceptedAt'] !== 'string'
  )
    throw new Error('invalid accepted Memory Commit');
  return row as unknown as MemoryAcceptedCommit;
}

export async function loadMemorySnapshot(
  call: BridgeCall,
  channelId: string,
): Promise<MemorySnapshot> {
  const response = asRecord(await unwrap(call, 'memorySnapshot', { channelId }));
  const snapshot = asRecord(response?.['snapshot']);
  if (
    snapshot === undefined ||
    !(snapshot['head'] === null || typeof snapshot['head'] === 'string') ||
    !Array.isArray(snapshot['files']) ||
    !snapshot['files'].every((path) => typeof path === 'string') ||
    typeof snapshot['provisional'] !== 'boolean'
  )
    throw new Error('invalid Memory snapshot');
  return {
    head: snapshot['head'],
    files: snapshot['files'] as string[],
    provisional: snapshot['provisional'],
    standing: parseStandingUsage(snapshot['standing']),
  };
}

export async function loadWorkspaceFileTarget(
  call: BridgeCall,
  slug: string,
  grantId: string,
): Promise<HostFileTarget> {
  const response = asRecord(await unwrap(call, 'workspaceFileTarget', { slug, grantId }));
  const target = asRecord(response?.['target']);
  if (
    typeof target?.['path'] !== 'string' ||
    target['relativePath'] !== '' ||
    target['kind'] !== 'directory'
  )
    throw new Error('Invalid Workspace directory target');
  return { path: target['path'], relativePath: '', kind: 'directory' };
}

export async function loadMemoryFileTarget(
  call: BridgeCall,
  slug: string,
  path: string,
): Promise<HostFileTarget> {
  const response = asRecord(await unwrap(call, 'memoryFileTarget', { slug, path }));
  const target = asRecord(response?.['target']);
  if (
    typeof target?.['path'] !== 'string' ||
    typeof target['relativePath'] !== 'string' ||
    !['file', 'directory'].includes(String(target['kind']))
  )
    throw new Error('Invalid Memory file target');
  return target as unknown as HostFileTarget;
}

export async function loadMemoryFile(
  call: BridgeCall,
  channelId: string,
  path: string,
): Promise<{ path: string; body: string; head: string; binary?: boolean } | undefined> {
  const response = asRecord(await unwrap(call, 'memoryFile', { channelId, path }));
  if (response?.['file'] === undefined) return undefined;
  const file = asRecord(response?.['file']);
  if (
    typeof file?.['path'] !== 'string' ||
    typeof file['body'] !== 'string' ||
    typeof file['head'] !== 'string'
  )
    throw new Error('invalid Memory file');
  if (file['binary'] !== undefined && typeof file['binary'] !== 'boolean')
    throw new Error('invalid Memory file');
  return file as { path: string; body: string; head: string; binary?: boolean };
}

export async function loadMemoryHistory(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryAcceptedCommit[]> {
  const response = asRecord(await unwrap(call, 'memoryHistory', { channelId }));
  const commits = response?.['commits'];
  if (!Array.isArray(commits)) throw new Error('invalid Memory history');
  return commits.map(parseMemoryCommit);
}

export async function loadMemoryDiff(
  call: BridgeCall,
  channelId: string,
  sha: string,
): Promise<string> {
  const response = asRecord(await unwrap(call, 'memoryDiff', { channelId, sha }));
  if (response?.['sha'] !== sha || typeof response['diff'] !== 'string') {
    throw new Error('invalid Memory diff');
  }
  return response['diff'];
}

export async function loadMemoryGitGraph(
  call: BridgeCall,
  channelId: string,
  offset: number,
): Promise<MemoryGitGraph> {
  const response = asRecord(await unwrap(call, 'memoryGitGraph', { channelId, offset }));
  if (
    typeof response?.['head'] !== 'string' ||
    !(response['currentBranch'] === null || typeof response['currentBranch'] === 'string') ||
    !Array.isArray(response['branches']) ||
    !response['branches'].every((value) => typeof value === 'string') ||
    typeof response['dirty'] !== 'boolean' ||
    typeof response['hasMore'] !== 'boolean' ||
    !Array.isArray(response['commits']) ||
    !response['commits'].every((value) => {
      const commit = asRecord(value);
      return (
        commit !== undefined &&
        typeof commit['sha'] === 'string' &&
        Array.isArray(commit['parents']) &&
        commit['parents'].every((item) => typeof item === 'string') &&
        typeof commit['subject'] === 'string' &&
        typeof commit['authoredAt'] === 'string' &&
        Array.isArray(commit['branches']) &&
        commit['branches'].every((item) => typeof item === 'string') &&
        ['accepted', 'pending', 'needs-repair'].includes(String(commit['status']))
      );
    })
  )
    throw new Error('invalid Memory Git graph');
  return response as unknown as MemoryGitGraph;
}

export async function loadMemoryGitCommitDiff(
  call: BridgeCall,
  channelId: string,
  sha: string,
): Promise<MemoryGitCommitDiff> {
  const response = asRecord(await unwrap(call, 'memoryGitCommitDiff', { channelId, sha }));
  if (
    response?.['sha'] !== sha ||
    typeof response['diff'] !== 'string' ||
    !Array.isArray(response['files']) ||
    !response['files'].every((value) => {
      const file = asRecord(value);
      return typeof file?.['path'] === 'string' && typeof file['status'] === 'string';
    })
  )
    throw new Error('invalid Memory Git commit diff');
  return response as unknown as MemoryGitCommitDiff;
}

function isActivityDays(value: unknown): value is ProfileActivityDay[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      const record = asRecord(entry);
      return typeof record?.['day'] === 'string' && typeof record['count'] === 'number';
    })
  );
}

function isTokenBuckets(value: unknown): value is ProfileTokenBuckets {
  const record = asRecord(value);
  return (
    record !== undefined &&
    typeof record['inputTokens'] === 'number' &&
    typeof record['outputTokens'] === 'number' &&
    typeof record['cacheReadTokens'] === 'number' &&
    typeof record['cacheWriteTokens'] === 'number'
  );
}

export async function loadProfileUsage(
  call: BridgeCall,
  channelId: string,
  filter: UsageFilter,
): Promise<UsageQueryResult> {
  const value = asRecord(await unwrap(call, 'profileUsage', { channelId, filter }));
  const count = (input: unknown) =>
    input === null || (Number.isSafeInteger(input) && Number(input) >= 0);
  if (
    value === undefined ||
    !Array.isArray(value['rows']) ||
    value['rows'].length > 2000 ||
    !value['rows'].every((item) => {
      const row = asRecord(item);
      return (
        row !== undefined &&
        ['day', 'purpose', 'provider', 'model'].every((key) => typeof row[key] === 'string') &&
        ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'].every(
          (key) => count(row[key]),
        )
      );
    }) ||
    !count(value['periodTotal']) ||
    !count(value['allTimeTotal']) ||
    !['periodRecords', 'allTimeRecords'].every(
      (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0,
    ) ||
    !['models', 'providers'].every(
      (key) =>
        Array.isArray(value[key]) &&
        value[key].length <= 1000 &&
        value[key].every((item: unknown) => typeof item === 'string'),
    ) ||
    !['truncated', 'facetsTruncated', 'legacyBaseline'].every(
      (key) => typeof value[key] === 'boolean',
    ) ||
    !['ready', 'reconciling', 'degraded'].includes(String(value['freshness'])) ||
    typeof value['readAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['readAt'])) ||
    (value['reconciledAt'] !== null &&
      (typeof value['reconciledAt'] !== 'string' ||
        !Number.isFinite(Date.parse(value['reconciledAt'])))) ||
    !['start', 'end', 'model', 'provider', 'purpose'].every(
      (key) =>
        asRecord(value['filter'])?.[key] === (filter as unknown as Record<string, unknown>)[key],
    )
  )
    throw new Error('invalid Profile usage');
  return value as unknown as UsageQueryResult;
}

export interface ProfileActivityWindow {
  before: string;
  weeks: number;
}

export async function loadProfileActivity(
  call: BridgeCall,
  channelId: string,
  window?: ProfileActivityWindow,
): Promise<ProfileActivity> {
  const response = asRecord(
    await unwrap(call, 'profileActivity', { channelId, ...(window ?? {}) }),
  );
  if (
    response === undefined ||
    typeof response['slug'] !== 'string' ||
    typeof response['weeks'] !== 'number' ||
    typeof response['since'] !== 'string' ||
    typeof response['today'] !== 'string' ||
    !isActivityDays(response['memoryCommits']) ||
    !Array.isArray(response['events']) ||
    !response['events'].every((value) => {
      const entry = asRecord(value);
      return (
        typeof entry?.['day'] === 'string' &&
        typeof entry['count'] === 'number' &&
        typeof entry['reason'] === 'string'
      );
    }) ||
    !Array.isArray(response['tokens']) ||
    !response['tokens'].every((value) => {
      const entry = asRecord(value);
      return typeof entry?.['day'] === 'string' && isTokenBuckets(entry);
    }) ||
    !isTokenBuckets(response['tokenTotals']) ||
    (response['modelUsageRows'] !== undefined &&
      (!Array.isArray(response['modelUsageRows']) ||
        !response['modelUsageRows'].every((value) => {
          const row = asRecord(value);
          return (
            row !== undefined &&
            typeof row['day'] === 'string' &&
            typeof row['purpose'] === 'string' &&
            typeof row['provider'] === 'string' &&
            typeof row['model'] === 'string' &&
            [
              'inputTokens',
              'outputTokens',
              'cacheReadTokens',
              'cacheWriteTokens',
              'totalTokens',
            ].every(
              (key) =>
                row[key] === null || (Number.isSafeInteger(row[key]) && (row[key] as number) >= 0),
            )
          );
        }))) ||
    (response['modelUsageStatus'] !== undefined &&
      !['ready', 'unavailable'].includes(String(response['modelUsageStatus']))) ||
    (response['createdDay'] !== undefined && typeof response['createdDay'] !== 'string')
  )
    throw new Error('invalid Profile activity');
  return response as unknown as ProfileActivity;
}

export async function loadGroupProfileActivity(
  call: BridgeCall,
  channelId: string,
): Promise<GroupProfileActivity> {
  const response = asRecord(await unwrap(call, 'groupProfileActivity', { channelId }));
  if (
    response === undefined ||
    response['channelId'] !== channelId ||
    typeof response['weeks'] !== 'number' ||
    typeof response['since'] !== 'string' ||
    typeof response['today'] !== 'string' ||
    !isActivityDays(response['days']) ||
    !Array.isArray(response['authors']) ||
    !response['authors'].every((value) => {
      const entry = asRecord(value);
      return (
        entry !== undefined &&
        parseAuthor(entry['author']) !== undefined &&
        typeof entry['total'] === 'number' &&
        isActivityDays(entry['days']) &&
        (entry['bridgeOrigin'] === undefined ||
          (asRecord(entry['bridgeOrigin']) !== undefined &&
            ['platform', 'conversationId', 'conversationName'].every(
              (key) => typeof asRecord(entry['bridgeOrigin'])![key] === 'string',
            )))
      );
    })
  )
    throw new Error('invalid Group Profile activity');
  return response as unknown as GroupProfileActivity;
}

function parseWorkingChange(value: unknown, allowCurrent = false): MemoryWorkingChange {
  const change = asRecord(value);
  if (
    typeof change?.['path'] !== 'string' ||
    !['staged', 'unstaged', 'untracked', ...(allowCurrent ? ['current'] : [])].includes(
      String(change['kind']),
    ) ||
    typeof change['status'] !== 'string'
  )
    throw new Error('invalid Memory working change');
  return change as unknown as MemoryWorkingChange;
}

export async function loadMemoryWorkingChanges(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryWorkingChange[]> {
  const response = asRecord(await unwrap(call, 'memoryWorkingChanges', { channelId }));
  if (!Array.isArray(response?.['changes'])) throw new Error('invalid Memory working changes');
  return response['changes'].map((change: unknown) => parseWorkingChange(change));
}

export async function loadMemoryWorkingDiff(
  call: BridgeCall,
  channelId: string,
  path: string,
  kind: MemoryWorkingKind,
): Promise<MemoryWorkingDiff> {
  const response = asRecord(await unwrap(call, 'memoryWorkingDiff', { channelId, path, kind }));
  parseWorkingChange(response, true);
  if (
    response?.['path'] !== path ||
    response['kind'] !== kind ||
    typeof response['diff'] !== 'string' ||
    typeof response['binary'] !== 'boolean'
  )
    throw new Error('invalid Memory working diff');
  return response as unknown as MemoryWorkingDiff;
}

export async function loadMemoryRecoveryHistory(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryRecoveryCheckpoint[]> {
  const response = asRecord(await unwrap(call, 'memoryRecoveryHistory', { channelId }));
  if (!Array.isArray(response?.['checkpoints'])) throw new Error('invalid Memory checkpoints');
  return response['checkpoints'].map((value: unknown) => {
    const point = asRecord(value);
    if (
      point === undefined ||
      typeof point['id'] !== 'string' ||
      typeof point['branch'] !== 'string' ||
      typeof point['head'] !== 'string' ||
      typeof point['indexTree'] !== 'string' ||
      typeof point['workingTree'] !== 'string' ||
      typeof point['origin'] !== 'string' ||
      typeof point['originId'] !== 'string' ||
      typeof point['causeKind'] !== 'string' ||
      typeof point['causeId'] !== 'string' ||
      typeof point['capturedAt'] !== 'string'
    )
      throw new Error('invalid Memory checkpoint');
    return point as unknown as MemoryRecoveryCheckpoint;
  });
}

export async function restoreMemoryCheckpoint(
  call: BridgeCall,
  input: { channelId: string; checkpointId: string; expectedCurrentId: string },
): Promise<{ checkpoint: MemoryRecoveryCheckpoint; archivePath: string }> {
  const response = asRecord(await unwrap(call, 'memoryRestore', input));
  const checkpoint = asRecord(response?.['checkpoint']);
  if (
    checkpoint === undefined ||
    typeof checkpoint['id'] !== 'string' ||
    typeof response?.['archivePath'] !== 'string'
  )
    throw new Error('invalid Memory restore result');
  return {
    checkpoint: checkpoint as unknown as MemoryRecoveryCheckpoint,
    archivePath: response['archivePath'] as string,
  };
}

export async function saveMemoryFile(
  call: BridgeCall,
  input: { channelId: string; path: string; body: string; expectedHead: string; editId: string },
): Promise<MemoryAcceptedCommit> {
  const response = asRecord(await unwrap(call, 'memorySave', input));
  return parseMemoryCommit(response?.['commit']);
}

export async function repairMemory(
  call: BridgeCall,
  input: { channelId: string; expectedHead: string; repairId: string },
): Promise<MemoryRepairEvent> {
  const response = asRecord(await unwrap(call, 'memoryRepair', input));
  const repair = asRecord(response?.['repair']);
  if (
    repair === undefined ||
    typeof repair['id'] !== 'string' ||
    typeof repair['acceptedHeadSha'] !== 'string' ||
    typeof repair['provisionalHeadSha'] !== 'string' ||
    typeof repair['backupPath'] !== 'string' ||
    repair['status'] !== 'completed' ||
    typeof repair['completedAt'] !== 'string'
  )
    throw new Error('invalid Memory repair result');
  return repair as unknown as MemoryRepairEvent;
}

export async function manageMessagingIdentity(
  call: BridgeCall,
  slug: string,
  input: MessagingIdentityInput,
): Promise<MessagingIdentity> {
  const record = asRecord(await unwrap(call, 'messagingIdentity', { slug, input }));
  const identity = asRecord(record?.['identity']);
  if (
    !identity ||
    typeof identity['id'] !== 'string' ||
    typeof identity['revision'] !== 'number' ||
    typeof identity['enabled'] !== 'boolean'
  )
    throw new BridgeCallError('invalid-response', 'Invalid identity result');
  return identity as unknown as MessagingIdentity;
}
export async function loadMessagingDefaults(
  call: BridgeCall,
  platform: MessagingDefaultsInput['platform'] = 'feishu',
): Promise<MessagingDefaults> {
  const value = asRecord(
    await unwrap(call, 'messagingDefaults', platform === 'feishu' ? {} : { platform }),
  );
  if (
    !value ||
    value['platform'] !== platform ||
    !Number.isInteger(value['revision']) ||
    Number(value['revision']) < 0 ||
    typeof value['changedAt'] !== 'string' ||
    typeof value['identityEnabled'] !== 'boolean' ||
    (platform === 'weixin' && typeof value['typingEnabled'] !== 'boolean') ||
    !['mentions', 'all'].includes(String(value['collection'])) ||
    !['immediate', 'digest', 'mentions', 'silent'].includes(String(value['wake'])) ||
    !Number.isInteger(value['count']) ||
    !Number.isInteger(value['intervalSeconds']) ||
    Number(value['count']) < 1 ||
    Number(value['count']) > 100 ||
    Number(value['intervalSeconds']) < 1 ||
    Number(value['intervalSeconds']) > 86400
  )
    throw new BridgeCallError('invalid-response', 'Invalid platform defaults');
  return value as unknown as MessagingDefaults;
}
export async function saveMessagingDefaults(
  call: BridgeCall,
  input: MessagingDefaultsInput,
): Promise<MessagingDefaults> {
  await unwrap(call, 'messagingDefaultsSet', { input });
  return loadMessagingDefaults(call, input.platform);
}
export async function loadChannelBridges(
  call: BridgeCall,
  channelId: string,
): Promise<ChannelBridgeSnapshot> {
  const value = asRecord(await unwrap(call, 'channelBridges', { channelId }));
  const source = (item: unknown) => {
    const row = asRecord(item);
    return (
      row &&
      ['grantId', 'botSlug', 'platform', 'accountName', 'conversationName'].every(
        (key) => typeof row[key] === 'string',
      ) &&
      Number.isInteger(row['grantRevision']) &&
      Number(row['grantRevision']) > 0 &&
      ['verified', 'unverified'].includes(String(row['ordinaryDelivery']))
    );
  };
  if (
    !value ||
    value['channelId'] !== channelId ||
    (value['canTargetInbox'] !== undefined && typeof value['canTargetInbox'] !== 'boolean') ||
    !Array.isArray(value['sources']) ||
    !value['sources'].every(source) ||
    !Array.isArray(value['bridges']) ||
    !value['bridges'].every((item) => {
      const row = asRecord(item);
      return (
        source(item) &&
        (row?.['routeId'] === undefined || typeof row['routeId'] === 'string') &&
        (row?.['delivery'] === undefined ||
          ['channel', 'inbox'].includes(String(row['delivery']))) &&
        typeof row?.['name'] === 'string' &&
        typeof row['enabled'] === 'boolean' &&
        Number.isInteger(row['revision']) &&
        Number(row['revision']) > 0 &&
        ['mentions', 'all'].includes(String(row['collection'])) &&
        ['available', 'unavailable', 'rebind-required'].includes(String(row['availability'])) &&
        ['off', 'connecting', 'receiving', 'unavailable'].includes(String(row['reception']))
      );
    })
  )
    throw new BridgeCallError('invalid-response', 'Invalid Channel Bridge snapshot');
  return value as unknown as ChannelBridgeSnapshot;
}
export async function loadChannelIngests(
  call: BridgeCall,
  channelId: string,
): Promise<ConversationIngestSnapshot> {
  const value = asRecord(await unwrap(call, 'channelIngests', { channelId }));
  if (
    !value ||
    value['channelId'] !== channelId ||
    !Array.isArray(value['ingests']) ||
    !value['ingests'].every((item) => {
      const row = asRecord(item);
      const conversation = asRecord(row?.['conversation']);
      const wake = asRecord(row?.['wake']);
      return (
        row &&
        conversation &&
        wake &&
        ['id', 'channelId', 'platform', 'accountName', 'intakeAfter'].every(
          (key) => typeof row[key] === 'string',
        ) &&
        typeof conversation['id'] === 'string' &&
        typeof conversation['name'] === 'string' &&
        typeof row['enabled'] === 'boolean' &&
        Number.isInteger(row['revision']) &&
        ['mentions', 'digest', 'all'].includes(String(wake['mode'])) &&
        ['waiting', 'receiving', 'paused', 'unavailable'].includes(String(row['state']))
      );
    }) ||
    !Array.isArray(value['candidates']) ||
    !value['candidates'].every((item) => {
      const row = asRecord(item);
      return (
        row &&
        ['bindingId', 'botSlug', 'platform', 'accountName'].every(
          (key) => typeof row[key] === 'string',
        ) &&
        Array.isArray(row['conversations'])
      );
    })
  )
    throw new BridgeCallError('invalid-response', 'Invalid external conversation snapshot');
  return value as unknown as ConversationIngestSnapshot;
}
export async function manageChannelIngest(
  call: BridgeCall,
  channelId: string,
  input: ConversationIngestInput,
): Promise<void> {
  await unwrap(call, 'channelIngest', { channelId, input });
}
export async function manageChannelBridge(
  call: BridgeCall,
  channelId: string,
  input: ChannelBridgeInput,
): Promise<void> {
  await unwrap(call, 'channelBridge', { channelId, input });
}
export async function setApprovalRoute(
  call: BridgeCall,
  slug: string,
  pairingId: string | null,
  expectedRevision: number,
): Promise<void> {
  await unwrap(call, 'approvalRoute', { slug, pairingId, expectedRevision });
}
export async function testApprovalRoute(call: BridgeCall, slug: string): Promise<void> {
  await unwrap(call, 'approvalTest', { slug });
}
export async function retryApprovalNotification(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<void> {
  await unwrap(call, 'approvalRetry', { slug, id });
}

export async function reviewPairing(
  call: BridgeCall,
  slug: string,
  input: PairingReviewInput,
): Promise<PairingRequest> {
  const value = asRecord(await unwrap(call, 'pairingReview', { slug, input }));
  const pairing = asRecord(value?.['pairing']);
  if (
    !pairing ||
    pairing['botSlug'] !== slug ||
    typeof pairing['id'] !== 'string' ||
    !Array.isArray(pairing['capabilities']) ||
    typeof pairing['revision'] !== 'number'
  )
    throw new BridgeCallError('invalid-response', 'Invalid pairing review');
  return pairing as unknown as PairingRequest;
}
export async function changeExternalSenderAccess(
  call: BridgeCall,
  slug: string,
  input: SenderAccessInput,
): Promise<void> {
  await unwrap(call, 'senderAccess', { slug, input });
}
export type { MessagingApp } from '../../../core/src/messaging/outbound.js';

export async function loadMessagingApps(
  call: BridgeCall,
): Promise<{ apps: MessagingApp[]; setups: NonNullable<MessagingSnapshot['appSetups']> }> {
  const record = asRecord(await unwrap(call, 'messagingApps', {}));
  const apps = record?.['apps'];
  const setups = record?.['setups'];
  if (
    !Array.isArray(apps) ||
    !Array.isArray(setups) ||
    !setups.every((value) => typeof asRecord(value)?.['providerId'] === 'string') ||
    !apps.every((value) => {
      const app = asRecord(value);
      return (
        typeof app?.['providerId'] === 'string' &&
        typeof app['ref'] === 'string' &&
        typeof app['platform'] === 'string' &&
        typeof app['name'] === 'string' &&
        typeof app['fingerprint'] === 'string' &&
        typeof app['connected'] === 'boolean' &&
        (app['boundBotSlug'] === undefined || typeof app['boundBotSlug'] === 'string')
      );
    })
  )
    throw new BridgeCallError('invalid-response', 'Invalid messaging apps');
  return {
    apps: apps as MessagingApp[],
    setups: setups as NonNullable<MessagingSnapshot['appSetups']>,
  };
}

export async function loadMessagingSnapshot(
  call: BridgeCall,
  slug: string,
): Promise<MessagingSnapshot> {
  const value = await unwrap(call, 'messagingSnapshot', { slug });
  const record = asRecord(value);
  if (
    !record ||
    !Array.isArray(record['accounts']) ||
    !Array.isArray(record['grants']) ||
    !Array.isArray(record['intents']) ||
    (record['setup'] !== undefined && !validLarkSetupSnapshot(record['setup'])) ||
    (record['channelTargets'] !== undefined &&
      (!Array.isArray(record['channelTargets']) ||
        !record['channelTargets'].every((value) => {
          const target = asRecord(value);
          return (
            typeof target?.['id'] === 'string' &&
            target['id'].length > 0 &&
            typeof target['name'] === 'string'
          );
        })))
  )
    throw new BridgeCallError('invalid-response', 'Invalid messaging snapshot');
  return value as MessagingSnapshot;
}

function validLarkSetupSnapshot(value: unknown): boolean {
  const setup = asRecord(value);
  return (
    typeof setup?.['providerReady'] === 'boolean' &&
    Array.isArray(setup['receipts']) &&
    setup['receipts'].length <= 20 &&
    setup['receipts'].every((item: unknown) => {
      const row = asRecord(item);
      return (
        !!row &&
        ['sourceEventId', 'grantId', 'messageId', 'conversationId', 'at'].every(
          (key) => typeof row[key] === 'string' && row[key].length > 0,
        ) &&
        typeof row['echoObserved'] === 'boolean' &&
        (row['replyMessageId'] === undefined ||
          (typeof row['replyMessageId'] === 'string' && row['replyMessageId'].length > 0)) &&
        (row['threadId'] === undefined || typeof row['threadId'] === 'string') &&
        (row['replyState'] === undefined ||
          [
            'provider-accepted',
            'unknown-outcome',
            'pending',
            'in-flight',
            'grant-revoked',
            'cancelled',
            'failed',
          ].includes(String(row['replyState'])))
      );
    })
  );
}
export async function loadMessagingTargets(
  call: BridgeCall,
  providerId: string,
  accountRef: string,
): Promise<MessagingTarget[]> {
  const record = asRecord(await unwrap(call, 'messagingTargets', { providerId, accountRef }));
  if (!record || !Array.isArray(record['targets']))
    throw new BridgeCallError('invalid-response', 'Invalid targets');
  return record['targets'] as MessagingTarget[];
}
export async function authorizeMessaging(
  call: BridgeCall,
  input: {
    botSlug: string;
    providerId: string;
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
  },
): Promise<MessagingGrant> {
  const record = asRecord(await unwrap(call, 'messagingAuthorize', input));
  if (!record || !asRecord(record['grant']))
    throw new BridgeCallError('invalid-response', 'Invalid grant');
  return record['grant'] as MessagingGrant;
}
export async function revokeMessaging(
  call: BridgeCall,
  slug: string,
  grantId: string,
): Promise<void> {
  await unwrap(call, 'messagingRevoke', { slug, grantId });
}
export async function sendMessaging(
  call: BridgeCall,
  slug: string,
  grantId: string,
  requestId: string,
  text: string,
): Promise<OutboxIntent> {
  const record = asRecord(await unwrap(call, 'messagingSend', { slug, grantId, requestId, text }));
  if (!record || !asRecord(record['intent']))
    throw new BridgeCallError('invalid-response', 'Invalid intent');
  return record['intent'] as OutboxIntent;
}

export async function loadMessageAttachmentTarget(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  fileId: string,
): Promise<HostFileTarget> {
  const response = asRecord(
    await unwrap(call, 'messageAttachmentTarget', { channelId, messageId, fileId }),
  );
  const target = asRecord(response?.['target']);
  if (
    typeof target?.['path'] !== 'string' ||
    typeof target['relativePath'] !== 'string' ||
    target['kind'] !== 'file'
  )
    throw new Error('Invalid message attachment target');
  return { path: target['path'], relativePath: target['relativePath'], kind: 'file' };
}

export async function setMessagingChannelTarget(
  call: BridgeCall,
  slug: string,
  grantId: string,
  channelId: string | null,
): Promise<void> {
  await unwrap(call, 'messagingChannelTarget', { slug, grantId, channelId });
}
export async function setMessagingThreadPolicy(
  call: BridgeCall,
  slug: string,
  sourceEventId: string,
  policy: import('../../../core/src/messaging/thread-policy.js').ThreadReceptionInput,
): Promise<void> {
  await unwrap(call, 'messagingThreadPolicy', { slug, sourceEventId, policy });
}
export async function setMessagingGroupPolicy(
  call: BridgeCall,
  slug: string,
  grantId: string,
  policy: GroupReceptionInput,
): Promise<void> {
  await unwrap(call, 'messagingGroupPolicy', { slug, grantId, policy });
}
export async function manageMessagingConversation(
  call: BridgeCall,
  slug: string,
  input: MessagingConversationInput,
): Promise<void> {
  await unwrap(call, 'messagingConversation', { slug, input });
}
export async function setMessagingReceive(
  call: BridgeCall,
  slug: string,
  grantId: string,
  enabled: boolean,
): Promise<void> {
  await unwrap(call, 'messagingReceive', { slug, grantId, enabled });
}
export async function readMessagingSource(
  call: BridgeCall,
  slug: string,
  sourceEventId: string,
): Promise<ExternalSource> {
  const record = asRecord(await unwrap(call, 'messagingSource', { slug, sourceEventId }));
  const source = asRecord(record?.['source']);
  const event = asRecord(source?.['event']);
  const actor = asRecord(event?.['actor']);
  const conversation = asRecord(event?.['conversation']);
  const reply = asRecord(event?.['reply']);
  const replay = asRecord(event?.['replay']);
  const strings = (value: Record<string, unknown> | undefined, keys: string[]): boolean =>
    value !== undefined && keys.every((key) => typeof value[key] === 'string');
  if (
    !strings(source, [
      'body',
      'id',
      'platform',
      'accountName',
      'conversationName',
      'at',
      'grantId',
    ]) ||
    (source?.['localChannelId'] !== undefined &&
      (typeof source['localChannelId'] !== 'string' || source['localChannelId'].length === 0)) ||
    !Number.isInteger(source?.['grantRevision']) ||
    Number(source?.['grantRevision']) < 1 ||
    event?.['version'] !== 1 ||
    !['feishu', 'slack', 'discord', 'weixin', 'qq'].includes(String(event['channel'])) ||
    !strings(event, ['botId', 'fingerprint', 'eventId', 'messageId', 'at']) ||
    typeof event['mentionedAccount'] !== 'boolean' ||
    actor?.['kind'] !== 'user' ||
    !strings(actor, ['id']) ||
    (actor?.['name'] !== undefined && typeof actor['name'] !== 'string') ||
    !['group', 'dm'].includes(String(conversation?.['kind'])) ||
    !strings(conversation, ['id']) ||
    !strings(reply, ['messageId', 'conversationId', 'actorId']) ||
    ['threadId', 'rootId', 'parentId'].some(
      (key) => reply?.[key] !== undefined && typeof reply[key] !== 'string',
    ) ||
    !Array.isArray(event['mentions']) ||
    !event['mentions'].every(
      (mention) =>
        strings(asRecord(mention), ['id', 'key']) &&
        (asRecord(mention)?.['name'] === undefined ||
          typeof asRecord(mention)?.['name'] === 'string'),
    ) ||
    (event['attachments'] !== undefined &&
      (!Array.isArray(event['attachments']) ||
        event['attachments'].length > 1 ||
        !event['attachments'].every(
          (file) =>
            strings(asRecord(file), ['id', 'messageId', 'resourceKey', 'name']) &&
            (asRecord(file)?.['sizeBytes'] === undefined ||
              (Number.isSafeInteger(asRecord(file)?.['sizeBytes']) &&
                Number(asRecord(file)?.['sizeBytes']) > 0 &&
                Number(asRecord(file)?.['sizeBytes']) <= Number.MAX_SAFE_INTEGER)) &&
            (asRecord(file)?.['mediaType'] === undefined ||
              typeof asRecord(file)?.['mediaType'] === 'string'),
        ))) ||
    replay?.['kind'] !== 'provider-redelivery' ||
    replay['resumeCursor'] !== false ||
    replay['gapPossible'] !== true
  )
    throw new BridgeCallError('invalid-response', 'Invalid source');
  if (
    source?.['receptionPaths'] !== undefined &&
    (!Array.isArray(source['receptionPaths']) ||
      !source['receptionPaths'].every((value) => {
        const path = asRecord(value);
        return (
          path &&
          strings(path, ['routeId', 'grantId', 'reason', 'mode']) &&
          (path['channelId'] === null || typeof path['channelId'] === 'string') &&
          ['group-mention', 'group-ordinary', 'human-dm'].includes(String(path['reason'])) &&
          ['all', 'immediate', 'digest', 'mentions', 'silent', 'context', 'conditional'].includes(
            String(path['mode']),
          ) &&
          [
            'grantRevision',
            'routeRevision',
            'count',
            'intervalMs',
            'policyRevision',
            'sourceRevision',
            'defaultRevision',
          ].every((key) => Number.isInteger(path[key]))
        );
      }))
  )
    throw new BridgeCallError('invalid-response', 'Invalid reception paths');
  if (
    source?.['contextReads'] !== undefined &&
    (!Array.isArray(source['contextReads']) ||
      source['contextReads'].length > 20 ||
      !source['contextReads'].every((value) => {
        const read = asRecord(value);
        return (
          strings(read, ['at', 'sessionId', 'scope', 'outcome']) &&
          ['group', 'nearby', 'thread', 'retained', 'retained-nearby'].includes(
            String(read?.['scope']),
          ) &&
          (read?.['coverage'] === undefined ||
            ['provider-visible-human-text', 'retained-local-sources'].includes(
              String(read['coverage']),
            )) &&
          ['read', 'refused'].includes(String(read?.['outcome'])) &&
          typeof read?.['incomplete'] === 'boolean' &&
          Number.isInteger(read?.['omitted']) &&
          Array.isArray(read?.['sourceEventIds']) &&
          read['sourceEventIds'].length <= 20 &&
          read['sourceEventIds'].every((id: unknown) => typeof id === 'string') &&
          (read['reason'] === undefined || typeof read['reason'] === 'string')
        );
      }))
  )
    throw new BridgeCallError('invalid-response', 'Invalid context audit');
  if (
    source?.['contextMessages'] !== undefined &&
    (!Array.isArray(source['contextMessages']) ||
      source['contextMessages'].length > 20 ||
      !source['contextMessages'].every(
        (value) =>
          strings(asRecord(value), ['sourceEventId', 'messageId', 'senderId', 'at', 'text']) &&
          (asRecord(value)?.['senderName'] === undefined ||
            typeof asRecord(value)?.['senderName'] === 'string') &&
          (asRecord(value)?.['mentions'] === undefined ||
            (Array.isArray(asRecord(value)?.['mentions']) &&
              (asRecord(value)?.['mentions'] as unknown[]).every(
                (mention) =>
                  strings(asRecord(mention), ['id', 'key']) &&
                  (asRecord(mention)?.['name'] === undefined ||
                    typeof asRecord(mention)?.['name'] === 'string'),
              ))),
      ))
  )
    throw new BridgeCallError('invalid-response', 'Invalid context messages');
  return source as unknown as ExternalSource;
}

export async function loadActivityOverview(call: BridgeCall): Promise<ActivityOverview> {
  const row = asRecord(await unwrap(call, 'activityOverview', {}));
  if (
    row === undefined ||
    !Number.isSafeInteger(row['actionCount']) ||
    (row['actionCount'] as number) < 0 ||
    !Array.isArray(row['bots'])
  )
    throw new Error('Invalid Activity Center overview');
  const bots = row['bots'].map((value: unknown) => {
    const bot = asRecord(value);
    if (
      bot === undefined ||
      typeof bot['slug'] !== 'string' ||
      typeof bot['displayName'] !== 'string' ||
      typeof bot['paused'] !== 'boolean' ||
      (bot['hasAction'] !== undefined && typeof bot['hasAction'] !== 'boolean') ||
      (bot['attention'] !== undefined && parsePublicAttention(bot['attention']) === undefined) ||
      !['idle', 'thinking', 'working', 'waiting', 'blocked'].includes(String(bot['state'])) ||
      !Array.isArray(bot['sessions']) ||
      (bot['avatar'] !== undefined && typeof bot['avatar'] !== 'string')
    )
      throw new Error('Invalid Overview Bot');
    const activity =
      bot['activity'] === undefined ? undefined : parsePublicToolActivity(bot['activity']);
    if (bot['activity'] !== undefined && (activity === undefined || bot['state'] !== 'working'))
      throw new Error('Invalid Overview activity');
    const sessions = bot['sessions'].map((value: unknown) => {
      const session = asRecord(value);
      if (
        session === undefined ||
        typeof session['sessionId'] !== 'string' ||
        !['orchestrator', 'assignment'].includes(String(session['role'])) ||
        !['thinking', 'working'].includes(String(session['state'])) ||
        (session['purpose'] !== undefined && typeof session['purpose'] !== 'string')
      )
        throw new Error('Invalid Overview Session');
      return session as unknown as ActivityOverview['bots'][number]['sessions'][number];
    });
    return {
      ...bot,
      hasAction: bot['hasAction'] === true,
      ...(bot['attention'] === undefined
        ? {}
        : { attention: parsePublicAttention(bot['attention']) }),
      ...(activity === undefined ? {} : { activity }),
      sessions,
    } as unknown as ActivityOverview['bots'][number];
  });
  return { actionCount: row['actionCount'] as number, bots };
}

export async function loadChannelActivityToday(call: BridgeCall): Promise<ChannelActivityToday> {
  const data = asRecord(await unwrap(call, 'channelActivityToday', {}));
  const count = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (
    !data ||
    !count(data['total']) ||
    !Array.isArray(data['channels']) ||
    typeof data['day'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(data['day']) ||
    typeof data['timezone'] !== 'string' ||
    typeof data['from'] !== 'string' ||
    typeof data['to'] !== 'string' ||
    !Number.isFinite(Date.parse(data['from'])) ||
    !(Date.parse(data['to']) > Date.parse(data['from']))
  )
    throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
  const ids = new Set<string>();
  for (const raw of data['channels']) {
    const row = asRecord(raw);
    if (
      !row ||
      typeof row['channelId'] !== 'string' ||
      !row['channelId'] ||
      ids.has(row['channelId']) ||
      typeof row['name'] !== 'string' ||
      !['dm', 'group'].includes(String(row['type'])) ||
      !count(row['total']) ||
      !count(row['human']) ||
      !count(row['bot']) ||
      !count(row['other']) ||
      row['total'] !== row['human'] + row['bot'] + row['other'] ||
      !Array.isArray(row['senders'])
    )
      throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
    ids.add(row['channelId']);
    const sums = { human: 0, bot: 0, other: 0 };
    for (const rawSender of row['senders']) {
      const sender = asRecord(rawSender);
      const author = asRecord(sender?.['author']);
      if (
        !sender ||
        !author ||
        !count(sender['count']) ||
        typeof sender['displayName'] !== 'string' ||
        !['human', 'bot', 'system', 'bridged'].includes(String(author['kind'])) ||
        (author['kind'] === 'bot' && (typeof author['slug'] !== 'string' || !author['slug'])) ||
        (author['kind'] === 'bridged' &&
          (typeof author['source'] !== 'string' || !author['source']))
      )
        throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
      sums[author['kind'] === 'human' ? 'human' : author['kind'] === 'bot' ? 'bot' : 'other'] +=
        sender['count'];
    }
    if (sums.human !== row['human'] || sums.bot !== row['bot'] || sums.other !== row['other'])
      throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
  }
  if (
    data['channels'].reduce((sum: number, row: { total: number }) => sum + row.total, 0) !==
    data['total']
  )
    throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
  return data as unknown as ChannelActivityToday;
}

export async function markAllReadPositions(call: BridgeCall): Promise<void> {
  const row = asRecord(await unwrap(call, 'channelMarkAllRead', {}));
  if (!row || !Number.isSafeInteger(row['channels']) || (row['channels'] as number) < 0)
    throw new Error('invalid all-read result');
}

export async function loadOverviewUsage(
  call: BridgeCall,
  period: UsageOverviewPeriod,
  after?: string,
): Promise<OverviewUsage> {
  const value = asRecord(
    await unwrap(call, 'overviewUsage', { period, ...(after === undefined ? {} : { after }) }),
  );
  const validDay = (input: unknown): input is string =>
    typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(input) &&
    Number.isFinite(Date.parse(input)) &&
    new Date(input).toISOString().slice(0, 10) === input;
  const buckets = (input: unknown): boolean => {
    const row = asRecord(input);
    return (
      row !== undefined &&
      ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'].every(
        (key) => row[key] === null || (Number.isSafeInteger(row[key]) && Number(row[key]) >= 0),
      )
    );
  };
  if (
    !value ||
    value['period'] !== period ||
    !['start', 'end', 'timezone', 'readAt', 'nextRefreshAt'].every(
      (key) => typeof value[key] === 'string',
    ) ||
    !Number.isFinite(Date.parse(String(value['readAt']))) ||
    !Number.isFinite(Date.parse(String(value['nextRefreshAt']))) ||
    !validDay(value['start']) ||
    !validDay(value['end']) ||
    Date.parse(value['end']) - Date.parse(value['start']) !==
      (period === 'week' ? 6 : 0) * 86400000 ||
    !buckets(value['totals']) ||
    !Array.isArray(value['days']) ||
    value['days'].length !== (period === 'week' ? 7 : 1) ||
    !value['days'].every((row) => buckets(row) && typeof asRecord(row)?.['day'] === 'string') ||
    !Array.isArray(value['bots']) ||
    value['bots'].length > 20 ||
    !value['bots'].every(
      (row) =>
        buckets(row) &&
        typeof asRecord(row)?.['slug'] === 'string' &&
        typeof asRecord(row)?.['displayName'] === 'string' &&
        typeof asRecord(row)?.['current'] === 'boolean',
    ) ||
    (value['nextCursor'] !== undefined &&
      (typeof value['nextCursor'] !== 'string' || value['nextCursor'].length === 0)) ||
    !['ready', 'reconciling', 'degraded'].includes(String(value['freshness'])) ||
    typeof value['legacyBaseline'] !== 'boolean' ||
    (value['reconciledAt'] !== null && !Number.isFinite(Date.parse(String(value['reconciledAt']))))
  )
    throw new Error('invalid Overview usage');
  return value as unknown as OverviewUsage;
}

export async function loadOverviewMemory(
  call: BridgeCall,
  after?: string,
): Promise<OverviewMemory> {
  const value = asRecord(
    await unwrap(call, 'overviewMemory', after === undefined ? {} : { after }),
  );
  const day = (input: unknown): input is string =>
    typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(input) &&
    Number.isFinite(Date.parse(input)) &&
    new Date(input).toISOString().slice(0, 10) === input;
  const count = (input: unknown): input is number =>
    Number.isSafeInteger(input) && Number(input) >= 0;
  if (
    !value ||
    !day(value['start']) ||
    !day(value['end']) ||
    !Array.isArray(value['days']) ||
    value['days'].length !== 7 ||
    !value['days'].every(
      (item, index) =>
        day(item) && Date.parse(item) === Date.parse(String(value['start'])) + index * 86400000,
    ) ||
    value['days'][6] !== value['end'] ||
    typeof value['timezone'] !== 'string' ||
    !Number.isFinite(Date.parse(String(value['readAt']))) ||
    !Number.isFinite(Date.parse(String(value['nextRefreshAt']))) ||
    !Array.isArray(value['bots']) ||
    value['bots'].length > 10 ||
    !value['bots'].every((item) => {
      const row = asRecord(item);
      if (
        !row ||
        typeof row['slug'] !== 'string' ||
        row['slug'].length === 0 ||
        typeof row['displayName'] !== 'string'
      )
        return false;
      if (row['state'] === 'unavailable')
        return (
          row['total'] === undefined && row['counts'] === undefined && row['dirty'] === undefined
        );
      return (
        row['state'] === 'ready' &&
        count(row['total']) &&
        typeof row['dirty'] === 'boolean' &&
        Array.isArray(row['counts']) &&
        row['counts'].length === 7 &&
        row['counts'].every(count) &&
        row['counts'].reduce((sum, part) => sum + part, 0) === row['total']
      );
    }) ||
    (value['nextCursor'] !== undefined &&
      (typeof value['nextCursor'] !== 'string' || value['nextCursor'].length === 0))
  )
    throw new Error('invalid Overview Memory');
  return value as unknown as OverviewMemory;
}

export async function setModelPlan(
  call: BridgeCall,
  slug: string,
  expectedRevision: number,
  orchestrator: ModelRouteView,
  assignmentDefault: ModelRouteView,
  assignmentModels: AssignmentModelOptionView[],
): Promise<ModelPlanView> {
  const value = asRecord(
    await unwrap(call, 'modelPlanSet', {
      slug,
      expectedRevision,
      orchestrator,
      assignmentDefault,
      assignmentModels,
    }),
  );
  if (asRecord(value?.['plan']) === undefined) throw new Error('Invalid Model Plan result');
  return value!['plan'] as ModelPlanView;
}
