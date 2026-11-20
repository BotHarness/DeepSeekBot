import { skillOwnerKey } from '../skills/entries.js';
import { TeamError } from '../team/error.js';
import { acceptedQuestionAnswer } from './accepted-question-answer.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import { allBotPreview, assertAllBotPreview, type AllBotPreview } from './all-bot-mention.js';
import { GenuiError } from './genui.js';
import { assertGenuiMessage } from './genui-message.js';
import { assertQuoteTargets, quoteIds, sameQuoteIntent } from './quotes.js';
import { assertGrantRequestReply, grantRequester } from './grant-request.js';
import {
  assertAssignmentHumanReply,
  AssignmentReplyTargetError,
} from '../runtime/assignment-human-context.js';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import {
  defaultGroupWakePolicy,
  type BotSourceClass,
  type BotSourcePolicyStore,
} from '../runtime/source-policy.js';
import { attachmentIntent } from '../attachments/ref.js';
import { isBotDmChannel, type ChannelMessage } from './channel.js';
import {
  ChannelMentionTargetError,
  ChannelReplyTargetError,
  type ChannelMessageOrigin,
  type ChannelStore,
} from './store.js';
import {
  parseMessage,
  rawMessage,
  sourceKind,
  eventPayload,
} from './sqlite-store.message-payload.js';
import type { createChannelAdmissions } from './sqlite-store.admissions.js';
import type { createChannelRecords } from './sqlite-store.records.js';
import type { SqliteChannelAccess, SqliteChannelStoreOptions } from './sqlite-store.types.js';
import type { createChannelPlacements } from './sqlite-store.placements.js';
import type { createChannelHumans } from './sqlite-store.humans.js';

function skillInvocationIntent(message: ChannelMessage) {
  return (message.skillInvocations ?? []).map(({ name, owner, start, end }) => ({
    name,
    owner: skillOwnerKey(owner),
    start,
    end,
  }));
}

function sameIntent(left: ChannelMessage, right: ChannelMessage): boolean {
  const author = (message: ChannelMessage) =>
    message.author.kind === 'human'
      ? { kind: 'human', humanId: message.author.humanId ?? OWNER_HUMAN_CONTEXT.humanId }
      : message.author;
  return (
    JSON.stringify({
      author: author(left),
      body: left.body,
      attachments: attachmentIntent(left.attachments ?? []),
      replyTo: left.replyTo,
      memorySwitchTarget: left.memorySwitchTarget,
      tobCliRequestId: left.tobCliRequestId,
      mentions: left.mentions ?? [],
      humanMentions: left.humanMentions ?? [],
      channelRefs: left.channelRefs ?? [],
      skillInvocations: skillInvocationIntent(left),
      botDmAction: left.botDmAction,
      botCausation: left.botCausation,
      grantRequestResolution: left.grantRequestResolution,
      assignmentReply: left.assignmentReply,
      genui: left.genui,
      genuiReply: left.genuiReply,
      genuiReplyContext: left.genuiReplyContext,
    }) ===
      JSON.stringify({
        author: author(right),
        body: right.body,
        attachments: attachmentIntent(right.attachments ?? []),
        replyTo: right.replyTo,
        memorySwitchTarget: right.memorySwitchTarget,
        tobCliRequestId: right.tobCliRequestId,
        mentions: right.mentions ?? [],
        humanMentions: right.humanMentions ?? [],
        channelRefs: right.channelRefs ?? [],
        skillInvocations: skillInvocationIntent(right),
        botDmAction: right.botDmAction,
        botCausation: right.botCausation,
        grantRequestResolution: right.grantRequestResolution,
        assignmentReply: right.assignmentReply,
        genui: right.genui,
        genuiReply: right.genuiReply,
        genuiReplyContext: right.genuiReplyContext,
      }) && sameQuoteIntent(left.quotes, right.quotes)
  );
}

export function createChannelAppender({
  humanIdentity,
  sourceHumanIdentity,
  readRecord,
  humanAccess,
  placementsById,
  projectRows,
  placementMessages,
  grantResolutions,
  isBotActive,
  options,
  assertAttachmentRefs,
  humanBotDm,
  causeChannel,
  revisionOf,
  hasChannelAccessSchema,
  database,
  botHopLimit,
  sourcePolicy,
  insertSourceAdmission,
  now,
  project,
  admissionStatuses,
  humanReceiptsFor,
  humanMembers,
  projectPostPreview,
  sql,
}: {
  humanIdentity: ChannelStore['humanIdentity'];
  sourceHumanIdentity: ReturnType<typeof createChannelAdmissions>['sourceHumanIdentity'];
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
  humanAccess: SqliteChannelAccess;
  placementsById: ReturnType<typeof createChannelPlacements>['placementsById'];
  projectRows: ReturnType<typeof createChannelPlacements>['projectRows'];
  placementMessages: ReturnType<typeof createChannelPlacements>['placementMessages'];
  grantResolutions: ReturnType<typeof createChannelPlacements>['grantResolutions'];
  isBotActive: (slug: string) => boolean;
  options: SqliteChannelStoreOptions;
  assertAttachmentRefs: ChannelStore['assertAttachmentRefs'];
  humanBotDm: ReturnType<typeof createChannelRecords>['humanBotDm'];
  causeChannel: ReturnType<typeof createChannelAdmissions>['causeChannel'];
  revisionOf: ReturnType<typeof createChannelPlacements>['revisionOf'];
  hasChannelAccessSchema: ReturnType<typeof createChannelRecords>['hasChannelAccessSchema'];
  database: OperationalDatabaseModulePort;
  botHopLimit: () => number;
  sourcePolicy: BotSourcePolicyStore;
  insertSourceAdmission: ReturnType<typeof createChannelAdmissions>['insertSourceAdmission'];
  now: () => Date;
  project: ReturnType<typeof createChannelPlacements>['project'];
  admissionStatuses: ReturnType<typeof createChannelAdmissions>['admissionStatuses'];
  humanReceiptsFor: ReturnType<typeof createChannelHumans>['humanReceiptsFor'];
  humanMembers: ReturnType<typeof createChannelHumans>['humanMembers'];
  projectPostPreview: ReturnType<typeof createChannelPlacements>['projectPostPreview'];
  sql: {
    insertSourceEvent: (sourceHumanIdentity: () => boolean) => string;
    insertPlacement: string;
    insertOrdinaryAdmission: string;
    insertActionSourceEvent: string;
    insertActionPlacement: string;
    insertHandledActionAdmission: string;
    insertTraceSourceEvent: string;
    insertTracePlacement: string;
  };
}) {
  const append = (
    human: HumanContext,
    id: string,
    inputMessage: ChannelMessage,
    once: boolean,
    preview?: AllBotPreview,
    origin?: ChannelMessageOrigin,
    canCommit?: (database?: DatabaseSync) => boolean,
    acceptedQuestion = false,
  ) => {
    const identity = inputMessage.author.kind === 'human' ? humanIdentity(human) : undefined;
    const message =
      identity === undefined
        ? inputMessage
        : ({
            ...inputMessage,
            author: { kind: 'human', humanId: identity.humanId, displayName: identity.displayName },
          } satisfies ChannelMessage);
    if (
      !sourceHumanIdentity() &&
      message.author.kind === 'human' &&
      human.humanId !== OWNER_HUMAN_CONTEXT.humanId
    )
      throw new Error('Source Event Human identity requires a current database schema');
    const channel = readRecord(id);
    if (message.author.kind === 'human') {
      if (!acceptedQuestion)
        humanAccess.current?.requirePost(human, id, preview !== undefined, message);
      for (const ref of message.channelRefs ?? [])
        if (humanAccess.current && !humanAccess.current.canRead(human, ref.channelId))
          throw new TeamError('channel-not-found');
    }
    if (channel === undefined) return once ? { status: 'missing' as const } : undefined;
    if (message.author.kind === 'bot')
      humanAccess.current?.requireBotPost?.(message.author.slug, channel);
    const stored = placementsById(id, [message.id]);
    const existing = projectRows(id, stored)[0];
    if (existing !== undefined) {
      const storedQuotes = parseMessage(
        stored[0]!.payload_json,
        stored[0]!.body,
        stored[0]!.message_id,
        id,
      )?.quotes;
      if (
        !once ||
        !sameIntent({ ...existing, ...(storedQuotes ? { quotes: storedQuotes } : {}) }, message)
      )
        return { status: 'conflict' as const };
      return { status: 'existing' as const, message: existing };
    }
    const grantRequestId = message.grantRequestResolution?.requestMessageId;
    const previous = [
      ...placementMessages(id, [
        message.replyTo,
        grantRequestId,
        message.takeoverResolution?.requestMessageId,
        message.genui?.predecessorMessageId,
        message.genuiReply?.messageId,
        ...quoteIds(message),
      ]),
      ...grantResolutions(id, grantRequestId === undefined ? [] : [grantRequestId]),
    ];
    if (preview !== undefined) {
      if (message.author.kind !== 'human') throw new Error('All Bots requires a Human sender');
      assertAllBotPreview(
        allBotPreview(channel, isBotActive, options.botDisplayName ?? (() => undefined)),
        preview,
      );
    }
    if (message.replyTo !== undefined && !previous.some((item) => item.id === message.replyTo))
      throw new ChannelReplyTargetError();
    assertQuoteTargets(message.quotes, (messageId) =>
      previous.find((item) => item.id === messageId),
    );
    assertAttachmentRefs(message.attachments ?? []);
    const mentions = message.mentions ?? [];
    const humanMentions = message.humanMentions ?? [];
    if (
      humanMentions.length > 0 &&
      (channel.type !== 'group' ||
        message.author.kind !== 'bot' ||
        message.botCausation === undefined ||
        humanMentions.some(
          (mention) =>
            typeof mention.humanId !== 'string' ||
            mention.humanId.length === 0 ||
            typeof mention.label !== 'string' ||
            mention.label.length === 0 ||
            !Number.isSafeInteger(mention.start) ||
            !Number.isSafeInteger(mention.end) ||
            mention.start < 0 ||
            mention.end <= mention.start ||
            message.body.slice(mention.start, mention.end) !== '@' + mention.label,
        ))
    )
      throw new Error(
        'Human mentions require a trusted Bot sender and a current Group Human member',
      );
    if (
      mentions.length > 0 &&
      (channel.type === 'group'
        ? mentions.some(
            (item) =>
              !channel.members.includes(item.botSlug) ||
              message.body.slice(item.start, item.end) !== '@' + item.label,
          )
        : channel.botSlug === undefined ||
          message.author.kind !== 'human' ||
          mentions.some(
            (item) =>
              item.botSlug === channel.botSlug ||
              message.body.slice(item.start, item.end) !== '@' + item.label,
          ))
    ) {
      throw new ChannelMentionTargetError();
    }
    if (
      (message.channelRefs?.length ?? 0) > 0 &&
      (channel.type !== 'dm' ||
        channel.botSlug === undefined ||
        message.author.kind !== 'human' ||
        message.channelRefs?.some((ref) => {
          const target = readRecord(ref.channelId);
          return (
            target?.type !== 'group' || message.body.slice(ref.start, ref.end) !== '#' + ref.label
          );
        }))
    )
      throw new Error('Selected #Channel reference is no longer available');
    const senderSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
    if (
      channel.type === 'group' &&
      senderSlug !== undefined &&
      !channel.members.includes(senderSlug)
    )
      throw new Error('Only a joined Bot may author this Group Channel');
    if (
      channel.type === 'group' &&
      senderSlug !== undefined &&
      mentions.length > 0 &&
      message.botCausation === undefined
    )
      throw new Error('Bot Group mentions require trusted causation');
    const remoteSender = message.author.kind === 'remote-bot';
    if (
      message.author.kind === 'remote-bot' &&
      (channel.remoteBot?.hostId !== message.author.hostId ||
        channel.remoteBot?.botSlug !== message.author.slug ||
        !isBotDmChannel(channel))
    )
      throw new Error('Remote Bot does not own this DM');
    const botDm = isBotDmChannel(channel) && (senderSlug !== undefined || remoteSender);
    if (
      isBotDmChannel(channel) &&
      !remoteSender &&
      (senderSlug === undefined || !channel.members.includes(senderSlug))
    )
      throw new Error('Only a Bot DM participant may author this Channel');
    if (botDm && message.botCausation === undefined)
      throw new Error('Bot DM send requires trusted causation');
    const senderDm = botDm && senderSlug !== undefined ? humanBotDm(senderSlug) : undefined;
    if (botDm && !remoteSender && (senderDm?.type !== 'dm' || senderDm.botSlug !== senderSlug))
      throw new Error('Sender Human DM is unavailable for the Bot action notice');
    const cause =
      botDm && senderSlug !== undefined && message.botCausation !== undefined
        ? causeChannel(message.botCausation.parentSourceEventId, senderSlug, id)
        : undefined;
    const noticeChannel = !botDm || cause === 'target' ? undefined : (cause ?? senderDm);
    const recipient = botDm ? channel.members.find((slug) => slug !== senderSlug) : undefined;
    if (botDm && recipient === undefined && channel.remoteBot === undefined)
      throw new Error('Bot DM has no recipient');
    const durable = rawMessage(message);
    const revision = revisionOf(id) + 1;
    const sourceEventId = randomUUID();
    const action: ChannelMessage | undefined =
      noticeChannel !== undefined &&
      (recipient !== undefined || channel.remoteBot !== undefined) &&
      senderSlug !== undefined
        ? {
            id: `bot-dm-action-${durable.id}`,
            at: durable.at,
            author: { kind: 'bot', slug: senderSlug },
            body: '',
            ...(channel.remoteBot !== undefined
              ? { botChannelPost: { channelId: id, messageId: durable.id } }
              : {
                  botDmAction: {
                    channelId: id,
                    messageId: durable.id,
                    recipientBotSlug: recipient!,
                  },
                }),
          }
        : undefined;
    const actionRevision =
      noticeChannel === undefined ? undefined : revisionOf(noticeChannel.id) + 1;
    const humanDm = senderSlug === undefined ? undefined : humanBotDm(senderSlug);
    const senderPrincipal =
      senderSlug === undefined || !hasChannelAccessSchema()
        ? undefined
        : database.read((db) =>
            db.prepare('SELECT owner_human_id FROM persona_bots WHERE slug=?').get(senderSlug),
          )?.['owner_human_id'];
    const traceChannel =
      (typeof senderPrincipal !== 'string' ||
        !humanAccess.current ||
        humanAccess.current.canRead({ humanId: senderPrincipal }, channel.id)) &&
      senderSlug !== undefined &&
      (channel.type === 'group' || botDm) &&
      humanDm?.type === 'dm' &&
      humanDm.botSlug === senderSlug &&
      humanDm.deletedAt === undefined &&
      noticeChannel?.id !== humanDm.id
        ? humanDm
        : undefined;
    const trace: ChannelMessage | undefined =
      traceChannel !== undefined && senderSlug !== undefined
        ? {
            id: `bot-channel-post-${durable.id}`,
            at: durable.at,
            author: { kind: 'bot', slug: senderSlug },
            body: '',
            botChannelPost: { channelId: id, messageId: durable.id },
          }
        : undefined;
    const traceRevision = traceChannel === undefined ? undefined : revisionOf(traceChannel.id) + 1;
    let refused = false;
    try {
      database.transaction(
        (db) => {
          if (canCommit?.(db) === false) {
            refused = true;
            return;
          }
          if (preview !== undefined) {
            const currentChannel = readRecord(id);
            if (currentChannel === undefined) throw new Error('Group Channel no longer available');
            assertAllBotPreview(
              allBotPreview(
                currentChannel,
                isBotActive,
                options.botDisplayName ?? (() => undefined),
              ),
              preview,
            );
          }
          assertGrantRequestReply(channel, durable, previous);
          const snapshot =
            durable.genui === undefined
              ? undefined
              : (db
                  .prepare(`SELECT p.message_id, e.payload_json, e.body
                    FROM channel_placements p
                    JOIN source_events e ON e.source_event_id = p.source_event_id
                    WHERE p.channel_id = ? AND json_extract(e.payload_json, '$.genui.snapshotId') = ?
                    LIMIT 1`)
                  .get(id, durable.genui.snapshotId) as
                  | { message_id: string; payload_json: string; body: string }
                  | undefined);
          const snapshotMessage =
            snapshot === undefined
              ? undefined
              : parseMessage(snapshot.payload_json, snapshot.body, snapshot.message_id, id);
          assertGenuiMessage(
            channel,
            durable,
            snapshotMessage === undefined ? previous : [...previous, snapshotMessage],
          );
          assertAssignmentHumanReply(db, channel, durable);
          if (
            durable.grantRequestResolution !== undefined &&
            db
              .prepare(
                'SELECT 1 FROM workspace_grants WHERE id = ? AND bot_slug = ? AND revoked_at IS NULL',
              )
              .get(durable.grantRequestResolution.grantId, grantRequester(durable, previous)!) ===
              undefined
          )
            throw new ChannelReplyTargetError();
          for (const mention of humanMentions) {
            if (
              db
                .prepare(
                  'SELECT 1 FROM channel_human_members WHERE channel_id = ? AND human_id = ? AND left_at IS NULL',
                )
                .get(id, mention.humanId) === undefined
            )
              throw new Error('Mentioned Human must be a current Group Human member');
          }
          db.prepare(sql.insertSourceEvent(sourceHumanIdentity)).run(
            sourceEventId,
            sourceKind(durable),
            durable.author.kind === 'bot'
              ? durable.author.slug
              : channel.type === 'dm' && durable.author.kind === 'human'
                ? (channel.botSlug ?? null)
                : null,
            id,
            durable.id,
            durable.body,
            durable.at,
            eventPayload(durable),
            ...(sourceHumanIdentity()
              ? [durable.author.kind === 'human' ? human.humanId : null]
              : []),
          );
          db.prepare(sql.insertPlacement).run(id, revision, sourceEventId, durable.id);
          if (origin !== undefined && durable.author.kind === 'bot')
            db.prepare(`INSERT INTO channel_output_origins
              (source_event_id, session_id, request_source_event_id)
              SELECT ?, owner.session_id,
                (SELECT source_event_id FROM source_events WHERE source_event_id = ?)
              FROM session_ownership owner WHERE owner.session_id = ? AND owner.bot_slug = ?`).run(
              sourceEventId,
              origin.sourceEventId ?? null,
              origin.sessionId,
              durable.author.slug,
            );
          const takeoverRequester =
            durable.takeoverResolution === undefined || durable.takeoverResolution.by === 'bot'
              ? undefined
              : previous.find((entry) => entry.id === durable.takeoverResolution?.requestMessageId)
                  ?.author;
          const hopLimit = botHopLimit();
          const candidateRecipients =
            durable.privateInputResolution !== undefined
              ? []
              : durable.takeoverResolution !== undefined
                ? takeoverRequester?.kind === 'bot'
                  ? [
                      {
                        botSlug: takeoverRequester.slug,
                        reason: channel.type === 'dm' ? 'human-dm' : 'group-mention',
                      },
                    ]
                  : []
                : durable.author.kind === 'human'
                  ? channel.type === 'dm' && channel.botSlug !== undefined
                    ? [{ botSlug: channel.botSlug, reason: 'human-dm' }]
                    : [
                        ...new Set([
                          ...mentions.map((item) => item.botSlug),
                          ...(channel.type === 'group' && grantRequester(durable, previous)
                            ? [grantRequester(durable, previous)!]
                            : []),
                          ...(channel.type === 'group' &&
                          durable.toolAutoApprovalOverride !== undefined &&
                          channel.members.includes(durable.toolAutoApprovalOverride.botSlug)
                            ? [durable.toolAutoApprovalOverride.botSlug]
                            : []),
                        ]),
                      ].map((botSlug) => ({
                        botSlug,
                        reason: 'group-mention',
                      }))
                  : channel.type === 'group' &&
                      senderSlug !== undefined &&
                      durable.botCausation !== undefined &&
                      durable.botCausation.hop <= hopLimit
                    ? [...new Set(mentions.map((item) => item.botSlug))]
                        .filter((targetSlug) => targetSlug !== senderSlug)
                        .map((botSlug) => ({ botSlug, reason: 'group-mention' }))
                    : botDm &&
                        recipient !== undefined &&
                        durable.botCausation !== undefined &&
                        durable.botCausation.hop <= hopLimit
                      ? [{ botSlug: recipient, reason: 'bot-dm' }]
                      : [];
          const recipients = candidateRecipients.filter((item) => isBotActive(item.botSlug));
          const immediate = new Set(recipients.map((item) => item.botSlug));
          const ordinaryAllowed =
            (durable.author.kind === 'human' && durable.takeoverResolution === undefined) ||
            (senderSlug !== undefined &&
              durable.botCausation !== undefined &&
              durable.botCausation.hop <= hopLimit);
          const ordinary =
            channel.type === 'group' && ordinaryAllowed
              ? channel.members.flatMap((botSlug) => {
                  if (botSlug === senderSlug || immediate.has(botSlug) || !isBotActive(botSlug))
                    return [];
                  const sourceRule = sourcePolicy.resolveIn(db, botSlug, 'group-ordinary');
                  const policy =
                    channel.wakePolicies?.[botSlug] ?? defaultGroupWakePolicy(sourceRule);
                  return [{ botSlug, policy, sourceRule }];
                })
              : [];
          for (const recipient of recipients)
            insertSourceAdmission(
              db,
              sourceEventId,
              recipient.botSlug,
              recipient.reason as BotSourceClass,
            );
          for (const recipient of ordinary)
            db.prepare(sql.insertOrdinaryAdmission).run(
              sourceEventId,
              recipient.botSlug,
              recipient.policy.mode === 'all'
                ? 1
                : recipient.policy.mode === 'digest'
                  ? recipient.policy.count
                  : null,
              recipient.policy.mode === 'all'
                ? 0
                : recipient.policy.mode === 'digest'
                  ? recipient.policy.intervalSeconds * 1000
                  : null,
              recipient.policy.revision,
              recipient.policy.mode,
              recipient.sourceRule.revision,
              recipient.sourceRule.wake,
            );
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify({ ...channel, updatedAt: now().toISOString() }),
            id,
          );
          if (
            action !== undefined &&
            noticeChannel !== undefined &&
            actionRevision !== undefined &&
            senderSlug !== undefined
          ) {
            const actionSourceEventId = randomUUID();
            db.prepare(sql.insertActionSourceEvent).run(
              actionSourceEventId,
              'self-record',
              senderSlug,
              noticeChannel.id,
              action.id,
              '',
              action.at,
              JSON.stringify({
                ...JSON.parse(eventPayload(action)),
                causeSourceEventId: durable.botCausation?.parentSourceEventId,
              }),
            );
            db.prepare(sql.insertActionPlacement).run(
              noticeChannel.id,
              actionRevision,
              actionSourceEventId,
              action.id,
            );
            db.prepare(sql.insertHandledActionAdmission).run(
              actionSourceEventId,
              senderSlug,
              action.at,
            );
          }
          if (
            trace !== undefined &&
            traceChannel !== undefined &&
            traceRevision !== undefined &&
            senderSlug !== undefined
          ) {
            const traceSourceEventId = randomUUID();
            db.prepare(sql.insertTraceSourceEvent).run(
              traceSourceEventId,
              senderSlug,
              traceChannel.id,
              trace.id,
              trace.at,
              JSON.stringify({
                ...JSON.parse(eventPayload(trace)),
                causeSourceEventId: sourceEventId,
              }),
            );
            db.prepare(sql.insertTracePlacement).run(
              traceChannel.id,
              traceRevision,
              traceSourceEventId,
              trace.id,
            );
          }
        },
        ['source-event', 'channel', 'bot-inbox'],
      );
    } catch (error) {
      if (
        error instanceof OperationalDatabaseError &&
        error.code === 'transaction-failed' &&
        (error.cause instanceof ChannelReplyTargetError ||
          error.cause instanceof GenuiError ||
          error.cause instanceof AssignmentReplyTargetError)
      )
        throw error.cause;
      throw error;
    }
    if (refused) return { status: 'conflict' as const };
    const committed = project([...previous, durable], durable);
    const deliveries = admissionStatuses(sourceEventId);
    const humanReceipts = humanReceiptsFor(committed, revision, humanMembers(id));
    const result = {
      ...committed,
      channelRevision: revision,
      ...(deliveries === undefined ? {} : { deliveries }),
      ...(humanReceipts === undefined ? {} : { humanReceipts }),
    };
    for (const commit of [
      { channelId: id, message: result, revision, ...(origin === undefined ? {} : { origin }) },
      ...(action === undefined || noticeChannel === undefined || actionRevision === undefined
        ? []
        : [{ channelId: noticeChannel.id, message: action, revision: actionRevision }]),
      ...(trace === undefined || traceChannel === undefined || traceRevision === undefined
        ? []
        : [
            {
              channelId: traceChannel.id,
              message: { ...projectPostPreview(trace), channelRevision: traceRevision },
              revision: traceRevision,
            },
          ]),
    ]) {
      try {
        options.onCommitted?.(commit);
      } catch (error) {
        options.warn?.(`Channel post-commit notification failed: ${String(error)}`);
      }
    }
    return { status: 'appended' as const, message: result };
  };

  return {
    async reconcileQuestionAnswer(human, id, reference, answer) {
      const request = projectRows(id, placementsById(id, [reference.messageId]))[0];
      const message = acceptedQuestionAnswer(
        request,
        reference,
        answer,
        human ? humanIdentity(human) : undefined,
      );
      if (!message) return undefined;
      const result = append(
        human ?? OWNER_HUMAN_CONTEXT,
        id,
        message,
        true,
        undefined,
        undefined,
        undefined,
        true,
      );
      return result?.status === 'appended' || result?.status === 'existing'
        ? result.message
        : undefined;
    },
    async appendMessage(human: HumanContext, id, message, origin) {
      const result = append(human, id, message, false, undefined, origin);
      return result?.status === 'appended' ? result.message : undefined;
    },
    previewAllBotMention(id) {
      const channel = readRecord(id);
      if (channel === undefined) throw new Error('Group Channel not found');
      return allBotPreview(channel, isBotActive, options.botDisplayName ?? (() => undefined));
    },
    async appendMessageOnce(human: HumanContext, id, message, preview, origin, canCommit) {
      const result = append(human, id, message, true, preview, origin, canCommit);
      return result ?? { status: 'missing' };
    },
  } satisfies Pick<
    ChannelStore,
    'reconcileQuestionAnswer' | 'appendMessage' | 'previewAllBotMention' | 'appendMessageOnce'
  >;
}
