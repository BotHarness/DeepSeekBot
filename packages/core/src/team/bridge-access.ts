import {
  resolveBotMentionText,
  AmbiguousBotMentionError,
  botMentionLabel,
} from '../channels/bot-mention-text.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { BridgeMethods, BridgeMethodsDeps, BridgeResult } from '../bridge/methods.js';
import { MEMBER_METHODS, MEMBER_BOT_METHODS, MEMBER_APPROVAL_METHODS } from './member-methods.js';
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
        if (property === 'assignmentAccessSet' && input['mode'] === 'danger-full-access') {
          if (!owner) return refuse('owner-only');
          const bot =
            typeof input['slug'] === 'string' ? deps.registry.get(input['slug']) : undefined;
          if (
            bot &&
            (bot.ownerHumanId ?? OWNER_HUMAN_CONTEXT.humanId) !==
              (deps.team?.ownerContext() ?? OWNER_HUMAN_CONTEXT).humanId
          )
            return refuse('permission-required');
        }
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
          if (
            !owner &&
            channel?.type === 'group' &&
            !deps.team?.belongs(human, channelId) &&
            !(
              MEMBER_APPROVAL_METHODS.some((method) => method === property) &&
              typeof input['messageId'] === 'string' &&
              deps.team?.approvals.ownsRequest(human, channelId, input['messageId'])
            )
          )
            return refuse('channel-not-found');
        }
        if (property === 'channelSend') {
          const channel = typeof channelId === 'string' ? deps.channels.get(channelId) : undefined;
          if (
            channel?.type === 'group' &&
            typeof input['body'] === 'string' &&
            input['body'].includes('@')
          ) {
            const candidates = channel.members.flatMap((id) => {
              const bot = deps.registry.get(id);
              return bot
                ? [{ botSlug: bot.slug, displayName: bot.displayName, eligible: true }]
                : [];
            });
            let body = input['body'];
            if (Array.isArray(input['mentions']) && input['mentions'].length <= 20)
              for (const selected of input['mentions']) {
                const token = object(selected);
                const bot =
                  typeof token['botSlug'] === 'string'
                    ? deps.registry.get(token['botSlug'])
                    : undefined;
                const start = token['start'];
                const end = token['end'];
                if (
                  bot &&
                  ownsBot(human, bot) &&
                  channel.members.includes(bot.slug) &&
                  bot.paused !== true &&
                  typeof start === 'number' &&
                  typeof end === 'number' &&
                  Number.isSafeInteger(start) &&
                  Number.isSafeInteger(end) &&
                  start >= 0 &&
                  end > start &&
                  end <= input['body'].length &&
                  input['body'].slice(start, end) === '@' + botMentionLabel(bot.displayName)
                )
                  body = body.slice(0, start) + ' '.repeat(end - start) + body.slice(end);
              }
            try {
              if (
                candidates.some(
                  (candidate) => !ownsBot(human, deps.registry.get(candidate.botSlug)),
                ) &&
                resolveBotMentionText(body, candidates).botSlugs.some(
                  (id) => !ownsBot(human, deps.registry.get(id)),
                )
              )
                return refuse('bot-not-found');
            } catch (error) {
              if (error instanceof AmbiguousBotMentionError) return refuse('bot-not-found');
              throw error;
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
        if (
          ['toolApprovalDecide', 'userQuestionAnswer'].includes(property) &&
          deps.team &&
          typeof channelId === 'string' &&
          typeof input['messageId'] === 'string'
        ) {
          try {
            deps.team.approvals.requireRequest(human, channelId, input['messageId']);
          } catch (error) {
            if (error instanceof TeamError) return refuse(error.code, error.details);
            throw error;
          }
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
        const result: unknown = Reflect.apply(operation, target, [payload, ...args]);
        const project = (result: unknown): unknown => {
          if (
            !deps.team ||
            ![
              'channelGet',
              'channels',
              'channelListChanges',
              'activitySnapshot',
              'channelMessages',
              'channelTimeline',
              'channelSearch',
              'messageSearch',
              'humanAttention',
              'toolApprovalStatus',
              'userQuestionStatus',
            ].includes(property)
          )
            return result;
          const record = object(result);
          if (
            record['ok'] === true &&
            ['toolApprovalStatus', 'userQuestionStatus'].includes(property) &&
            typeof channelId === 'string' &&
            typeof input['messageId'] === 'string'
          ) {
            const message = deps.team.approvals.request(channelId, input['messageId']);
            const approval = message && deps.team.approvals.card(human, channelId, message);
            if (approval) return { ...record, value: { ...object(record['value']), approval } };
          }
          return deps.team.approvals.project(
            human,
            result,
            typeof channelId === 'string' ? channelId : undefined,
          );
        };
        return result instanceof Promise
          ? result.then(project, (error: unknown) => {
              if (error instanceof TeamError) return refuse(error.code, error.details);
              throw error;
            })
          : project(result);
      };
      wrappers.set(property, { operation, guarded });
      return guarded;
    },
  });
}
