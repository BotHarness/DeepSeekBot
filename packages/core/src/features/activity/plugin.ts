import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { attachOperationalModule, onOperationalDatabaseClose } from '../../database/owner.js';
import type { createCoreStartup } from '../../diagnostics/core-startup.js';
import { coalesce } from '../../runtime/coalesce.js';
import { createBotAttentionQuery } from '../../runtime/attention.js';
import {
  createHumanAttentionQuery,
  createHumanAttentionDecisions,
} from '../../runtime/human-attention.js';
import type { Context } from '@deepseek-ai/cordis';

import type { BotHarnessCore, createCore } from '../../plugin.js';
import { activityListPushSource } from '../../push/source.js';
import type { Presence } from '../../push/presence.js';
import type { DevicePushOptions } from '../../devices/mount.js';
import type { DshSessionStore } from '../../sessions/source.js';
import { ActivityToolDetails, createToolDetailIndex } from '../../state/tool-details.js';
import { createDshActivityProjection } from '../../state/dsh-activity.js';

const PUSH_TOPICS = new Set([
  'source-event',
  'channel',
  'human-attention',
  'bot-inbox',
  'assignments',
]);

export function apply(
  ctx: Context,
  core: Pick<BotHarnessCore, 'ownership' | 'states' | 'runtime'>,
  dshSessions: DshSessionStore,
  consumers: readonly string[] | undefined,
  describeCall: NonNullable<Parameters<typeof createDshActivityProjection>[0]['describeCall']>,
) {
  const toolDetails = createToolDetailIndex({
    owner: (sessionId) => core.ownership.resolve(sessionId),
    repairRevision: (sessionId) => core.ownership.repairRevision(sessionId),
    events: (sessionId) => dshSessions.get(sessionId)?.snapshotEvents(),
  });
  new ActivityToolDetails(ctx, toolDetails, [...(consumers ?? [])], (event) => {
    ctx.logger.info(
      `activity-tool-detail consumer=${event.consumer} outcome=${event.outcome} bytes=${event.bytes}`,
    );
  });
  ctx.effect(() => () => toolDetails.clear(), 'botharness: Activity Tool detail references');
  const activity = createDshActivityProjection({
    details: toolDetails,
    ownership: core.ownership,
    states: core.states,
    running: (sessionId) =>
      ctx.agents
        .list()
        .some((agent) => agent.session.id === sessionId && agent.status === 'running'),
    describeCall,
    assignmentTitle: (botSlug, sessionId) => core.runtime.getAssignment(botSlug, sessionId)?.title,
  });
  ctx.effect(() =>
    core.states.onActivity((event) => ctx.emit('botharness/personabot/activity', event)),
  );
  return activity;
}

export function createPush(
  core: Pick<
    BotHarnessCore,
    'humanAttention' | 'registry' | 'channels' | 'operationalDatabase' | 'states'
  >,
  presence: Presence,
): DevicePushOptions {
  return {
    source: activityListPushSource(
      core.humanAttention,
      (slug) => core.registry.get(slug)?.displayName,
      (channelId, messageId) => core.channels.message(channelId, messageId)?.toolApprovalRequest,
    ),
    watch: (changed) => {
      const offDatabase = core.operationalDatabase.subscribe(({ topics }) => {
        if (topics.some((topic) => PUSH_TOPICS.has(topic))) changed();
      });
      const offActivity = core.states.onActivity((event) => {
        if (event.cause === 'attention-changed') changed();
      });
      const offPresence = presence.subscribe(changed);
      return () => {
        offDatabase();
        offActivity();
        offPresence();
      };
    },
    held: (human) => presence.active(human),
  };
}

export function createBotAttention(
  startup: ReturnType<typeof createCoreStartup>,
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  channels: BotHarnessCore['channels'],
) {
  startup.enter('bot-attention', 'initialize');
  return createBotAttentionQuery(
    attachOperationalModule(operationalDatabase, 'messaging'),
    channels,
  );
}

export function createHumanAttention({
  startup,
  operationalDatabase,
  options,
  roster,
  team,
  states,
  registry,
  live,
}: Pick<BotHarnessCore, 'operationalDatabase' | 'team' | 'states'> & {
  startup: ReturnType<typeof createCoreStartup>;
  options: Pick<
    NonNullable<Parameters<typeof createCore>[0]>,
    'activeQuestionMessageIds' | 'activeToolApprovalMessageIds' | 'activePrivateInputMessageIds'
  >;
  roster: () => BotHarnessCore['roster'];
  registry: () => BotHarnessCore['registry'];
  live: () => BotHarnessCore['live'] | undefined;
}) {
  startup.enter('human-attention', 'initialize');
  const humanAttentionDatabase = attachOperationalModule(operationalDatabase, 'human-attention');
  const humanAttention = createHumanAttentionQuery(
    humanAttentionDatabase,
    options.activeQuestionMessageIds,
    options.activeToolApprovalMessageIds,
    options.activePrivateInputMessageIds,
    (human) => {
      try {
        return roster().forHuman(human.humanId).snapshot().muted;
      } catch {
        return [];
      }
    },
    () => new Date(),
    (human, value) => team.approvals.project(human, value),
  );
  startup.enter('human-attention', 'decisions');
  const humanAttentionDecisions = createHumanAttentionDecisions(humanAttentionDatabase);
  if (operationalDatabase.mode === 'ready') {
    startup.enter('human-attention', 'restore');
    const refreshDurableAttention = () =>
      states.replaceDurableAttention(
        humanAttention
          .durableAttention(OWNER_HUMAN_CONTEXT)
          .filter((row) => registry().get(row.botSlug) !== undefined),
      );
    refreshDurableAttention();
    const durableAttention = coalesce(refreshDurableAttention, {
      delayMs: 100,
      maxWaitMs: 500,
    });
    states.syncDurableAttentionWith(durableAttention.flush);
    onOperationalDatabaseClose(operationalDatabase, () => {
      states.syncDurableAttentionWith(() => {});
      durableAttention.cancel();
    });
    operationalDatabase.subscribe(({ topics }) => {
      if (topics.some((topic) => ['content-purge', 'member-purged'].includes(topic)))
        live()?.publishContentPurged();
      if (topics.includes('member-purged')) live()?.publishHumanIdentityChanged();
      if (
        topics.some((topic) =>
          [
            'channels',
            'bindings',
            'grants',
            'bot-schedules',
            'content-purge',
            'member-purged',
            'assignment-report',
            'bot-ownership',
            'team',
          ].includes(topic),
        )
      )
        live()?.publishRosterCommitted();
      if (
        topics.some((topic) =>
          ['assignments', 'source-event', 'bot-inbox', 'channel', 'human-attention'].includes(
            topic,
          ),
        )
      )
        durableAttention.schedule();
    });
  }
  return { humanAttention, humanAttentionDecisions };
}
