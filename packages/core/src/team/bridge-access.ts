import { resolveBotMentionText } from '../channels/bot-mention-text.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { BridgeMethods, BridgeMethodsDeps, BridgeResult } from '../bridge/methods.js';
import { MEMBER_METHODS, MEMBER_BOT_METHODS } from './member-methods.js';
import { ownsBot } from './bot-access.js';
import { TeamError } from './error.js';

const adminSettings = new Set([
  'get',
  'update',
  'pause',
  'resume',
  'deletionPreview',
  'deletionConfirm',
  'deletionRetry',
  'deletionMemoryFolder',
  'botAvatarSet',
  'botAppearanceSet',
  'botBannerSet',
  'botPrimaryColorSet',
  'modelPlan',
  'modelPlanSet',
  'modelPresetApply',
  'modelPlanCustomize',
  'modelPlanAssignmentsSet',
  'standingLimitsSet',
  'modelPlanInherit',
]);
const object = (input: unknown): Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input))
    : {};
const refuse = (code: string, details?: { permission: string }): BridgeResult<never> => ({
  ok: false,
  error: { code, message: code, ...(details ? { details } : {}) },
});

export function guardHumanBridge(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  methods: BridgeMethods,
  administration: () => BridgeMethods,
): BridgeMethods {
  let admin: BridgeMethods | undefined;
  const wrappers = new Map<PropertyKey, { operation: unknown; guarded: unknown }>();
  return new Proxy(methods, {
    get(target, property, receiver) {
      const operation: unknown = Reflect.get(target, property, receiver);
      if (typeof operation !== 'function' || typeof property !== 'string') return operation;
      const cached = wrappers.get(property);
      if (cached?.operation === operation) return cached.guarded;
      const guarded = (payload: unknown, ...args: unknown[]) => {
        const owner = deps.team?.isOwner(human) ?? human.humanId === OWNER_HUMAN_CONTEXT.humanId;
        if (!owner && !deps.team && ['create', 'createLookup'].includes(property))
          return refuse('permission-required', { permission: 'bots.create' });
        if (!owner && deps.team) {
          if (property === 'create' || property === 'createLookup') {
            try {
              deps.team.roles.require(human, 'bots.create');
            } catch (error) {
              if (error instanceof TeamError) return refuse(error.code, error.details);
              throw error;
            }
          }
          if (deps.team.member(human.humanId)?.status !== 'active')
            return refuse('member-suspended');
        }
        const input = object(payload);
        if (property === 'list' && input['administration'] === true) {
          if (!owner) return refuse('permission-required');
          admin ??= administration();
          return admin.list(payload);
        }
        if (!owner && ['channelCreate', 'channelGroupInvite'].includes(property)) {
          const refs = Array.isArray(input['members']) ? input['members'] : [input['botSlug']];
          if (refs.some((id) => typeof id === 'string' && !ownsBot(human, deps.registry.get(id))))
            return refuse('bot-not-found');
        }
        if (!owner && !MEMBER_METHODS.has(property)) return refuse('permission-required');
        const slug = input['slug'];
        if (typeof slug === 'string') {
          const bot = deps.registry.getHistorical?.(slug) ?? deps.registry.get(slug);
          if (
            !owner &&
            MEMBER_BOT_METHODS.some((method) => method === property) &&
            !ownsBot(human, bot)
          )
            return refuse('bot-not-found');
          if (bot && !ownsBot(human, bot)) {
            if (!owner || !adminSettings.has(property)) return refuse('bot-not-found');
            admin ??= administration();
            const run: unknown = Reflect.get(admin, property);
            if (typeof run === 'function') return Reflect.apply(run, admin, [payload, ...args]);
          }
        }
        const channelId = input['channelId'];
        if (
          typeof channelId === 'string' &&
          !['publicChannelJoin', 'channelPublicSet'].includes(property)
        ) {
          const channel = deps.channels.get(channelId);
          if (
            channel?.type === 'dm' &&
            channel.members.some((id) => {
              const bot = deps.registry.getHistorical?.(id) ?? deps.registry.get(id);
              return (!owner && !bot) || (bot && !ownsBot(human, bot));
            })
          ) {
            if (owner && adminSettings.has(property)) {
              admin ??= administration();
              const run: unknown = Reflect.get(admin, property);
              if (typeof run === 'function') return Reflect.apply(run, admin, [payload, ...args]);
            }
            return refuse('bot-not-found');
          }
          if (!owner && channel?.type === 'group' && !deps.team?.belongs(human, channelId))
            return refuse('channel-not-found');
        }
        if (property === 'channelSend') {
          const channel = typeof channelId === 'string' ? deps.channels.get(channelId) : undefined;
          if (
            channel?.type === 'group' &&
            typeof input['body'] === 'string' &&
            input['body'].includes('@')
          ) {
            for (const id of channel.members) {
              const bot = deps.registry.get(id);
              if (
                bot &&
                !ownsBot(human, bot) &&
                resolveBotMentionText(input['body'], [
                  { botSlug: bot.slug, displayName: bot.displayName, eligible: true },
                ]).botSlugs.length
              )
                return refuse('bot-not-found');
            }
          }
          const refs = input['channelRefs'];
          if (
            Array.isArray(refs) &&
            refs.some((ref) => {
              const id = object(ref)['channelId'];
              return typeof id === 'string' && !owner && !deps.team?.belongs(human, id);
            })
          )
            return refuse('channel-not-found');
          if (
            input['allBotMention'] !== undefined &&
            channel?.members.some((id) => !ownsBot(human, deps.registry.get(id)))
          )
            return refuse('bot-not-found');
        }
        if (!owner && property === 'update' && object(input['patch'])['workspaces'] !== undefined)
          return refuse('permission-required');
        const botIds: string[] = [];
        if (property === 'channelGroupJoinDecide' && typeof channelId === 'string') {
          const request = deps.channels
            .get(channelId)
            ?.joinRequests?.find((request) => request.id === input['requestId']);
          if (request) botIds.push(request.requesterBotSlug);
        }
        for (const name of ['botSlug', 'targetBotSlug']) {
          const id = input[name];
          if (typeof id === 'string') botIds.push(id);
        }
        for (const name of ['members', 'mentions']) {
          const entries = input[name];
          if (Array.isArray(entries))
            for (const entry of entries) {
              const id: unknown = typeof entry === 'string' ? entry : object(entry)['botSlug'];
              if (typeof id === 'string') botIds.push(id);
            }
        }
        if (
          botIds.some((id) => {
            const bot = deps.registry.get(id);
            return bot !== undefined
              ? !ownsBot(human, bot)
              : !owner && !property.startsWith('humanAttention');
          })
        )
          return refuse('bot-not-found');
        if (
          !owner &&
          ['create', 'createLookup'].includes(property) &&
          ['memoryDir', 'memoryLocation', 'workspaces'].some((field) => input[field] !== undefined)
        )
          return refuse('permission-required');
        return Reflect.apply(operation, target, [payload, ...args]);
      };
      wrappers.set(property, { operation, guarded });
      return guarded;
    },
  });
}
