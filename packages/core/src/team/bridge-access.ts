import {
  BOT_ADMIN_READS,
  botAdminActionSchema,
  botMetadata,
  administrativeResult,
} from './bot-administration.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { BridgeMethods, BridgeMethodsDeps, BridgeResult } from '../bridge/methods.js';
import {
  MEMBER_METHODS,
  MEMBER_BOT_METHODS,
  MEMBER_BOT_IMPORT_METHODS,
  MEMBER_APPROVAL_METHODS,
} from './member-methods.js';
import { ownsBot } from './bot-access.js';
import { TeamError } from './error.js';

const adminSettings = new Set([
  ...BOT_ADMIN_READS,
  ...botAdminActionSchema.options.filter(
    (action) => action !== 'transfer' && action !== 'memberPurgeConfirm',
  ),
]);
const botCreationMethods = new Set(['create', 'createLookup', ...MEMBER_BOT_IMPORT_METHODS]);
const object = (input: unknown): Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input))
    : {};
const refuse = (code: string, details?: Record<string, unknown>): BridgeResult<never> => ({
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
  const administrate = (
    method: string,
    bot: PersonaBotRecord,
    payload: unknown,
    args: unknown[],
  ) => {
    if (human.caller === 'bot')
      return refuse('permission-required', { permission: 'privateContent.view' });
    if (BOT_ADMIN_READS.has(method) && method !== 'deletionPreview') {
      const metadata = { ok: true, value: { metadataOnly: true, bot: botMetadata(human, bot) } };
      return method === 'modelPlan' ? Promise.resolve(metadata) : metadata;
    }
    try {
      const action = botAdminActionSchema.safeParse(method);
      if (action.success) {
        if (!deps.team) return refuse('unavailable');
        deps.team.privateAccess.recordBotAction(human, bot, action.data);
      }
      admin ??= administration();
      const run: unknown = Reflect.get(admin, method);
      if (typeof run !== 'function') return refuse('unavailable');
      const redact = (raw: unknown) =>
        administrativeResult(human, deps.registry.getHistorical(bot.slug) ?? bot, method, raw);
      const result: unknown = Reflect.apply(run, admin, [payload, ...args]);
      return result instanceof Promise
        ? result.then(redact).catch(() => refuse('internal'))
        : redact(result);
    } catch (error) {
      if (error instanceof TeamError) return refuse(error.code, error.details);
      return refuse('internal');
    }
  };
  const wrappers = new Map<PropertyKey, { operation: unknown; guarded: unknown }>();
  return new Proxy(methods, {
    get(target, property, receiver) {
      const operation: unknown = Reflect.get(target, property, receiver);
      if (typeof operation !== 'function' || typeof property !== 'string') return operation;
      const cached = wrappers.get(property);
      if (cached?.operation === operation) return cached.guarded;
      const guarded = (payload: unknown, ...args: unknown[]) => {
        const owner = deps.team?.isOwner(human) ?? human.humanId === OWNER_HUMAN_CONTEXT.humanId;
        if (!owner && !deps.team && botCreationMethods.has(property))
          return refuse('permission-required', { permission: 'bots.createPrivate' });
        if (!owner && deps.team) {
          if (botCreationMethods.has(property)) {
            try {
              deps.team.roles.require(human, 'bots.createPrivate');
            } catch (error) {
              if (error instanceof TeamError) return refuse(error.code, error.details);
              throw error;
            }
          }
          if (deps.team.member(human.humanId)?.status !== 'active')
            return refuse('member-suspended');
        }
        const input = object(payload);
        if (
          deps.team &&
          [
            'botVisibility',
            'botVisibilitySet',
            'botSwitches',
            'reachableBots',
            'botProactiveOptOut',
            'roleConflicts',
            'speakerPolicy',
          ].includes(property)
        )
          return Reflect.apply(operation, target, [payload, ...args]);
        if (
          deps.team &&
          property === 'botAttention' &&
          human.caller !== 'bot' &&
          typeof input['slug'] === 'string' &&
          !ownsBot(human, deps.registry.get(input['slug'])) &&
          deps.team.bots.canReach(human, input['slug'])
        ) {
          const sharedSlug = input['slug'];
          const dm = deps.channels
            .list()
            .find(
              (channel) =>
                channel.type === 'dm' &&
                channel.botSlug === sharedSlug &&
                (channel.dmHumanId ?? deps.registry.get(sharedSlug)?.ownerHumanId) ===
                  human.humanId,
            );
          if (!dm) return { ok: true, value: { items: [] } };
          admin ??= administration();
          return admin.botAttention({ ...input, channelId: dm.id });
        }
        if (
          deps.team &&
          [
            'pinsSet',
            'hiddenSet',
            'topReorder',
            'channelAssign',
            'rosterBatch',
            'channelMuteSet',
          ].includes(property)
        ) {
          const ids: unknown[] = [];
          for (const key of ['pins', 'hidden', 'channelIds'])
            if (Array.isArray(input[key])) ids.push(...input[key]);
          if (Array.isArray(input['order']))
            for (const entry of input['order'])
              if (object(entry)['kind'] === 'channel') ids.push(object(entry)['id']);
          if (typeof input['channelId'] === 'string') ids.push(input['channelId']);
          if (
            ids.some(
              (id) =>
                typeof id === 'string' &&
                !deps.team?.bots.canReach(human, id) &&
                !ownsBot(human, deps.registry.getHistorical(id)) &&
                !deps.team?.channelAccess.canRead(human, id) &&
                !deps.team?.bots.hasReadableDm(human, id),
            )
          )
            return refuse('channel-not-found');
        }
        if (deps.team && property === 'channelDm' && typeof input['slug'] === 'string') {
          try {
            const channel = deps.team.bots.dm(human, input['slug']);
            return { ok: true, value: { channel } };
          } catch (error) {
            if (error instanceof TeamError) return refuse(error.code, error.details);
            throw error;
          }
        }
        const interaction = [
          'channelCreate',
          'channelGroupInvite',
          'channelSend',
          'channelAllBotPreview',
        ].includes(property);

        if (
          botCreationMethods.has(property) &&
          (input['public'] === true ||
            input['visibility'] === 'public' ||
            object(input['visibility'])['kind'] === 'public')
        ) {
          if (!owner) {
            try {
              deps.team?.roles.require(human, 'bots.createPublic');
            } catch (error) {
              if (error instanceof TeamError) return refuse(error.code, error.details);
              throw error;
            }
          }
          return refuse('invalid-input');
        }
        if (property === 'list' && input['administration'] === true) {
          if (
            (!owner && !deps.team?.roles.permissions(human).includes('bots.manageAll')) ||
            human.caller === 'bot'
          )
            return refuse('permission-required');
          const own = target.list(payload);
          if (!own.ok) return own;
          const listed = new Set(own.value.bots.map((bot) => bot.slug));
          const query =
            typeof input['query'] === 'string' ? input['query'].trim().toLowerCase() : '';
          return {
            ok: true,
            value: {
              bots: [
                ...own.value.bots,
                ...deps.registry
                  .listHistorical()
                  .filter(
                    (bot) =>
                      !ownsBot(human, bot) &&
                      !listed.has(bot.slug) &&
                      (!query ||
                        bot.displayName.toLowerCase().includes(query) ||
                        bot.slug.includes(query)),
                  )
                  .map((bot) => botMetadata(human, bot)),
              ],
            },
          };
        }
        if (!owner && ['channelCreate', 'channelGroupInvite'].includes(property)) {
          const refs = Array.isArray(input['members']) ? input['members'] : [input['botSlug']];
          if (
            refs.some(
              (id) =>
                typeof id === 'string' &&
                !(deps.team?.bots.canReach(human, id) ?? ownsBot(human, deps.registry.get(id))),
            )
          )
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
        if (property === 'messagingIdentity' && object(input['input'])['kind'] === 'bind') {
          const target =
            typeof input['slug'] === 'string' ? deps.registry.get(input['slug']) : undefined;
          if (!ownsBot(human, target)) return refuse('bot-principal-required');
          try {
            deps.team?.roles.require(human, 'im.bind');
          } catch (error) {
            if (error instanceof TeamError) return refuse(error.code, error.details);
            throw error;
          }
        }
        const slug = input['slug'];
        if (
          typeof slug === 'string' &&
          deps.team &&
          ([
            'sessions',
            'botAttention',
            'botToolTrace',
            'botTurnInput',
            'botSystemPrompt',
            'botContextWindow',
          ].includes(property) ||
            (property === 'botToolRun' && input['tool'] !== 'speaker_policy')) &&
          deps.team.bots.hasForeignDms(human, slug)
        )
          return refuse('bot-session-private', { slug });
        if (typeof slug === 'string') {
          const bot = deps.registry.getHistorical?.(slug) ?? deps.registry.get(slug);
          if (
            !owner &&
            MEMBER_BOT_METHODS.some((method) => method === property) &&
            !ownsBot(human, bot) &&
            !adminSettings.has(property)
          )
            return refuse('bot-not-found');
          if (bot && !ownsBot(human, bot)) {
            if (
              (!owner && !deps.team?.roles.permissions(human).includes('bots.manageAll')) ||
              !adminSettings.has(property)
            )
              return refuse('bot-not-found');
            return administrate(property, bot, payload, args);
          }
        }
        const channelId = input['channelId'];
        if (
          typeof channelId === 'string' &&
          ![
            'publicChannelJoin',
            'channelJoin',
            'channelPublicSet',
            'channelVisibilitySet',
            'channelPolicySet',
            'channelRoleDirectory',
            'channelHumanAdd',
            'channelMemberCandidates',
          ].includes(property)
        ) {
          const channel = deps.channels.get(channelId);
          if (
            channel?.type === 'dm' &&
            deps.team &&
            !deps.team.channelAccess.canRead(human, channelId)
          )
            return refuse(
              channel.dmHumanId || channel.humanParticipants
                ? 'channel-not-found'
                : 'bot-not-found',
            );
          if (
            !owner &&
            channel?.type === 'group' &&
            !deps.team?.channelAccess.canRead(human, channelId) &&
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
          const refs = input['channelRefs'];
          if (
            Array.isArray(refs) &&
            refs.some((ref) => {
              const id = object(ref)['channelId'];
              return (
                typeof id === 'string' &&
                (deps.team ? !deps.team.channelAccess.canRead(human, id) : !owner)
              );
            })
          )
            return refuse('channel-not-found');
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
            if (!bot) return !owner && !property.startsWith('humanAttention');
            if (!interaction)
              return property.startsWith('humanAttention')
                ? !ownsBot(human, bot) && !(deps.team?.bots.canReach(human, id) ?? false)
                : !ownsBot(human, bot);
            const reachable = () => deps.team?.bots.canReach(human, id) ?? ownsBot(human, bot);
            if (property !== 'channelSend' && property !== 'channelAllBotPreview')
              return !reachable();
            if (typeof channelId !== 'string') return true;
            const channel = deps.channels.get(channelId);
            return channel?.botSlug ? !reachable() : !channel?.members.includes(id);
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
              'activityOverview',
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
