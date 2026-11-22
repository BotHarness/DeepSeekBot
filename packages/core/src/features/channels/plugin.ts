import { ownsBot } from '../../team/bot-access.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { join } from 'node:path';
import type { CompanionFeed } from '../../companions/feed.js';
import type { Context } from '@deepseek-ai/cordis';
import type { createCoreStartup } from '../../diagnostics/core-startup.js';
import { watchHumanAttention } from '../../runtime/human-attention-live.js';
import {
  createChannelLiveHub,
  CHANNEL_STREAM_PATH,
  type ChannelLiveHub,
} from '../../channels/live.js';
import { personaBotOutputCommitted } from '../../channels/output.js';
import { createSqliteChannelStore } from '../../channels/sqlite-store.js';
import { attachOperationalModule } from '../../database/owner.js';
import type { BotRuntime } from '../../runtime/bot-runtime.js';
import { personaBotActivitySnapshot } from '../../state/bot-state.js';
import type { BotHarnessCore } from '../../plugin-types.js';
import type { CoreOptions } from '../../plugin-types.js';
import type { HostFetchConnection } from '../../plugin-types.js';

export function createChannels(
  deps: Pick<
    BotHarnessCore,
    | 'operationalDatabase'
    | 'sourcePolicy'
    | 'registry'
    | 'attachments'
    | 'mediaVersions'
    | 'externalMessaging'
    | 'ownership'
  > & {
    dshHome: string;
    options: CoreOptions;
    botHopLimit: () => number;
    groupInvitationPolicies: { policy: () => boolean }[];
    initialGroupInvitationPolicy: () => boolean;
    readonly companions: CompanionFeed | undefined;
    readonly live: ChannelLiveHub | undefined;
    readonly runtime: BotRuntime | undefined;
  },
) {
  const {
    operationalDatabase,
    sourcePolicy,
    registry,
    attachments,
    mediaVersions,
    externalMessaging,
    dshHome,
    options,
    botHopLimit,
    groupInvitationPolicies,
    initialGroupInvitationPolicy,
  } = deps;
  return createSqliteChannelStore({
    botHopLimit,
    autoAcceptGroupInvitations: () =>
      (groupInvitationPolicies.at(-1)?.policy ?? initialGroupInvitationPolicy)(),
    database: attachOperationalModule(operationalDatabase, 'messaging'),
    sourcePolicy,
    databaseOwnerReady: operationalDatabase.mode === 'ready',
    isBotActive: (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    },
    attachments,
    mediaVersions,
    botDisplayName: (botSlug) => registry.getHistorical(botSlug)?.displayName,
    rootDir: join(dshHome, 'botharness', 'channels'),
    onCommitted: (commit) => {
      try {
        externalMessaging.failureAlerts.committed(commit);
      } catch {
        options.warn?.('failure-alert-notification-enqueue-failed');
      }
      try {
        const output = personaBotOutputCommitted(commit, deps.ownership);
        if (output !== undefined) deps.companions?.publish(output);
      } catch {
        options.warn?.('companion-output-publication-failed');
      }
      if (options.onOutputCommitted !== undefined) {
        try {
          const event = personaBotOutputCommitted(commit, deps.ownership);
          if (event !== undefined) options.onOutputCommitted(event);
        } catch {
          options.warn?.('personabot-output-publication-failed');
        }
      }
      let publicationFailed = false;
      try {
        deps.live?.publishCommitted(commit);
      } catch {
        publicationFailed = true;
      }
      void externalMessaging.forwardWebDm(commit);
      if (commit.message.memberDeparture !== undefined) {
        try {
          deps.runtime?.admitGroupMessage(commit.channelId, commit.message.id);
        } catch {
          deps.runtime?.retryGroupMessageAdmission?.(commit.channelId, commit.message.id);
          options.warn?.('group-admission-wake-failed-retrying');
        }
      }
      if (publicationFailed) options.warn?.('channel-live-publication-failed');
    },
    onRecordChanged: () => deps.live?.publishRosterCommitted(),
    onAdmissionChanged: (channelId, messageId, message) =>
      deps.live?.publishAdmission(channelId, messageId, message),
    onHumanReadChanged: (channelId, humanId, revision) =>
      deps.live?.publishHumanRead(channelId, humanId, revision),
    onReactionChanged: (channelId, messageId, reactions) =>
      deps.live?.publishReaction(channelId, messageId, reactions),
    onVoiceChanged: (channelId, messageId, message) =>
      deps.live?.publishVoice(channelId, messageId, message),
    onAttachmentsChanged: (channelId, messageId, message) =>
      deps.live?.publishAttachments(channelId, messageId, message),
    onSessionLinksChanged: (channelId, messageId, message) =>
      deps.live?.publishSessionLinks(channelId, messageId, message),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
}

export function createLive({
  channels,
  registry,
  states,
  contentPurge,
  operationalDatabase,
  team,
}: Pick<
  BotHarnessCore,
  'channels' | 'registry' | 'states' | 'contentPurge' | 'operationalDatabase' | 'team'
>) {
  return createChannelLiveHub(
    channels,
    {
      snapshot: (human) =>
        personaBotActivitySnapshot(
          registry.list(human.humanId).map((bot) => bot.slug),
          states,
        ),
      onChange: (changed) => states.onActivity((event) => changed(event)),
    },
    () => contentPurge.redactions(),
    (changed) =>
      watchHumanAttention(
        operationalDatabase,
        (notify) =>
          states.onActivity((event) => {
            if (event.cause === 'attention-changed') notify();
          }),
        changed,
      ),
    (human, resource) =>
      resource === 'model-providers' || resource === 'engine-device-login'
        ? human.caller !== 'bot' &&
          (team.isOwner(human) || team.roles.permissions(human).includes('modelSources.manage'))
        : team.isOwner(human),
    (human, slug) => ownsBot(human, registry.getHistorical(slug)),
    (human, id) => team.channelAccess.canRead(human, id, true),
    (human, id) => team.channelAccess.canKnow(human, id),
    (human, value, channelId) => team.approvals.project(human, value, channelId),
  );
}

export function reconcileGroupMembers(
  startup: ReturnType<typeof createCoreStartup>,
  {
    operationalDatabase,
    channels,
    registry,
  }: Pick<BotHarnessCore, 'operationalDatabase' | 'channels' | 'registry'>,
) {
  if (operationalDatabase.mode === 'ready') {
    startup.enter('messaging', 'reconcile-group-members');
    const activeBots = new Set(registry.list().map((bot) => bot.slug));
    const missingMembers = new Set(
      channels
        .list()
        .flatMap((channel) =>
          channel.type !== 'group'
            ? []
            : [
                ...channel.members,
                ...(channel.ownerBotSlug === undefined ? [] : [channel.ownerBotSlug]),
              ].filter((slug) => !activeBots.has(slug)),
        ),
    );
    for (const slug of missingMembers) channels.removeBotFromGroups(slug);
  }
}

export function mountLiveRoute(
  connectionCtx: Context,
  connection: HostFetchConnection,
  core: Pick<BotHarnessCore, 'live'>,
) {
  connectionCtx.effect(() => {
    return connection.fetch.register({
      path: CHANNEL_STREAM_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        return core.live.open(OWNER_HUMAN_CONTEXT, request);
      },
    });
  }, 'botharness: Channel live stream');
}
