import { saveAttachmentFile } from '../../attachments/file-operations.js';
import { attachmentIdentity } from '../../attachments/ref.js';
import type { AttachmentStore } from '../../attachments/store.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { createChannelAccess } from '../../channels/runtime-access.js';
import type { ChannelStore } from '../../channels/store.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import { externalMemberWake } from '../../messaging/defaults.js';
import type { ExternalContextQuery } from '../../messaging/inbound.js';
import type { OutboundMessaging } from '../../messaging/outbound.js';
import { requireSourceEffects } from '../../purge/fence.js';
import type {
  OrchestratorAssignmentAccess,
  OrchestratorAgentRun,
  OrchestratorServiceTurn,
  BotRuntimeOptions,
} from '../../runtime/bot-runtime.js';
import type { InboxHistoryQuery } from '../../runtime/inbox-history.js';
import type { InboxTriage, OrchestratorInboxTriage } from '../../runtime/inbox-triage.js';
import { sessionDirectSpeaker } from '../../runtime/session-direct-message.js';
import type { BotSourcePolicyStore } from '../../runtime/source-policy.js';
import { botOwner } from '../../team/bot-access.js';
import type { TeamService } from '../../team/service.js';
import type { TobService } from '../../tob/service.js';
import type { WorkspaceGrantStore } from '../../workspaces/grants.js';
import type { createActivityEvents } from '../activity/events.js';
import type { createMessagingEvents } from '../messaging/events.js';
import { bindScheduleCommands } from '../schedules/events.js';

interface OrchestratorServicesPorts {
  activityEvents: ReturnType<typeof createActivityEvents>;
  assignmentAccess: (
    bot: PersonaBotRecord,
    sourceEventId: string | undefined,
    markAttemptSideEffect?: () => void,
    orchestratorSessionId?: string,
    readAdmissions?: Set<string>,
  ) => OrchestratorAssignmentAccess;
  attachments: AttachmentStore | undefined;
  channelAccess: ReturnType<typeof createChannelAccess>;
  channels: ChannelStore;
  database: OperationalDatabaseModulePort;
  externalMessaging: OutboundMessaging | undefined;
  grants: WorkspaceGrantStore | undefined;
  inboxHistory: InboxHistoryQuery;
  inboxTriage: InboxTriage;
  memory: BotRuntimeOptions['memory'];
  messagingEvents: ReturnType<typeof createMessagingEvents>;
  registry: PersonaBotRegistry;
  requireTurnAccess: (botSlug: string, ids: Iterable<string>) => void;
  schedules: BotRuntimeOptions['schedules'];
  sourcePolicy: BotSourcePolicyStore;
  team: TeamService | undefined;
  tob: TobService | undefined;
}

export function createOrchestratorServices(ports: OrchestratorServicesPorts) {
  function orchestratorServices(
    bot: PersonaBotRecord,
    turn: OrchestratorServiceTurn,
  ): Omit<
    OrchestratorAgentRun,
    'sessionId' | 'resume' | 'bot' | 'message' | 'inbox' | 'inboundChannelId'
  > & { triage: OrchestratorInboxTriage } {
    const channels = ports.channelAccess(
      bot.slug,
      turn.channelId,
      turn.sourceEventId,
      turn.sessionId,
      turn.markSideEffect,
      turn.readAdmissions,
      (ref) => turn.importedFiles.set(attachmentIdentity(ref), ref),
      turn.observeReads,
      turn.modelContent,
      turn.replyTargets,
    );
    return {
      ...(ports.team
        ? {
            speakerPolicy: (humanId?: string, topic?: string) => {
              ports.requireTurnAccess(bot.slug, turn.turnSources);
              const source = ports.database.read((db) =>
                db
                  .prepare('SELECT human_id FROM source_events WHERE source_event_id = ?')
                  .get(turn.sourceEventId ?? null),
              );
              return ports.team!.speakerPolicy.forHuman(
                humanId ??
                  (typeof source?.['human_id'] === 'string' ? source['human_id'] : botOwner(bot)),
                topic,
              );
            },
          }
        : {}),
      ...(ports.tob?.isTob(bot.slug) ? { tobCli: true } : {}),
      ...(ports.externalMessaging === undefined
        ? {}
        : {
            externalMessaging: {
              connected: () => {
                const { identities, grants } = ports.externalMessaging!.deletionDependencies(
                  bot.slug,
                );
                return identities.length > 0 || grants.length > 0;
              },
              senderPermissions: (id) => ports.externalMessaging!.senderPermissions(bot.slug, id),
              directory: (query) => ports.externalMessaging!.directory(bot.slug, query),
              reachable: async (bindingId, cursor) => {
                const snapshot = await ports.externalMessaging!.snapshot(bot.slug);
                const identities = (snapshot.identities ?? []).filter(
                  (identity) =>
                    !identity.revokedAt &&
                    identity.enabled &&
                    identity.availability === 'available' &&
                    (bindingId === undefined || identity.id === bindingId),
                );
                if (bindingId && !identities.length) throw new Error('identity-unavailable');
                if (cursor && !bindingId) throw new Error('bad-request');
                return Promise.all(
                  identities.map(async (identity) => {
                    const app = {
                      bindingId: identity.id,
                      platform: identity.platform,
                      accountName: identity.name,
                    };
                    try {
                      return {
                        ...app,
                        page: await ports.externalMessaging!.reachable(
                          bot.slug,
                          identity.id,
                          cursor,
                        ),
                      };
                    } catch (error) {
                      return {
                        ...app,
                        reason:
                          error instanceof Error &&
                          'code' in error &&
                          typeof error.code === 'string'
                            ? error.code
                            : 'provider-unavailable',
                      };
                    }
                  }),
                );
              },
              postConversation: (bindingId, conversationId, requestId, text) => {
                turn.markSideEffect();
                return ports.externalMessaging!.postConversation(
                  bot.slug,
                  bindingId,
                  conversationId,
                  requestId,
                  text,
                );
              },
              targets: async () => {
                const snapshot = await ports.externalMessaging!.snapshot(bot.slug);
                return snapshot.grants
                  .filter((g) => g.availability === 'available' && !g.revokedAt && g.canPost)
                  .flatMap((g) =>
                    g.postConversationId
                      ? [
                          {
                            grantId: g.id,
                            bindingId: g.bindingId,
                            accountRef: g.accountRef,
                            platform: g.platform,
                            accountName: g.accountName,
                            targetName: g.targetName,
                            conversationId: g.postConversationId,
                            canPost: true as const,
                          },
                        ]
                      : [],
                  );
              },
              post: (grantId, requestId, text) => {
                turn.markSideEffect();
                return ports.externalMessaging!.post(bot.slug, grantId, requestId, text);
              },
              outbox: (intentId) => {
                if (intentId) return ports.externalMessaging!.inspectIntent(bot.slug, intentId);
                return ports
                  .externalMessaging!.history(bot.slug)
                  .filter((intent) => intent.report)
                  .slice(0, 10)
                  .map(({ text, ...intent }) => ({
                    ...intent,
                    preview: text.slice(0, 160),
                  }));
              },
              policies: async () => {
                const snapshot = await ports.externalMessaging!.snapshot(bot.slug);
                return snapshot.grants
                  .filter((grant) => grant.receiveScope && grant.groupPolicy)
                  .map((grant) => ({
                    grantId: grant.id,
                    group: grant.targetName,
                    policy: grant.groupPolicy!,
                    ...(grant.receiveTargetChannelId &&
                    ports.channels.get(grant.receiveTargetChannelId)
                      ? {
                          memberWake: externalMemberWake(
                            ports.channels.get(grant.receiveTargetChannelId)!,
                            bot.slug,
                            ports.sourcePolicy
                              .list(bot.slug)
                              .find((rule) => rule.sourceClass === 'group-ordinary'),
                            ports.externalMessaging!.defaults(),
                          ),
                        }
                      : {}),
                    ordinaryDelivery: grant.ordinaryDelivery ?? 'unverified',
                  }));
              },
              setPolicy: (grantId, input) => {
                turn.markSideEffect();
                return ports.externalMessaging!.inbound.setPolicy(bot.slug, grantId, input, {
                  kind: 'bot',
                  botSlug: bot.slug,
                });
              },
              threads: async () => {
                const snapshot = await ports.externalMessaging!.snapshot(bot.slug);
                return snapshot.grants.flatMap((grant) =>
                  (grant.threadPolicies ?? []).map((thread) => ({
                    ...thread,
                    grantId: grant.id,
                    group: grant.targetName,
                  })),
                );
              },
              setThread: (sourceEventId, input) => {
                turn.markSideEffect();
                return ports.externalMessaging!.inbound.setThread(bot.slug, sourceEventId, input, {
                  kind: 'bot',
                  botSlug: bot.slug,
                });
              },
              read: (id: string) => {
                const source = ports.externalMessaging!.inbound.readShared(bot.slug, id);
                if (turn.observeReads)
                  ports.messagingEvents.observeExternalRead(bot.slug, [id], turn.readAdmissions);
                return source;
              },
              replyCapability: (source, signal) =>
                ports.externalMessaging!.replyCapability(bot.slug, source, signal),
              share: (id, destinationChannelId) => {
                turn.markSideEffect();
                return ports.externalMessaging!.inbound.share(bot.slug, id, destinationChannelId);
              },
              context: async (id: string, query: ExternalContextQuery, signal?: AbortSignal) => {
                const result = await ports.externalMessaging!.inbound.context(
                  bot.slug,
                  id,
                  turn.sessionId,
                  query,
                  signal,
                );
                if (turn.observeReads)
                  ports.messagingEvents.observeExternalRead(
                    bot.slug,
                    result.messages.map((item) => item.sourceEventId),
                    turn.readAdmissions,
                  );
                return result;
              },
              saveFile: async (input) => {
                if (ports.attachments === undefined || ports.grants === undefined)
                  throw new Error('Bridge file operations are unavailable');
                const destinationGrant = ports.grants.requireActive(bot.slug, input.grantId);
                if (destinationGrant.orchestratorWrite !== true)
                  throw new Error('Destination requires Orchestrator write authorization');
                const ref = await (
                  input.representation === 'playback'
                    ? ports.externalMessaging!.prepareAudio
                    : ports.externalMessaging!.acquireFile
                )(bot.slug, input.sourceEventId, input.attachmentId);
                return saveAttachmentFile(input, {
                  botSlug: bot.slug,
                  grants: ports.grants,
                  attachments: ports.attachments,
                  source: () => {
                    if (!ports.externalMessaging!.inbound.available(bot.slug, input.sourceEventId))
                      throw new Error('Bridge file source is unavailable');
                    return ports.attachments!.current(ref);
                  },
                });
              },
              replyFile: (id: string, fileId: string, messageKey?: string) => {
                const ref = turn.importedFiles.get(fileId);
                if (ref === undefined || ports.attachments === undefined)
                  throw new Error(
                    'Select a result file with channel_attachment_import in this run before replying',
                  );
                turn.markSideEffect();
                return ports.externalMessaging!.replyFile(
                  bot.slug,
                  id,
                  ports.attachments.current(ref),
                  messageKey,
                );
              },
              reply: (id: string, text: string, messageKey?: string) => {
                turn.markSideEffect();
                return ports.externalMessaging!.reply(bot.slug, id, text, messageKey);
              },
            },
          }),
      inboxHistory: (input) => ports.inboxHistory.list(bot.slug, input),
      triage: ports.inboxTriage.access({
        botSlug: bot.slug,
        sessionId: turn.sessionId,
        current: () => [...turn.turnSources, ...turn.readAdmissions],
        changed: (changedChannelId, messageId) =>
          ports.channels.admissionChanged?.(changedChannelId, messageId),
        snoozed: () => ports.activityEvents.armSnooze(bot.slug),
      }),
      channels,
      replyDestination: (id) => {
        const source = ports.database.read((db) => {
          requireSourceEffects(db, id, bot.slug);
          return db
            .prepare('SELECT source_kind FROM source_events WHERE source_event_id = ?')
            .get(id);
        });
        if (source?.source_kind === 'bridge-message') {
          return {
            kind: 'external',
            source: ports.externalMessaging!.inbound.readShared(bot.slug, id),
          };
        }
        const reply = channels.replySource!(id);
        return { kind: 'channel', ...reply };
      },
      sourcePolicy: {
        list: () => ports.sourcePolicy.list(bot.slug),
        setAssignmentReport: (wake) => {
          turn.markSideEffect();
          const changed = ports.sourcePolicy.setAssignmentReport(bot.slug, wake, {
            kind: 'bot',
            botSlug: bot.slug,
          });
          return changed;
        },
        resetAssignmentReport: () => {
          turn.markSideEffect();
          const changed = ports.sourcePolicy.resetAssignmentReport(bot.slug, {
            kind: 'bot',
            botSlug: bot.slug,
          });
          return changed;
        },
        setGroupOrdinary: (wake, digestCount, digestIntervalSeconds) => {
          turn.markSideEffect();
          return ports.sourcePolicy.setGroupOrdinary(
            bot.slug,
            wake,
            digestCount,
            digestIntervalSeconds,
            { kind: 'bot', botSlug: bot.slug },
          );
        },
        setImmediateDelivery: (sourceClass, delivery) => {
          turn.markSideEffect();
          return ports.sourcePolicy.setImmediateDelivery(bot.slug, sourceClass, delivery, {
            kind: 'bot',
            botSlug: bot.slug,
          });
        },
        resetImmediateDelivery: (sourceClass) => {
          turn.markSideEffect();
          return ports.sourcePolicy.resetImmediateDelivery(bot.slug, sourceClass, {
            kind: 'bot',
            botSlug: bot.slug,
          });
        },
        resetGroupOrdinary: () => {
          turn.markSideEffect();
          return ports.sourcePolicy.resetGroupOrdinary(bot.slug, {
            kind: 'bot',
            botSlug: bot.slug,
          });
        },
      },
      ...(ports.schedules === undefined
        ? {}
        : { schedules: bindScheduleCommands(ports.schedules, bot, () => turn.markSideEffect()) }),
      ...(turn.observeMemory
        ? {
            memory: {
              continueFromCommit: (sha, branch) => {
                if (ports.memory === undefined) throw new Error('Memory is unavailable');
                const result = ports.memory.continueFromCommit({
                  botSlug: bot.slug,
                  sessionId: turn.sessionId,
                  sha,
                  branch,
                });
                turn.markSideEffect();
                return result;
              },
              switchBranch: (branch) => {
                if (ports.memory === undefined) throw new Error('Memory is unavailable');
                const result = ports.memory.switchBranch({
                  botSlug: bot.slug,
                  sessionId: turn.sessionId,
                  branch,
                });
                turn.markSideEffect();
                return result;
              },
            },
          }
        : {}),
      assignments: ports.assignmentAccess(
        bot,
        turn.sourceEventId,
        turn.markSideEffect,
        turn.sessionId,
        turn.readAdmissions,
      ),
    };
  }

  function speakerInput(botSlug: string, sessionId: string, ids: readonly string[], body: string) {
    const bot = ports.registry.get(botSlug);
    if (!ports.team || !bot || !ports.team.bots.speakerContextEnabled(botSlug)) return undefined;
    const pending = new Map<string, number>();
    const envelopes: Array<ReturnType<TeamService['speakerPolicy']['envelope']>> = [];
    let text = body;
    for (const id of new Set(ids)) {
      if (!text.includes(id)) continue;
      const source = ports.database.read((db) =>
        db
          .prepare(
            "SELECT human_id FROM source_events WHERE source_event_id=? AND source_kind='human-message'",
          )
          .get(id),
      );
      if (typeof source?.['human_id'] !== 'string') continue;
      const envelope = ports.team.speakerPolicy.envelope(
        sessionId,
        source['human_id'],
        '',
        pending,
      );
      envelopes.push(envelope);
      const direct = sessionDirectSpeaker(text, id, envelope.text);
      if (direct !== undefined) {
        text = direct;
        continue;
      }
      const header = `Source Event ID: ${id}`;
      const anchor = text.includes(header) ? header : `[Source Event ${id}]`;
      if (text.includes(anchor))
        text = text.replace(anchor, `${anchor} ${envelope.text.trimEnd()}`);
      else text = text.replace(id, `${id} ${envelope.text.trimEnd()}`);
    }
    return envelopes.length
      ? {
          text,
          commit: () => {
            for (const envelope of envelopes) envelope.commit();
          },
        }
      : undefined;
  }

  return { orchestratorServices, speakerInput };
}
