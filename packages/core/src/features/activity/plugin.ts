import type { Context } from '@deepseek-ai/cordis';

import type { BotHarnessCore } from '../../plugin.js';
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
