import { allBotPreview, assertAllBotPreview, type AllBotPreview } from './all-bot-mention.js';
import { projectBridgeMessage } from '../messaging/channel-target.js';
import type { ExternalSource } from '../messaging/inbound.js';
import { isChannelNotice, notChannelNoticeSql } from './channel-notice.js';
import {
  createLegacyAttachmentMigration,
  type RetainedAttachmentMessage,
} from '../attachments/legacy-migration.js';
import { projectAttachmentFiles } from '../attachments/message-files.js';
import {
  assertGrantRequestReply,
  grantRequester,
  isGrantRequestResolved,
} from './grant-request.js';
import {
  assertAssignmentHumanReply,
  AssignmentReplyTargetError,
} from '../runtime/assignment-human-context.js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import {
  createBotSourcePolicyStore,
  defaultGroupWakePolicy,
  type BotSourceClass,
  type BotSourcePolicyStore,
} from '../runtime/source-policy.js';
import { isValidSlug } from '../bots/slug.js';
import { ChannelAttachmentError } from '../attachments/store.js';
import {
  attachmentIdentity,
  attachmentIntent,
  isChannelAttachmentRef,
  type ChannelAttachmentRef,
} from '../attachments/ref.js';
import {
  botDmChannelId,
  dmChannelId,
  isBotDmChannel,
  MAX_BOT_HOPS,
  LOCAL_HUMAN_ID,
  groupChannelIdBase,
  isChannelMessage,
  isChannelMessageAuthor,
  isChannelRecord,
  isGroupAvatar,
  isValidChannelId,
  isReactionEmoji,
  MAX_ACTOR_REACTIONS_PER_MESSAGE,
  type ChannelReaction,
  type LocalHumanIdentity,
  type ChannelMessage,
  type ChannelRecord,
  type GroupInvitation,
  type GroupJoinRequest,
  type GroupWakePolicyActor,
  type GroupWakePolicyView,
} from './channel.js';
import {
  ChannelMentionTargetError,
  ChannelReactionLimitError,
  ChannelReplyTargetError,
  prepareChannelMessageQuery,
  type ChannelStore,
  type ChannelStoreOptions,
  type ChannelMessageOrigin,
} from './store.js';
import {
  DEFAULT_MESSAGE_PAGE,
  MAX_MESSAGE_PAGE,
  pageChannelJournal,
  pageChannelTimeline,
} from './timeline.js';

interface SqliteChannelStoreOptions extends ChannelStoreOptions {
  database: OperationalDatabaseModulePort;
  databaseOwnerReady?: boolean;
  sourcePolicy?: BotSourcePolicyStore;

  autoAcceptGroupInvitations?: () => boolean;
}

interface PlacementRow {
  message_id: string;
  created_at: string;
  revision: number;
  source_event_id: string;
  payload_json: string;
  body: string;
  home_channel_id?: string | null;
}

const POST_PREVIEW_CHARACTERS = 80;

interface AdmissionRow {
  bot_slug: string;
  reason: string;
  attempt_state: string;
  ignored_at: string | null;
  observed_at: string | null;
}

function parseRecord(value: string, id: string): ChannelRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isChannelRecord(parsed, id) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseMessage(
  value: string,
  body?: string,
  messageId?: string,
): ChannelMessage | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    const external =
      typeof parsed === 'object' && parsed !== null && 'external' in parsed
        ? (parsed as { external: ExternalSource }).external
        : undefined;
    const payload =
      external && body !== undefined
        ? projectBridgeMessage(external, body)
        : body === undefined
          ? parsed
          : { ...(parsed as object), body };
    const candidate = messageId === undefined ? payload : { ...(payload as object), id: messageId };
    return isChannelMessage(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function replyProjection(
  message: ChannelMessage,
  byId: ReadonlyMap<string, ChannelMessage>,
): ChannelMessage {
  if (message.replyTo === undefined) return message;
  const target = byId.get(message.replyTo);
  if (target === undefined) return { ...message, replyToPreview: null };
  const normalized = target.body.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(normalized);
  return {
    ...message,
    replyToPreview: {
      author: target.author,
      body: characters.length > 140 ? characters.slice(0, 140).join('') + '...' : normalized,
    },
  };
}

function noticeOrigin(
  message: ChannelMessage,
  row: Pick<PlacementRow, 'home_channel_id'>,
  channelId: string,
): Pick<ChannelMessage, 'noticeOrigin'> {
  return isChannelNotice(message) &&
    typeof row.home_channel_id === 'string' &&
    row.home_channel_id !== channelId
    ? { noticeOrigin: { channelId: row.home_channel_id } }
    : {};
}

function sameIntent(left: ChannelMessage, right: ChannelMessage): boolean {
  return (
    JSON.stringify({
      author: left.author,
      body: left.body,
      attachments: attachmentIntent(left.attachments ?? []),
      replyTo: left.replyTo,
      memorySwitchTarget: left.memorySwitchTarget,
      mentions: left.mentions ?? [],
      humanMentions: left.humanMentions ?? [],
      channelRefs: left.channelRefs ?? [],
      botDmAction: left.botDmAction,
      botCausation: left.botCausation,
      grantRequestResolution: left.grantRequestResolution,
      assignmentReply: left.assignmentReply,
    }) ===
    JSON.stringify({
      author: right.author,
      body: right.body,
      attachments: attachmentIntent(right.attachments ?? []),
      replyTo: right.replyTo,
      memorySwitchTarget: right.memorySwitchTarget,
      mentions: right.mentions ?? [],
      humanMentions: right.humanMentions ?? [],
      channelRefs: right.channelRefs ?? [],
      botDmAction: right.botDmAction,
      botCausation: right.botCausation,
      grantRequestResolution: right.grantRequestResolution,
      assignmentReply: right.assignmentReply,
    })
  );
}

function sourceKind(message: ChannelMessage): string {
  return message.author.kind === 'human'
    ? 'human-message'
    : message.author.kind === 'bot'
      ? 'bot-message'
      : 'system-message';
}

function rawMessage(message: ChannelMessage): ChannelMessage {
  const result = { ...message };
  delete result.grantRequestResolved;
  delete result.replyToPreview;
  delete result.botChannelPostPreview;
  delete result.noticeOrigin;
  delete result.deliveries;
  delete result.humanReceipts;
  delete result.reactions;
  delete result.channelRevision;
  return result;
}

function eventPayload(message: ChannelMessage): string {
  const { body: _body, ...envelope } = rawMessage(message);
  return JSON.stringify(envelope);
}

export function createSqliteChannelStore(options: SqliteChannelStoreOptions): ChannelStore {
  const { database, rootDir } = options;
  const now = options.now ?? (() => new Date());
  const sourcePolicy = options.sourcePolicy ?? createBotSourcePolicyStore(database, now);
  const insertSourceAdmission = (
    db: DatabaseSync,
    sourceEventId: string,
    botSlug: string,
    sourceClass: BotSourceClass,
  ): void => {
    const rule = sourcePolicy.resolveIn(db, botSlug, sourceClass);
    db.prepare(`
      INSERT INTO inbox_admissions
        (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
      VALUES (?, ?, ?, ?, ?)
    `).run(sourceEventId, botSlug, sourceClass, rule.revision, rule.wake);
  };
  const causeChannel = (
    sourceEventId: string,
    botSlug: string,
    targetChannelId: string,
  ): ChannelRecord | 'target' | undefined => {
    const cause = database.read(
      (db) =>
        db
          .prepare('SELECT channel_id FROM source_events WHERE source_event_id = ?')
          .get(sourceEventId) as { channel_id: string | null } | undefined,
    );
    if (cause?.channel_id == null) return undefined;
    if (cause.channel_id === targetChannelId) return 'target';
    const channel = readRecord(cause.channel_id);
    if (channel === undefined) return undefined;
    if (channel.type === 'group' || isBotDmChannel(channel))
      return channel.members.includes(botSlug) ? channel : undefined;
    return channel.botSlug === botSlug ? channel : undefined;
  };
  const settleInvitation = (db: DatabaseSync, invitationId: string, timestamp: string): void => {
    db.prepare(`
      UPDATE inbox_admissions SET attempt_state = 'handled',
        handled_at = COALESCE(handled_at, ?), last_error = NULL
      WHERE reason = 'group-invite' AND source_event_id IN (
        SELECT source_event_id FROM source_events WHERE message_id = ?
      )
    `).run(timestamp, invitationId);
  };
  const isBotActive = options.isBotActive ?? (() => true);
  let lowerRegistered = false;
  const retainedAttachments = (): RetainedAttachmentMessage[] => {
    const rows = database.read((db) =>
      db.prepare('SELECT source_event_id, payload_json, body FROM source_events').all(),
    ) as Array<{ source_event_id: string; payload_json: string; body: string }>;
    return rows.flatMap((row) => {
      const message = parseMessage(row.payload_json, row.body);
      return message === undefined ? [] : [{ sourceEventId: row.source_event_id, message }];
    });
  };
  const attachmentMigration = createLegacyAttachmentMigration(
    database,
    options.attachments,
    retainedAttachments,
    options.warn,
  );

  const assertAttachmentRefs = (refs: readonly ChannelAttachmentRef[]): void => {
    if (
      refs.length > 10 ||
      refs.some(
        (ref) =>
          !isChannelAttachmentRef(ref) ||
          ref.fileId === undefined ||
          !options.attachments?.has(ref),
      )
    )
      throw new ChannelAttachmentError(
        'Attachment does not belong to this profile or uses an obsolete hash; refresh its owning message',
        'invalid-ref',
      );
  };

  const readRecord = (id: string): ChannelRecord | undefined => {
    if (!isValidChannelId(id)) return undefined;
    const row = database.read((db) =>
      db.prepare('SELECT record_json FROM channel_records WHERE channel_id = ?').get(id),
    ) as { record_json: string } | undefined;
    if (row === undefined) return undefined;
    const record = parseRecord(row.record_json, id);
    return record?.deletedAt === undefined ? record : undefined;
  };

  const publishRecordChanged = (): void => {
    try {
      options.onRecordChanged?.();
    } catch (error) {
      options.warn?.('Channel record notification failed: ' + String(error));
    }
  };

  const writeRecord = (record: ChannelRecord): void => {
    database.transaction(
      (db) => {
        db.prepare(`INSERT INTO channel_records (channel_id, record_json) VALUES (?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET record_json = excluded.record_json`).run(
          record.id,
          JSON.stringify(record),
        );
        if (record.type === 'group')
          db.prepare(`
            INSERT OR IGNORE INTO channel_human_members
              (channel_id, human_id, display_name, visible_from_revision, joined_at)
            VALUES (?, ?, 'Human', 1, ?)
          `).run(record.id, LOCAL_HUMAN_ID, record.createdAt);
      },
      ['channel'],
    );
    publishRecordChanged();
  };

  const admissionStatuses = (sourceEventId: string): ChannelMessage['deliveries'] => {
    const rows = database.read((db) =>
      db
        .prepare(
          'SELECT bot_slug, reason, attempt_state, ignored_at, observed_at FROM inbox_admissions WHERE source_event_id = ? ORDER BY bot_slug',
        )
        .all(sourceEventId),
    ) as unknown as AdmissionRow[];
    return rows.length === 0
      ? undefined
      : rows.map((row) => {
          const groupAdmission = row.reason === 'group-mention' || row.reason === 'group-ordinary';
          return {
            botSlug: row.bot_slug,
            state: (row.attempt_state === 'handled' && row.ignored_at !== null
              ? 'ignored'
              : groupAdmission && row.attempt_state === 'running' && row.observed_at === null
                ? 'pending'
                : groupAdmission && row.attempt_state === 'pending' && row.observed_at !== null
                  ? 'observed'
                  : row.attempt_state) as NonNullable<
              ChannelMessage['deliveries']
            >[number]['state'],
          };
        });
  };

  let reactionTable = false;
  const channelReactions = (
    channelId: string,
    messageId?: string,
  ): Map<string, ChannelReaction[]> => {
    reactionTable ||= database.read(
      (db) =>
        db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'channel_reactions'",
          )
          .get() !== undefined,
    );
    if (!reactionTable) return new Map();
    const rows = database.read((db) =>
      db
        .prepare(
          `SELECT r.message_id, r.emoji, r.actor_kind, r.actor_id,
                  (SELECT MIN(f.reacted_at) FROM channel_reactions f
                    WHERE f.channel_id = r.channel_id AND f.message_id = r.message_id
                      AND f.emoji = r.emoji) AS first_at
             FROM channel_reactions r
            WHERE r.channel_id = ?${messageId === undefined ? '' : ' AND r.message_id = ?'}
            ORDER BY r.message_id, first_at, r.emoji, r.reacted_at, r.actor_kind, r.actor_id`,
        )
        .all(...(messageId === undefined ? [channelId] : [channelId, messageId])),
    ) as unknown as Array<{
      message_id: string;
      emoji: string;
      actor_kind: 'human' | 'bot';
      actor_id: string;
    }>;
    const result = new Map<string, ChannelReaction[]>();
    for (const row of rows) {
      let reactions = result.get(row.message_id);
      if (reactions === undefined) result.set(row.message_id, (reactions = []));
      let reaction = reactions.find((item) => item.emoji === row.emoji);
      if (reaction === undefined) reactions.push((reaction = { emoji: row.emoji, actors: [] }));
      reaction.actors.push({ kind: row.actor_kind, id: row.actor_id });
    }
    return result;
  };

  const humanIdentity = (): LocalHumanIdentity => {
    const row = database.read((db) =>
      db
        .prepare('SELECT default_display_name FROM local_human_names WHERE human_id = ?')
        .get(LOCAL_HUMAN_ID),
    ) as { default_display_name: string | null } | undefined;
    const defaultDisplayName = row?.default_display_name ?? null;
    return {
      humanId: LOCAL_HUMAN_ID,
      defaultDisplayName,
      displayName: defaultDisplayName ?? 'Human',
    };
  };

  const humanMembers = (
    id: string,
  ): Array<{
    human_id: string;
    display_name: string;
    visible_from_revision: number;
    read_revision: number;
  }> =>
    database.read((db) =>
      db
        .prepare(`
        SELECT m.human_id, COALESCE(k.nickname, n.default_display_name, 'Human') AS display_name, m.visible_from_revision,
               COALESCE(r.revision, 0) AS read_revision
          FROM channel_human_members m
          LEFT JOIN local_human_names n ON n.human_id = m.human_id
          LEFT JOIN channel_human_nicknames k ON k.channel_id = m.channel_id AND k.human_id = m.human_id
          LEFT JOIN channel_read_positions r
            ON r.channel_id = m.channel_id AND r.human_id = m.human_id
         WHERE m.channel_id = ? AND m.left_at IS NULL
         ORDER BY m.human_id
      `)
        .all(id),
    ) as Array<{
      human_id: string;
      display_name: string;
      visible_from_revision: number;
      read_revision: number;
    }>;

  const readNickname = (id: string): string | null => {
    const row = database.read((db) =>
      db
        .prepare(
          'SELECT nickname FROM channel_human_nicknames WHERE channel_id = ? AND human_id = ?',
        )
        .get(id, LOCAL_HUMAN_ID),
    ) as { nickname: string } | undefined;
    return row?.nickname ?? null;
  };
  const setReaction = (
    id: string,
    actorKind: 'human' | 'bot',
    actorId: string,
    messageId: string,
    emoji: string,
    active: boolean,
  ): ChannelReaction[] | undefined => {
    if (!isReactionEmoji(emoji)) return undefined;
    const row = database.read((db) =>
      db
        .prepare(`
        SELECT e.payload_json, e.body FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
        WHERE p.channel_id = ? AND p.message_id = ?
      `)
        .get(id, messageId),
    ) as { payload_json: string; body: string } | undefined;
    const message =
      row === undefined ? undefined : parseMessage(row.payload_json, row.body, messageId);
    if (message === undefined || message.author.kind === 'system' || isChannelNotice(message))
      return undefined;
    if (active) {
      const held = database.read((db) =>
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM channel_reactions
                WHERE channel_id = ? AND message_id = ? AND actor_kind = ? AND actor_id = ? AND emoji <> ?`,
          )
          .get(id, messageId, actorKind, actorId, emoji),
      ) as { count: number };
      if (held.count >= MAX_ACTOR_REACTIONS_PER_MESSAGE) throw new ChannelReactionLimitError();
    }
    database.transaction(
      (db) => {
        if (active)
          db.prepare(`
          INSERT INTO channel_reactions (channel_id, message_id, actor_kind, actor_id, emoji, reacted_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT DO NOTHING
        `).run(id, messageId, actorKind, actorId, emoji, now().toISOString());
        else
          db.prepare(`
          DELETE FROM channel_reactions
           WHERE channel_id = ? AND message_id = ? AND actor_kind = ? AND actor_id = ? AND emoji = ?
        `).run(id, messageId, actorKind, actorId, emoji);
      },
      ['channel'],
    );
    const reactions = channelReactions(id, messageId).get(messageId) ?? [];
    try {
      options.onReactionChanged?.(id, messageId, reactions);
    } catch (error) {
      options.warn?.('Reaction notification failed: ' + String(error));
    }
    return reactions;
  };
  const participates = (id: string): boolean => {
    const channel = readRecord(id);
    if (channel === undefined || channel.deletedAt !== undefined) return false;
    return channel.type === 'dm'
      ? !isBotDmChannel(channel)
      : humanMembers(id).some((member) => member.human_id === LOCAL_HUMAN_ID);
  };
  const normalizeHumanName = (name: string | null): string | null => {
    if (
      name !== null &&
      (typeof name !== 'string' || name.length > 128 || /[\u0000-\u001f\u007f]/u.test(name))
    )
      throw new Error('Human name must be a single line of at most 128 characters');
    return name?.trim() || null;
  };

  const humanReceiptsFor = (
    message: ChannelMessage,
    revision: number,
    members: ReturnType<typeof humanMembers>,
  ): ChannelMessage['humanReceipts'] => {
    if (
      message.author.kind === 'human' ||
      message.author.kind === 'system' ||
      isChannelNotice(message)
    )
      return undefined;
    const recipients = members
      .filter((member) => member.visible_from_revision <= revision)
      .map((member) => ({
        humanId: member.human_id,
        displayName: member.display_name,
        state: member.read_revision >= revision ? ('read' as const) : ('unread' as const),
      }));
    return recipients.length === 0 ? undefined : recipients;
  };

  const allMessages = (id: string): ChannelMessage[] => {
    if (!isValidChannelId(id)) return [];
    const rows = database.read((db) =>
      db
        .prepare(`
      SELECT p.revision, p.source_event_id, p.message_id, e.payload_json, e.body, e.created_at,
             e.channel_id AS home_channel_id
        FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
       WHERE p.channel_id = ? ORDER BY p.revision
    `)
        .all(id),
    ) as unknown as PlacementRow[];
    const members = humanMembers(id);
    const reactionsById = channelReactions(id);
    return rows.flatMap((row) => {
      const original: ChannelMessage = parseMessage(row.payload_json, row.body, row.message_id) ?? {
        id: row.message_id,
        at: row.created_at,
        author: { kind: 'system' },
        body: 'This message was written by a newer version and cannot be shown.',
      };
      const message = attachmentMigration.project(row.source_event_id, original);
      const deliveries = admissionStatuses(row.source_event_id);
      const humanReceipts = humanReceiptsFor(message, row.revision, members);
      const reactions = reactionsById.get(row.message_id);
      return [
        {
          ...message,
          ...noticeOrigin(message, row, id),
          channelRevision: row.revision,
          ...(deliveries === undefined ? {} : { deliveries }),
          ...(humanReceipts === undefined ? {} : { humanReceipts }),
          ...(reactions === undefined ? {} : { reactions }),
        },
      ];
    });
  };

  const projectPostPreview = (message: ChannelMessage): ChannelMessage => {
    const post = message.botChannelPost;
    if (post === undefined) return message;
    const target = database.read((db) =>
      db
        .prepare(`
          SELECT e.body FROM channel_placements p
          JOIN source_events e ON e.source_event_id = p.source_event_id
          WHERE p.channel_id = ? AND p.message_id = ?
        `)
        .get(post.channelId, post.messageId),
    ) as { body: string } | undefined;
    if (target === undefined) return { ...message, botChannelPostPreview: null };
    const characters = Array.from(target.body.replace(/\s+/gu, ' ').trim());
    return {
      ...message,
      botChannelPostPreview:
        characters.length > POST_PREVIEW_CHARACTERS
          ? characters.slice(0, POST_PREVIEW_CHARACTERS).join('') + '...'
          : characters.join(''),
    };
  };

  const project = (messages: ChannelMessage[], message: ChannelMessage): ChannelMessage =>
    projectAttachmentFiles(
      replyProjection(
        {
          ...projectPostPreview(message),
          ...(message.grantRequest
            ? { grantRequestResolved: isGrantRequestResolved(messages, message.id) }
            : {}),
        },
        new Map(messages.map((item) => [item.id, item])),
      ),
      options.attachments,
    );

  const revisionOf = (id: string): number => {
    if (!isValidChannelId(id)) return 0;
    const row = database.read((db) =>
      db
        .prepare(
          'SELECT COALESCE(MAX(revision), 0) AS revision FROM channel_placements WHERE channel_id = ?',
        )
        .get(id),
    ) as { revision: number };
    return row.revision;
  };

  const append = (
    id: string,
    message: ChannelMessage,
    once: boolean,
    preview?: AllBotPreview,
    origin?: ChannelMessageOrigin,
    canCommit?: () => boolean,
  ) => {
    const channel = readRecord(id);
    if (channel === undefined) return once ? { status: 'missing' as const } : undefined;
    const previous = allMessages(id);
    const existing = previous.find((item) => item.id === message.id);
    if (existing !== undefined) {
      if (!once || !sameIntent(existing, message)) return { status: 'conflict' as const };
      return { status: 'existing' as const, message: project(previous, existing) };
    }
    if (preview !== undefined) {
      if (message.author.kind !== 'human') throw new Error('All Bots requires a Human sender');
      assertAllBotPreview(
        allBotPreview(channel, isBotActive, options.botDisplayName ?? (() => undefined)),
        preview,
      );
    }
    if (message.replyTo !== undefined && !previous.some((item) => item.id === message.replyTo))
      throw new ChannelReplyTargetError();
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
    const botDm = isBotDmChannel(channel) && senderSlug !== undefined;
    if (
      isBotDmChannel(channel) &&
      (senderSlug === undefined || !channel.members.includes(senderSlug))
    )
      throw new Error('Only a Bot DM participant may author this Channel');
    if (botDm && message.botCausation === undefined)
      throw new Error('Bot DM send requires trusted causation');
    const senderDm =
      botDm && senderSlug !== undefined ? readRecord(dmChannelId(senderSlug)) : undefined;
    if (botDm && (senderDm?.type !== 'dm' || senderDm.botSlug !== senderSlug))
      throw new Error('Sender Human DM is unavailable for the Bot action notice');
    const cause =
      botDm && senderSlug !== undefined && message.botCausation !== undefined
        ? causeChannel(message.botCausation.parentSourceEventId, senderSlug, id)
        : undefined;
    const noticeChannel = !botDm || cause === 'target' ? undefined : (cause ?? senderDm);
    const recipient = botDm ? channel.members.find((slug) => slug !== senderSlug) : undefined;
    if (botDm && recipient === undefined) throw new Error('Bot DM has no recipient');
    const durable = rawMessage(message);
    const revision = previous.length + 1;
    const sourceEventId = randomUUID();
    const action: ChannelMessage | undefined =
      noticeChannel !== undefined && recipient !== undefined && senderSlug !== undefined
        ? {
            id: `bot-dm-action-${durable.id}`,
            at: durable.at,
            author: { kind: 'bot', slug: senderSlug },
            body: '',
            botDmAction: { channelId: id, messageId: durable.id, recipientBotSlug: recipient },
          }
        : undefined;
    const actionRevision =
      noticeChannel === undefined ? undefined : allMessages(noticeChannel.id).length + 1;
    const humanDm = senderSlug === undefined ? undefined : readRecord(dmChannelId(senderSlug));
    const traceChannel =
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
    const traceRevision =
      traceChannel === undefined ? undefined : allMessages(traceChannel.id).length + 1;
    let refused = false;
    try {
      database.transaction(
        (db) => {
          if (canCommit?.() === false) {
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
          db.prepare(`
        INSERT INTO source_events (
          source_event_id, source_kind, bot_slug, channel_id, message_id,
          body, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
          );
          db.prepare(`
        INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
        VALUES (?, ?, ?, ?)
      `).run(id, revision, sourceEventId, durable.id);
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
          const botAlreadyAdmitted = (
            targetSlug: string,
            rootId: string,
            fromBotSlug?: string,
          ): boolean =>
            db
              .prepare(`
              SELECT 1 FROM inbox_admissions a
              JOIN source_events e ON e.source_event_id = a.source_event_id
              WHERE a.bot_slug = ? AND e.source_kind = 'bot-message'
                AND json_extract(e.payload_json, '$.botCausation.rootSourceEventId') = ?
                AND (? IS NULL OR (e.bot_slug = ? AND a.reason != 'group-ordinary'))
              LIMIT 1
            `)
              .get(targetSlug, rootId, fromBotSlug ?? null, fromBotSlug ?? null) !== undefined;
          const candidateRecipients =
            durable.privateInputResolution !== undefined
              ? []
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
                    durable.botCausation.hop <= MAX_BOT_HOPS
                  ? [...new Set(mentions.map((item) => item.botSlug))]
                      .filter(
                        (targetSlug) =>
                          targetSlug !== senderSlug &&
                          !botAlreadyAdmitted(
                            targetSlug,
                            durable.botCausation!.rootSourceEventId,
                            senderSlug,
                          ),
                      )
                      .map((botSlug) => ({ botSlug, reason: 'group-mention' }))
                  : botDm &&
                      recipient !== undefined &&
                      durable.botCausation !== undefined &&
                      durable.botCausation.hop <= MAX_BOT_HOPS &&
                      !botAlreadyAdmitted(recipient, durable.botCausation.rootSourceEventId)
                    ? [{ botSlug: recipient, reason: 'bot-dm' }]
                    : [];
          const recipients = candidateRecipients.filter((item) => isBotActive(item.botSlug));
          const immediate = new Set(recipients.map((item) => item.botSlug));
          const ordinaryAllowed =
            durable.author.kind === 'human' ||
            (senderSlug !== undefined &&
              durable.botCausation !== undefined &&
              durable.botCausation.hop <= MAX_BOT_HOPS);
          const ordinary =
            channel.type === 'group' && ordinaryAllowed
              ? channel.members.flatMap((botSlug) => {
                  if (botSlug === senderSlug || immediate.has(botSlug) || !isBotActive(botSlug))
                    return [];
                  const sourceRule = sourcePolicy.resolveIn(db, botSlug, 'group-ordinary');
                  const policy =
                    channel.wakePolicies?.[botSlug] ?? defaultGroupWakePolicy(sourceRule);
                  if (
                    durable.author.kind === 'bot' &&
                    durable.botCausation !== undefined &&
                    botAlreadyAdmitted(botSlug, durable.botCausation.rootSourceEventId)
                  )
                    return [];
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
            db.prepare(`
        INSERT INTO inbox_admissions (
          source_event_id, bot_slug, reason, wake_count, wake_interval_ms,
          wake_policy_revision, wake_mode, source_policy_revision, source_policy_wake_mode
        ) VALUES (?, ?, 'group-ordinary', ?, ?, ?, ?, ?, ?)
      `).run(
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
            db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
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
            db.prepare(`
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `).run(noticeChannel.id, actionRevision, actionSourceEventId, action.id);
            db.prepare(`
            INSERT INTO inbox_admissions
              (source_event_id, bot_slug, reason, attempt_state, handled_at)
            VALUES (?, ?, 'bot-action', 'handled', ?)
          `).run(actionSourceEventId, senderSlug, action.at);
          }
          if (
            trace !== undefined &&
            traceChannel !== undefined &&
            traceRevision !== undefined &&
            senderSlug !== undefined
          ) {
            const traceSourceEventId = randomUUID();
            db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'self-record', ?, ?, ?, '', ?, ?)
          `).run(
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
            db.prepare(`
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `).run(traceChannel.id, traceRevision, traceSourceEventId, trace.id);
          }
        },
        ['source-event', 'channel', 'bot-inbox'],
      );
    } catch (error) {
      if (
        error instanceof OperationalDatabaseError &&
        error.code === 'transaction-failed' &&
        (error.cause instanceof ChannelReplyTargetError ||
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

  if (
    options.databaseOwnerReady !== false &&
    database.read((db) => db.prepare('SELECT channel_id FROM channel_records LIMIT 1').get()) ===
      undefined &&
    existsSync(rootDir)
  ) {
    const legacy: Array<{
      record: ChannelRecord;
      messages: ChannelMessage[];
      readPosition?: {
        messageId: string;
        revision: number;
        readAt: string;
      };
    }> = [];
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isValidChannelId(entry.name)) continue;
      const directory = join(rootDir, entry.name);
      let record: ChannelRecord | undefined;
      try {
        record = parseRecord(readFileSync(join(directory, 'channel.json'), 'utf8'), entry.name);
      } catch {
        continue;
      }
      if (record === undefined) continue;
      let messages: ChannelMessage[] = [];
      try {
        messages = readFileSync(join(directory, 'messages.ndjson'), 'utf8')
          .split('\n')
          .flatMap((line) => {
            const parsed = parseMessage(line);
            return parsed === undefined ? [] : [parsed];
          });
      } catch {}
      let readPosition: { messageId: string; revision: number; readAt: string } | undefined;
      try {
        const parsed: unknown = JSON.parse(
          readFileSync(join(directory, 'read-position.json'), 'utf8'),
        );
        if (typeof parsed === 'object' && parsed !== null) {
          const value = parsed as Record<string, unknown>;
          if (
            typeof value['messageId'] === 'string' &&
            typeof value['revision'] === 'number' &&
            typeof value['readAt'] === 'string' &&
            messages[value['revision'] - 1]?.id === value['messageId']
          ) {
            readPosition = {
              messageId: value['messageId'],
              revision: value['revision'],
              readAt: value['readAt'],
            };
          }
        }
      } catch {}
      legacy.push({ record, messages, ...(readPosition === undefined ? {} : { readPosition }) });
    }
    database.transaction(
      (db) => {
        for (const { record, messages, readPosition } of legacy) {
          db.prepare('INSERT INTO channel_records (channel_id, record_json) VALUES (?, ?)').run(
            record.id,
            JSON.stringify(record),
          );
          if (record.type === 'group')
            db.prepare(`
              INSERT OR IGNORE INTO channel_human_members
                (channel_id, human_id, display_name, visible_from_revision, joined_at)
              VALUES (?, ?, 'Human', 1, ?)
            `).run(record.id, LOCAL_HUMAN_ID, record.createdAt);
          for (const [index, message] of messages.entries()) {
            const existing = db
              .prepare(
                'SELECT source_event_id FROM source_events WHERE channel_id = ? AND message_id = ?',
              )
              .get(record.id, message.id) as { source_event_id: string } | undefined;
            const sourceEventId = existing?.source_event_id ?? randomUUID();
            if (existing === undefined)
              db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, attempt_state, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'handled', ?)
          `).run(
                sourceEventId,
                sourceKind(message),
                message.author.kind === 'bot'
                  ? message.author.slug
                  : record.type === 'dm' && message.author.kind === 'human'
                    ? (record.botSlug ?? null)
                    : null,
                record.id,
                message.id,
                message.body,
                message.at,
                eventPayload(message),
              );
            else
              db.prepare('UPDATE source_events SET payload_json = ? WHERE source_event_id = ?').run(
                eventPayload(message),
                sourceEventId,
              );
            if (
              record.type === 'dm' &&
              message.author.kind === 'human' &&
              record.botSlug !== undefined
            ) {
              const rule = sourcePolicy.resolveIn(db, record.botSlug, 'human-dm');
              db.prepare(`
              INSERT OR IGNORE INTO inbox_admissions (
                source_event_id, bot_slug, reason, attempt_state, handled_at,
                source_policy_revision, source_policy_wake_mode
              )
              SELECT source_event_id, ?, 'human-dm', attempt_state, handled_at, ?, ?
                FROM source_events WHERE source_event_id = ?
            `).run(record.botSlug, rule.revision, rule.wake, sourceEventId);
            }
            db.prepare(`
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `).run(record.id, index + 1, sourceEventId, message.id);
          }
          if (readPosition !== undefined)
            db.prepare(`
          INSERT INTO channel_read_positions (channel_id, human_id, message_id, revision, read_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
              record.id,
              LOCAL_HUMAN_ID,
              readPosition.messageId,
              readPosition.revision,
              readPosition.readAt,
            );
        }
      },
      ['channel', 'source-event'],
    );
  }

  if (options.databaseOwnerReady !== false)
    database.transaction(
      (db) => {
        const decisions = db
          .prepare(`
          SELECT json_extract(invitation.value, '$.id') AS id,
                 COALESCE(json_extract(invitation.value, '$.respondedAt'),
                          json_extract(invitation.value, '$.createdAt')) AS responded_at
            FROM channel_records c, json_each(c.record_json, '$.invitations') invitation
            JOIN source_events e ON e.message_id = json_extract(invitation.value, '$.id')
            JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
           WHERE json_extract(invitation.value, '$.status') IN ('accepted', 'declined')
             AND a.reason = 'group-invite' AND a.attempt_state <> 'handled'
        `)
          .all() as Array<{ id: string; responded_at: string }>;
        for (const decision of decisions) settleInvitation(db, decision.id, decision.responded_at);
      },
      ['bot-inbox'],
    );

  return {
    humanIdentity,
    setHumanDefaultName(displayName) {
      const normalized = normalizeHumanName(displayName);
      database.transaction(
        (db) =>
          db
            .prepare(
              'INSERT INTO local_human_names (human_id, default_display_name) VALUES (?, ?) ON CONFLICT(human_id) DO UPDATE SET default_display_name = excluded.default_display_name',
            )
            .run(LOCAL_HUMAN_ID, normalized),
        ['human-identity'],
      );
      options.onRecordChanged?.();
      return humanIdentity();
    },
    humanNickname(id) {
      return participates(id) ? readNickname(id) : undefined;
    },
    setHumanNickname(id, nickname) {
      if (!participates(id)) throw new Error('The local Human must participate in this Channel');
      const normalized = normalizeHumanName(nickname);
      database.transaction(
        (db) => {
          if (normalized === null)
            db.prepare(
              'DELETE FROM channel_human_nicknames WHERE channel_id = ? AND human_id = ?',
            ).run(id, LOCAL_HUMAN_ID);
          else
            db.prepare(
              'INSERT INTO channel_human_nicknames (channel_id, human_id, nickname) VALUES (?, ?, ?) ON CONFLICT(channel_id, human_id) DO UPDATE SET nickname = excluded.nickname',
            ).run(id, LOCAL_HUMAN_ID, normalized);
        },
        ['human-identity'],
      );
      options.onRecordChanged?.();
    },
    listHumanMembers(id) {
      const channel = readRecord(id);
      if (channel?.type === 'dm' && !isBotDmChannel(channel)) {
        const identity = humanIdentity();
        return [
          { humanId: identity.humanId, displayName: readNickname(id) ?? identity.displayName },
        ];
      }
      return humanMembers(id).map((member) => ({
        humanId: member.human_id,
        displayName: member.display_name,
      }));
    },
    rootDir,
    get: readRecord,
    list() {
      const rows = database.read((db) =>
        db.prepare('SELECT channel_id, record_json FROM channel_records').all(),
      ) as unknown as Array<{ channel_id: string; record_json: string }>;
      return rows
        .flatMap((row) => {
          const record = parseRecord(row.record_json, row.channel_id);
          return record === undefined || record.deletedAt !== undefined ? [] : [record];
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    },
    getOrCreateDm(botSlug, botName) {
      if (!isValidSlug(botSlug)) return undefined;
      const id = dmChannelId(botSlug);
      const existing = readRecord(id);
      if (existing !== undefined) return existing;
      const displayName = botName ?? options.botDisplayName?.(botSlug);
      if (displayName === undefined) return undefined;
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'dm',
        name: displayName.trim() || botSlug,
        members: [botSlug],
        botSlug,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      writeRecord(record);
      return record;
    },
    getOrCreateBotDm(firstBotSlug, secondBotSlug, name) {
      if (
        !isValidSlug(firstBotSlug) ||
        !isValidSlug(secondBotSlug) ||
        firstBotSlug === secondBotSlug
      )
        return undefined;
      const id = botDmChannelId(firstBotSlug, secondBotSlug);
      const members = [firstBotSlug, secondBotSlug].sort();
      const existing = readRecord(id);
      if (existing !== undefined) {
        if (
          existing.type !== 'dm' ||
          existing.botSlug !== undefined ||
          JSON.stringify(existing.members) !== JSON.stringify(members)
        )
          throw new Error(`Bot DM identity collision: ${id}`);
        return existing;
      }
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'dm',
        name: name.trim() || members.join(' · '),
        members,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      writeRecord(record);
      return record;
    },
    createGroup(input) {
      const base = groupChannelIdBase(input.name);
      let id = base;
      for (
        let suffix = 2;
        database.read((db) =>
          db.prepare('SELECT 1 FROM channel_records WHERE channel_id = ?').get(id),
        ) !== undefined;
        suffix++
      )
        id = `${base}-${suffix}`;
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'group',
        name: input.name.trim() || id,
        members: [...input.members],
        ...(input.ownerBotSlug === undefined ? {} : { ownerBotSlug: input.ownerBotSlug }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      writeRecord(record);
      return record;
    },
    inviteGroupBot(input) {
      const channel = readRecord(input.channelId);
      const targetDm = readRecord(input.targetDmChannelId);
      const invitedByHuman = input.inviterHuman === true && input.inviterBotSlug === undefined;
      const invitedByOwner =
        input.inviterHuman === undefined &&
        input.inviterBotSlug !== undefined &&
        channel?.ownerBotSlug === input.inviterBotSlug &&
        channel.members.includes(input.inviterBotSlug);
      if (channel?.type !== 'group' || (!invitedByHuman && !invitedByOwner))
        throw new Error('Only the Human or Bot Group owner may invite');
      if (
        !isValidSlug(input.targetBotSlug) ||
        input.targetBotSlug === input.inviterBotSlug ||
        !isBotActive(input.targetBotSlug) ||
        targetDm?.type !== 'dm' ||
        targetDm.botSlug !== input.targetBotSlug
      )
        throw new Error('Group invite target is unavailable or already a member');
      const existing = channel.invitations?.findLast(
        (item) =>
          item.targetBotSlug === input.targetBotSlug &&
          item.targetBotCreatedAt === input.targetBotCreatedAt &&
          (item.status === 'pending' ||
            (item.status === 'accepted' && channel.members.includes(input.targetBotSlug))),
      );
      if (existing !== undefined) return existing;
      if (channel.members.includes(input.targetBotSlug))
        throw new Error('Invitee is already a Group member');
      const autoAccept = options.autoAcceptGroupInvitations?.() === true;
      const timestamp = now().toISOString();
      const invitation: GroupInvitation = {
        id: 'group-invite-' + randomUUID(),
        targetBotSlug: input.targetBotSlug,
        targetBotCreatedAt: input.targetBotCreatedAt,
        ...(invitedByHuman
          ? { inviterHuman: true as const }
          : { inviterBotSlug: input.inviterBotSlug! }),
        status: autoAccept ? 'accepted' : 'pending',
        createdAt: timestamp,
        ...(autoAccept ? { respondedAt: timestamp, respondedBy: 'profile-policy' as const } : {}),
      };
      const next = {
        ...channel,
        invitations: [...(channel.invitations ?? []), invitation],
        members: autoAccept ? [...channel.members, input.targetBotSlug] : channel.members,
        updatedAt: timestamp,
      };
      const body =
        (invitedByHuman ? 'Human' : 'PersonaBot ' + input.inviterBotSlug) +
        ' invites you to Group Channel ' +
        channel.name +
        ' (' +
        channel.id +
        '). Invitation ID: ' +
        invitation.id +
        (autoAccept
          ? ". Accepted by the Human's Group invitation policy without waking the Bot."
          : '. Call group_invite_respond with this ID and accept true or false. ' +
            'You cannot read or send in the Group until you accept.');
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(next),
            channel.id,
          );
          const sourceEventId = randomUUID();
          db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'system-message', ?, ?, ?, ?, ?, ?)
          `).run(
            sourceEventId,
            input.targetBotSlug,
            targetDm.id,
            invitation.id,
            body,
            timestamp,
            JSON.stringify({
              groupInvitation: { channelId: channel.id, invitationId: invitation.id },
              ...(input.botCausation === undefined ? {} : { botCausation: input.botCausation }),
            }),
          );
          insertSourceAdmission(db, sourceEventId, input.targetBotSlug, 'group-invite');
          if (autoAccept) settleInvitation(db, invitation.id, timestamp);
        },
        ['channel', 'source-event', 'bot-inbox'],
      );
      publishRecordChanged();
      return invitation;
    },
    respondToGroupInvite(input) {
      const channel = this.list().find(
        (candidate) =>
          candidate.type === 'group' &&
          candidate.invitations?.some((item) => item.id === input.invitationId),
      );
      const invitation = channel?.invitations?.find((item) => item.id === input.invitationId);
      if (
        channel?.type !== 'group' ||
        invitation === undefined ||
        invitation.targetBotSlug !== input.targetBotSlug ||
        invitation.targetBotCreatedAt !== input.targetBotCreatedAt
      )
        throw new Error('Group invitation is unavailable to this PersonaBot');
      const expectedStatus = input.accept ? 'accepted' : 'declined';
      if (invitation.status === expectedStatus) {
        if (!input.accept || channel.members.includes(input.targetBotSlug))
          return { channel, invitation };
      }
      if (
        invitation.status !== 'pending' ||
        (invitation.inviterHuman !== true &&
          (channel.ownerBotSlug !== invitation.inviterBotSlug ||
            !channel.members.includes(invitation.inviterBotSlug!))) ||
        channel.members.includes(input.targetBotSlug)
      )
        throw new Error('Group invitation is no longer pending');
      const decided: GroupInvitation = {
        ...invitation,
        status: expectedStatus,
        respondedAt: now().toISOString(),
        respondedBy: 'bot',
      };
      const updated: ChannelRecord = {
        ...channel,
        members: input.accept ? [...channel.members, input.targetBotSlug] : channel.members,
        invitations: (channel.invitations ?? []).map((item) =>
          item.id === input.invitationId ? decided : item,
        ),
        updatedAt: decided.respondedAt!,
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            updated.id,
          );
          settleInvitation(db, invitation.id, decided.respondedAt!);
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
      return { channel: updated, invitation: decided };
    },
    requestGroupJoin(input) {
      const channel = readRecord(input.channelId);
      const ownerDm =
        input.ownerDmChannelId === undefined ? undefined : readRecord(input.ownerDmChannelId);
      if (
        channel?.type !== 'group' ||
        channel.members.includes(input.requesterBotSlug) ||
        (input.ownerDmChannelId !== undefined &&
          (ownerDm?.type !== 'dm' || ownerDm.botSlug !== channel.ownerBotSlug))
      )
        throw new Error('Group join target is unavailable or requester is already a member');
      const pending = channel.joinRequests?.find(
        (item) =>
          item.requesterBotSlug === input.requesterBotSlug &&
          item.requesterBotCreatedAt === input.requesterBotCreatedAt &&
          item.status === 'pending',
      );
      if (pending !== undefined) return pending;
      const timestamp = now().toISOString();
      const request: GroupJoinRequest = {
        id: 'group-join-' + randomUUID(),
        requesterBotSlug: input.requesterBotSlug,
        requesterBotCreatedAt: input.requesterBotCreatedAt,
        status: 'pending',
        createdAt: timestamp,
      };
      const updated: ChannelRecord = {
        ...channel,
        joinRequests: [...(channel.joinRequests ?? []), request],
        updatedAt: timestamp,
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channel.id,
          );
          if (ownerDm !== undefined && channel.ownerBotSlug !== undefined) {
            const body =
              'PersonaBot ' +
              input.requesterBotSlug +
              ' requests to join your Group Channel ' +
              channel.name +
              ' (' +
              channel.id +
              '). Request ID: ' +
              request.id +
              '. Use group_join_decide with the request ID and accept true or false.';
            const sourceEventId = randomUUID();
            db.prepare(`
              INSERT INTO source_events (
                source_event_id, source_kind, bot_slug, channel_id, message_id,
                body, created_at, payload_json
              ) VALUES (?, 'system-message', ?, ?, ?, ?, ?, ?)
            `).run(
              sourceEventId,
              channel.ownerBotSlug,
              ownerDm.id,
              request.id,
              body,
              timestamp,
              JSON.stringify({
                groupJoinRequest: { channelId: channel.id, requestId: request.id },
                ...(input.botCausation === undefined ? {} : { botCausation: input.botCausation }),
              }),
            );
            insertSourceAdmission(db, sourceEventId, channel.ownerBotSlug, 'group-join-request');
          }
        },
        ['channel', 'source-event', 'bot-inbox'],
      );
      publishRecordChanged();
      return request;
    },
    decideGroupJoin(input) {
      const channel = readRecord(input.channelId);
      const request = channel?.joinRequests?.find((item) => item.id === input.requestId);
      const dm = readRecord(input.requesterDmChannelId);
      if (
        channel?.type !== 'group' ||
        request === undefined ||
        request.requesterBotCreatedAt !== input.requesterBotCreatedAt ||
        dm?.type !== 'dm' ||
        dm.botSlug !== request.requesterBotSlug ||
        (input.decidedBy !== 'human' &&
          (channel.ownerBotSlug !== input.decidedBy || !channel.members.includes(input.decidedBy)))
      )
        throw new Error('Group join request is unavailable to this actor');
      const status = input.accept ? 'accepted' : 'declined';
      if (request.status === status) return { channel, request, notified: false };
      if (request.status !== 'pending' || channel.members.includes(request.requesterBotSlug))
        throw new Error('Group join request is no longer pending');
      const timestamp = now().toISOString();
      const decided: GroupJoinRequest = {
        ...request,
        status,
        decidedAt: timestamp,
        decidedBy: input.decidedBy,
      };
      const updated: ChannelRecord = {
        ...channel,
        members: input.accept ? [...channel.members, request.requesterBotSlug] : channel.members,
        joinRequests: (channel.joinRequests ?? []).map((item) =>
          item.id === request.id ? decided : item,
        ),
        updatedAt: timestamp,
      };
      const body =
        'Your request to join Group Channel ' +
        channel.name +
        ' (' +
        channel.id +
        ') was ' +
        status +
        '. ' +
        (input.accept
          ? 'You may now use channel_read and channel_send there.'
          : 'You are not a member of that Group.');
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channel.id,
          );
          const sourceEventId = randomUUID();
          db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'system-message', ?, ?, ?, ?, ?, ?)
          `).run(
            sourceEventId,
            request.requesterBotSlug,
            dm.id,
            'group-join-decision-' + request.id,
            body,
            timestamp,
            JSON.stringify({
              groupJoinDecision: { channelId: channel.id, requestId: request.id, status },
              ...(input.botCausation === undefined ? {} : { botCausation: input.botCausation }),
            }),
          );
          insertSourceAdmission(db, sourceEventId, request.requesterBotSlug, 'group-join-decision');
          db.prepare(`
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?
             WHERE reason = 'group-join-request'
               AND source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND attempt_state IN ('pending', 'retryable')
          `).run(timestamp, request.id);
        },
        ['channel', 'source-event', 'bot-inbox'],
      );
      publishRecordChanged();
      return { channel: updated, request: decided, notified: true };
    },
    cancelGroupInvite(channelId, invitationId) {
      const channel = readRecord(channelId);
      const invitation = channel?.invitations?.find((item) => item.id === invitationId);
      if (channel?.type !== 'group' || invitation === undefined || invitation.status !== 'pending')
        throw new Error('Pending Group invitation not found');
      const updated: ChannelRecord = {
        ...channel,
        invitations: (channel.invitations ?? []).map((item) =>
          item.id === invitationId
            ? { ...item, status: 'cancelled', respondedAt: now().toISOString() }
            : item,
        ),
        updatedAt: now().toISOString(),
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channelId,
          );
          db.prepare(`
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?
             WHERE source_event_id IN (
               SELECT source_event_id FROM source_events WHERE message_id = ?
             ) AND reason = 'group-invite' AND attempt_state IN ('pending', 'retryable')
          `).run(now().toISOString(), invitationId);
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
      return updated;
    },
    cancelInvitationsForBot(botSlug) {
      for (const channel of this.list()) {
        if (channel.type !== 'group') continue;
        for (const invitation of channel.invitations ?? []) {
          if (invitation.targetBotSlug === botSlug && invitation.status === 'pending')
            this.cancelGroupInvite(channel.id, invitation.id);
        }
        const current = readRecord(channel.id);
        const pending = (current?.joinRequests ?? []).filter(
          (request) => request.requesterBotSlug === botSlug && request.status === 'pending',
        );
        if (pending.length > 0 && current?.type === 'group') {
          const timestamp = now().toISOString();
          const updated: ChannelRecord = {
            ...current,
            joinRequests: (current.joinRequests ?? []).map((request) =>
              pending.some((item) => item.id === request.id)
                ? { ...request, status: 'cancelled', decidedAt: timestamp }
                : request,
            ),
            updatedAt: timestamp,
          };
          database.transaction(
            (db) => {
              db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
                JSON.stringify(updated),
                channel.id,
              );
              for (const request of pending)
                db.prepare(`
                UPDATE inbox_admissions SET attempt_state = 'handled', handled_at = ?
                 WHERE reason = 'group-join-request' AND attempt_state IN ('pending', 'retryable')
                   AND source_event_id IN (
                     SELECT source_event_id FROM source_events WHERE message_id = ?
                   )
              `).run(timestamp, request.id);
            },
            ['channel', 'bot-inbox'],
          );
          publishRecordChanged();
        }
      }
      database.transaction(
        (db) =>
          db
            .prepare(`
          UPDATE inbox_admissions
             SET attempt_state = 'handled', handled_at = ?
           WHERE bot_slug = ? AND reason = 'group-join-decision'
             AND attempt_state IN ('pending', 'retryable')
        `)
            .run(now().toISOString(), botSlug),
        ['bot-inbox'],
      );
    },
    getGroupWakePolicy(channelId, botSlug): GroupWakePolicyView {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group' || !channel.members.includes(botSlug))
        throw new Error('Group member not found');
      const policy =
        channel.wakePolicies?.[botSlug] ??
        database.transaction((db) =>
          defaultGroupWakePolicy(sourcePolicy.resolveIn(db, botSlug, 'group-ordinary')),
        );
      const audit = database.read((db) =>
        db
          .prepare(`
            SELECT actor_kind, actor_bot_slug, changed_at
              FROM group_wake_policy_audit
             WHERE channel_id = ? AND bot_slug = ? AND revision = ?
          `)
          .get(channelId, botSlug, policy.revision),
      ) as
        | { actor_kind: 'human' | 'bot'; actor_bot_slug: string | null; changed_at: string }
        | undefined;
      const lastActor: GroupWakePolicyActor | null =
        audit === undefined
          ? null
          : audit.actor_kind === 'human'
            ? { kind: 'human' }
            : { kind: 'bot', botSlug: audit.actor_bot_slug! };
      return { ...policy, lastActor, changedAt: audit?.changed_at ?? null };
    },
    setGroupWakePolicy(channelId, botSlug, policy, actor = { kind: 'human' }) {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group' || !channel.members.includes(botSlug))
        throw new Error('Group member not found');
      if (actor.kind === 'bot' && actor.botSlug !== botSlug)
        throw new Error('Bot can only change its own Group wake policy');
      if (
        (policy.mode !== 'all' &&
          policy.mode !== 'mentions' &&
          policy.mode !== 'digest' &&
          policy.mode !== 'silent') ||
        !Number.isSafeInteger(policy.count) ||
        policy.count < 1 ||
        policy.count > 100 ||
        !Number.isSafeInteger(policy.intervalSeconds) ||
        policy.intervalSeconds < 1 ||
        policy.intervalSeconds > 3600
      )
        throw new Error('Invalid Group wake policy');
      const previous = channel.wakePolicies?.[botSlug];
      const effective =
        previous ??
        database.transaction((db) =>
          defaultGroupWakePolicy(sourcePolicy.resolveIn(db, botSlug, 'group-ordinary')),
        );
      if (
        !policy.inherit &&
        effective.mode === policy.mode &&
        effective.count === policy.count &&
        effective.intervalSeconds === policy.intervalSeconds
      )
        return channel;
      const changedAt = now().toISOString();
      const recorded = database.read((db) =>
        db
          .prepare(
            'SELECT MAX(revision) AS revision FROM group_wake_policy_audit WHERE channel_id = ? AND bot_slug = ?',
          )
          .get(channelId, botSlug),
      ) as { revision: number | null };
      const revision = Math.max(effective.revision, recorded.revision ?? 0) + 1;
      const { inherit: _inherit, ...custom } = policy;
      const policies = { ...channel.wakePolicies, [botSlug]: { ...custom, revision } };
      if (policy.inherit) delete policies[botSlug];
      const updated: ChannelRecord = {
        ...channel,
        wakePolicies: policies,
        updatedAt: changedAt,
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channelId,
          );
          db.prepare(`
            INSERT INTO group_wake_policy_audit
              (channel_id, bot_slug, revision, actor_kind, actor_bot_slug, changed_at,
               mode, count, interval_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            channelId,
            botSlug,
            revision,
            actor.kind,
            actor.kind === 'bot' ? actor.botSlug : null,
            changedAt,
            policy.mode,
            policy.count,
            policy.intervalSeconds,
          );
        },
        ['channel'],
      );
      publishRecordChanged();
      return updated;
    },
    removeGroupMember(channelId, botSlug, departureType: 'left' | 'removed' = 'removed') {
      const { updated, departure, sourceEventId, revision } = database.transaction(
        (db) => {
          const recordRow = db
            .prepare('SELECT record_json FROM channel_records WHERE channel_id = ?')
            .get(channelId) as { record_json: string } | undefined;
          const channel =
            recordRow === undefined ? undefined : parseRecord(recordRow.record_json, channelId);
          if (
            channel?.type !== 'group' ||
            channel.deletedAt !== undefined ||
            !channel.members.includes(botSlug)
          )
            throw new Error('Group member not found');
          const timestamp = now().toISOString();
          const updated: ChannelRecord = {
            ...channel,
            members: channel.members.filter((item) => item !== botSlug),
            invitations: (channel.invitations ?? []).map((item) =>
              item.status === 'pending' && item.inviterBotSlug === botSlug
                ? { ...item, status: 'cancelled', respondedAt: timestamp }
                : item,
            ),
            updatedAt: timestamp,
          };
          if (channel.ownerBotSlug === botSlug) delete updated.ownerBotSlug;
          if (updated.wakePolicies !== undefined) {
            updated.wakePolicies = { ...updated.wakePolicies };
            delete updated.wakePolicies[botSlug];
          }
          const cancelled = (channel.invitations ?? []).filter(
            (item) => item.status === 'pending' && item.inviterBotSlug === botSlug,
          );
          const displayName = options.botDisplayName?.(botSlug) ?? botSlug;
          const departure: ChannelMessage = {
            id: 'member-left-' + randomUUID(),
            at: timestamp,
            author: { kind: 'system' },
            body:
              displayName +
              (departureType === 'left' ? ' left the Channel.' : ' was removed from the Channel.'),
            memberDeparture: {
              memberKind: 'bot',
              memberId: botSlug,
              displayName,
              departureType,
            },
            format: 'text',
          };
          const sourceEventId = randomUUID();
          const revisionRow = db
            .prepare(
              'SELECT COALESCE(MAX(revision), 0) AS revision FROM channel_placements WHERE channel_id = ?',
            )
            .get(channelId) as { revision: number };
          const revision = revisionRow.revision + 1;
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channelId,
          );
          db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'system-message', NULL, ?, ?, ?, ?, ?)
          `).run(
            sourceEventId,
            channelId,
            departure.id,
            departure.body,
            timestamp,
            eventPayload(departure),
          );
          db.prepare(`
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `).run(channelId, revision, sourceEventId, departure.id);
          for (const recipientSlug of updated.members) {
            if (!isBotActive(recipientSlug)) continue;
            const sourceRule = sourcePolicy.resolveIn(db, recipientSlug, 'group-ordinary');
            const policy =
              updated.wakePolicies?.[recipientSlug] ?? defaultGroupWakePolicy(sourceRule);
            db.prepare(`
              INSERT INTO inbox_admissions (
                source_event_id, bot_slug, reason, wake_count, wake_interval_ms,
                wake_policy_revision, wake_mode, source_policy_revision,
                source_policy_wake_mode
              ) VALUES (?, ?, 'group-ordinary', ?, ?, ?, ?, ?, ?)
            `).run(
              sourceEventId,
              recipientSlug,
              policy.mode === 'all' ? 1 : policy.mode === 'digest' ? policy.count : null,
              policy.mode === 'all'
                ? 0
                : policy.mode === 'digest'
                  ? policy.intervalSeconds * 1000
                  : null,
              policy.revision,
              policy.mode,
              sourceRule.revision,
              sourceRule.wake,
            );
          }
          for (const invitation of cancelled)
            db.prepare(`
              UPDATE inbox_admissions
                 SET attempt_state = 'handled', handled_at = ?
               WHERE source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND reason = 'group-invite' AND attempt_state IN ('pending', 'retryable')
            `).run(timestamp, invitation.id);
          if (channel.ownerBotSlug === botSlug) {
            for (const request of channel.joinRequests ?? []) {
              if (request.status !== 'pending') continue;
              db.prepare(`
                UPDATE inbox_admissions
                   SET attempt_state = 'handled', handled_at = ?
                 WHERE bot_slug = ? AND reason = 'group-join-request'
                   AND attempt_state IN ('pending', 'retryable')
                   AND source_event_id IN (
                     SELECT source_event_id FROM source_events WHERE message_id = ?
                   )
              `).run(timestamp, botSlug, request.id);
            }
          }
          db.prepare(`
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?,
                   last_error = 'Group membership revoked'
             WHERE bot_slug = ? AND reason IN ('group-ordinary', 'group-mention')
               AND attempt_state IN ('pending', 'retryable')
               AND source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE channel_id = ?
               )
          `).run(timestamp, botSlug, channelId);
          return { updated, departure, sourceEventId, revision };
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
      const deliveries = admissionStatuses(sourceEventId);
      try {
        options.onCommitted?.({
          channelId,
          message: {
            ...departure,
            channelRevision: revision,
            ...(deliveries === undefined ? {} : { deliveries }),
          },
          revision,
        });
      } catch (error) {
        options.warn?.('Channel post-commit notification failed: ' + String(error));
      }
      return updated;
    },
    appendMemoryCommits(input) {
      const cause = causeChannel(input.causeSourceEventId, input.botSlug, '');
      const dm = readRecord(dmChannelId(input.botSlug));
      const channel = (cause === 'target' ? undefined : cause) ?? dm;
      if (channel === undefined) return [];
      const committed: ChannelMessage[] = [];
      for (const commit of input.commits) {
        const recorded = database.read((db) =>
          db
            .prepare(`
              SELECT 1 FROM source_events
               WHERE bot_slug = ? AND json_type(payload_json, '$.memoryCommit') IS NOT NULL
                 AND json_extract(payload_json, '$.memoryCommit.sha') = ?
            `)
            .get(input.botSlug, commit.sha),
        );
        if (recorded !== undefined) continue;
        const message: ChannelMessage = {
          id: `memory-commit-${randomUUID()}`,
          at: now().toISOString(),
          author: { kind: 'system' },
          body: '',
          memoryCommit: { botSlug: input.botSlug, ...commit },
        };
        const revision = allMessages(channel.id).length + 1;
        const humanDm = channel.id === dm?.id ? undefined : dm;
        const humanDmRevision =
          humanDm === undefined ? undefined : allMessages(humanDm.id).length + 1;
        const sourceEventId = randomUUID();
        database.transaction(
          (db) => {
            db.prepare(`
              INSERT INTO source_events (
                source_event_id, source_kind, bot_slug, channel_id, message_id,
                body, created_at, payload_json
              ) VALUES (?, 'self-record', ?, ?, ?, '', ?, ?)
            `).run(
              sourceEventId,
              input.botSlug,
              channel.id,
              message.id,
              message.at,
              JSON.stringify({
                ...JSON.parse(eventPayload(message)),
                causeSourceEventId: input.causeSourceEventId,
              }),
            );
            db.prepare(`
              INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
              VALUES (?, ?, ?, ?)
            `).run(channel.id, revision, sourceEventId, message.id);
            if (humanDm !== undefined && humanDmRevision !== undefined)
              db.prepare(`
                INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
                VALUES (?, ?, ?, ?)
              `).run(humanDm.id, humanDmRevision, sourceEventId, message.id);
            db.prepare(`
              INSERT INTO inbox_admissions
                (source_event_id, bot_slug, reason, attempt_state, handled_at)
              VALUES (?, ?, 'memory-commit', 'handled', ?)
            `).run(sourceEventId, input.botSlug, message.at);
          },
          ['source-event', 'channel', 'bot-inbox'],
        );
        committed.push(message);
        for (const commit of [
          { channelId: channel.id, message, revision },
          ...(humanDm === undefined || humanDmRevision === undefined
            ? []
            : [
                {
                  channelId: humanDm.id,
                  message: { ...message, noticeOrigin: { channelId: channel.id } },
                  revision: humanDmRevision,
                },
              ]),
        ])
          try {
            options.onCommitted?.(commit);
          } catch (error) {
            options.warn?.(`Channel post-commit notification failed: ${String(error)}`);
          }
      }
      return committed;
    },
    appendBotCreateAction(input) {
      const cause = causeChannel(input.causeSourceEventId, input.botSlug, '');
      const channel =
        (cause === 'target' ? undefined : cause) ?? readRecord(dmChannelId(input.botSlug));
      if (channel === undefined) return undefined;
      const message: ChannelMessage = {
        id: `bot-create-action-${randomUUID()}`,
        at: now().toISOString(),
        author: { kind: 'bot', slug: input.botSlug },
        body: '',
        botCreateAction: { botSlug: input.created.botSlug, displayName: input.created.displayName },
      };
      const revision = allMessages(channel.id).length + 1;
      const sourceEventId = randomUUID();
      database.transaction(
        (db) => {
          db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'self-record', ?, ?, ?, '', ?, ?)
          `).run(
            sourceEventId,
            input.botSlug,
            channel.id,
            message.id,
            message.at,
            JSON.stringify({
              ...JSON.parse(eventPayload(message)),
              causeSourceEventId: input.causeSourceEventId,
            }),
          );
          db.prepare(`
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `).run(channel.id, revision, sourceEventId, message.id);
          db.prepare(`
            INSERT INTO inbox_admissions
              (source_event_id, bot_slug, reason, attempt_state, handled_at)
            VALUES (?, ?, 'bot-action', 'handled', ?)
          `).run(sourceEventId, input.botSlug, message.at);
        },
        ['source-event', 'channel', 'bot-inbox'],
      );
      try {
        options.onCommitted?.({ channelId: channel.id, message, revision });
      } catch (error) {
        options.warn?.(`Channel post-commit notification failed: ${String(error)}`);
      }
      return message;
    },
    deleteGroup(channelId) {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group') throw new Error('Group Channel not found');
      const timestamp = now().toISOString();
      const deleted: ChannelRecord = {
        ...channel,
        members: [],
        invitations: (channel.invitations ?? []).map((item) =>
          item.status === 'pending'
            ? { ...item, status: 'cancelled', respondedAt: timestamp }
            : item,
        ),
        joinRequests: (channel.joinRequests ?? []).map((item) =>
          item.status === 'pending'
            ? { ...item, status: 'cancelled', decidedAt: timestamp, decidedBy: 'human' }
            : item,
        ),
        deletedAt: timestamp,
        updatedAt: timestamp,
      };
      delete deleted.ownerBotSlug;
      delete deleted.wakePolicies;
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(deleted),
            channelId,
          );
          db.prepare(`
            UPDATE inbox_admissions SET attempt_state = 'needs-repair',
              last_error = 'channel-ended'
             WHERE source_event_id IN (
               SELECT source_event_id FROM source_events WHERE channel_id = ? AND source_kind != 'bridge-message'
             ) AND attempt_state IN ('pending', 'retryable', 'running') AND NOT EXISTS (
               SELECT 1 FROM channel_placements p JOIN channel_records c ON c.channel_id = p.channel_id
               JOIN json_each(json_extract(c.record_json, '$.members')) m ON m.value = inbox_admissions.bot_slug
               WHERE p.source_event_id = inbox_admissions.source_event_id
                 AND json_extract(c.record_json, '$.deletedAt') IS NULL
             )
          `).run(channelId);
          for (const invitation of channel.invitations ?? [])
            db.prepare(`
              UPDATE inbox_admissions
                 SET attempt_state = 'handled', handled_at = ?
               WHERE source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND reason = 'group-invite'
                 AND attempt_state IN ('pending', 'retryable')
            `).run(timestamp, invitation.id);
          for (const request of channel.joinRequests ?? [])
            db.prepare(`
              UPDATE inbox_admissions
                 SET attempt_state = 'handled', handled_at = ?
               WHERE source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND reason = 'group-join-request'
                 AND attempt_state IN ('pending', 'retryable')
            `).run(timestamp, request.id);
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
    },
    setGroupAvatar(channelId, avatar) {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group') throw new Error('Group Channel not found');
      if (avatar !== null && !isGroupAvatar(avatar)) throw new Error('Invalid Group avatar');
      if (channel.avatar === (avatar ?? undefined)) return channel;
      const updated: ChannelRecord = { ...channel, updatedAt: now().toISOString() };
      if (avatar === null) delete updated.avatar;
      else updated.avatar = avatar;
      writeRecord(updated);
      return updated;
    },
    rename(id, name) {
      const prior = readRecord(id);
      if (prior === undefined || !name.trim()) return undefined;
      const updated = { ...prior, name: name.trim() };
      writeRecord(updated);
      return updated;
    },
    latestHumanMessageId(id) {
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT p.message_id FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
        JOIN channel_records c ON c.channel_id = p.channel_id
        LEFT JOIN channel_human_members h ON h.channel_id = p.channel_id AND h.human_id = ? AND h.left_at IS NULL
        WHERE p.channel_id = ? AND json_extract(c.record_json, '$.deletedAt') IS NULL
          AND ((json_extract(c.record_json, '$.type') = 'dm' AND json_extract(c.record_json, '$.botSlug') IS NOT NULL) OR
          (json_extract(c.record_json, '$.type') = 'group' AND h.human_id IS NOT NULL AND p.revision >= h.visible_from_revision))
        ORDER BY p.revision DESC LIMIT 1
      `)
          .get(LOCAL_HUMAN_ID, id),
      ) as { message_id: string } | undefined;
      return row?.message_id;
    },
    latestMessage(id) {
      const messages = allMessages(id);
      const latest = messages.findLast((message) => !isChannelNotice(message));
      return latest === undefined ? undefined : project(messages, latest);
    },
    hasMessage(id, messageId) {
      return allMessages(id).some((message) => message.id === messageId);
    },
    message(id, messageId) {
      const messages = allMessages(id);
      const found = messages.find((item) => item.id === messageId);
      return found === undefined ? undefined : project(messages, found);
    },
    humanSendStatus(id, messageId) {
      const channel = readRecord(id);
      if (channel?.type !== 'dm' || channel.botSlug === undefined) return undefined;
      const botSlug = channel.botSlug;
      return database.read((db) => {
        const request = db
          .prepare(`
          SELECT e.source_event_id, a.attempt_state
          FROM source_events e
          JOIN inbox_admissions a ON a.source_event_id = e.source_event_id AND a.bot_slug = ?
          WHERE e.channel_id = ? AND e.message_id = ? AND e.source_kind = 'human-message'
        `)
          .get(botSlug, id, messageId) as
          | { source_event_id: string; attempt_state: string }
          | undefined;
        if (!request) return undefined;
        const rows = db
          .prepare(`
          SELECT output.payload_json, output.body, output.message_id
          FROM channel_output_origins origin
          JOIN source_events output ON output.source_event_id = origin.source_event_id
          JOIN session_ownership owner ON owner.session_id = origin.session_id AND owner.bot_slug = output.bot_slug
          WHERE origin.request_source_event_id = ? AND output.channel_id = ?
            AND output.source_kind = 'bot-message' AND output.bot_slug = ?
          ORDER BY output.rowid
        `)
          .all(request.source_event_id, id, botSlug) as Pick<
          PlacementRow,
          'payload_json' | 'body' | 'message_id'
        >[];
        const replies = rows.flatMap((row) => {
          const message = parseMessage(row.payload_json, row.body, row.message_id);
          return message &&
            !isChannelNotice(message) &&
            !message.toolApprovalRequest &&
            !message.userQuestionRequest &&
            !message.sessionFailure &&
            !message.grantRequest
            ? [message]
            : [];
        });
        return { sourceEventId: request.source_event_id, state: request.attempt_state, replies };
      });
    },
    observeOutput(id, messageId) {
      const channel = readRecord(id);
      if (!channel) return undefined;
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT p.rowid AS position, p.revision, p.message_id, e.payload_json, e.body
          FROM channel_placements p
          JOIN source_events e ON e.source_event_id = p.source_event_id
         WHERE p.channel_id = ? AND p.message_id = ?
      `)
          .get(id, messageId),
      ) as
        | (Pick<PlacementRow, 'revision' | 'message_id' | 'payload_json' | 'body'> & {
            position: number;
          })
        | undefined;
      const message = row && parseMessage(row.payload_json, row.body, row.message_id);
      if (!row || !message || message.id !== messageId) return undefined;
      const member = humanMembers(id).find((entry) => entry.human_id === LOCAL_HUMAN_ID);
      return {
        position: row.position,
        channel,
        message: { id: message.id, author: message.author, body: message.body },
        humanParticipant: participates(id),
        canRead:
          channel.type === 'dm' ||
          (member !== undefined && row.revision >= member.visible_from_revision),
      };
    },
    outputCheckpoint() {
      const row = database.read((db) =>
        db
          .prepare('SELECT rowid AS position FROM channel_placements ORDER BY rowid DESC LIMIT 1')
          .get(),
      ) as { position: number } | undefined;
      return row?.position ?? 0;
    },
    assertAttachmentRefs,
    migrateAttachments: (signal) => attachmentMigration.migrate(signal),
    attachmentReference(channelId, messageId, identity) {
      if (readRecord(channelId) === undefined) return undefined;
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT e.source_event_id, e.payload_json, e.body FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
        WHERE p.channel_id = ? AND p.message_id = ?
      `)
          .get(channelId, messageId),
      ) as Pick<PlacementRow, 'source_event_id' | 'payload_json' | 'body'> | undefined;
      if (row === undefined) return undefined;
      const original = parseMessage(row.payload_json, row.body);
      const matches = (original?.attachments ?? []).flatMap((ref, index) => {
        const resolved = attachmentMigration.resolve(row.source_event_id, index, ref);
        return attachmentIdentity(ref) === identity || attachmentIdentity(resolved) === identity
          ? [resolved]
          : [];
      });
      if (new Set(matches.map(attachmentIdentity)).size > 1)
        throw new ChannelAttachmentError(
          'Ambiguous legacy attachment reference; refresh the owning message',
          'invalid-ref',
        );
      return matches[0];
    },
    referencedAttachmentHashes() {
      const hashes = new Set<string>();
      for (const { sourceEventId, message } of retainedAttachments())
        for (const [index, ref] of (message.attachments ?? []).entries())
          hashes.add(attachmentIdentity(attachmentMigration.resolve(sourceEventId, index, ref)));
      for (const id of attachmentMigration.pendingFiles()) hashes.add(id);
      return hashes;
    },
    readPosition(id) {
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT message_id, revision, read_at FROM channel_read_positions WHERE channel_id = ? AND human_id = ?
      `)
          .get(id, LOCAL_HUMAN_ID),
      ) as { message_id: string; revision: number; read_at: string } | undefined;
      return row === undefined
        ? undefined
        : {
            messageId: row.message_id,
            revision: row.revision,
            readAt: row.read_at,
          };
    },
    async markRead(id, messageId) {
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT p.revision, e.payload_json, e.body FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
        WHERE p.channel_id = ? AND p.message_id = ?
      `)
          .get(id, messageId),
      ) as { revision: number; payload_json: string; body: string } | undefined;
      if (row === undefined || parseMessage(row.payload_json, row.body) === undefined)
        return undefined;
      const previous = this.readPosition(id);
      if (previous !== undefined && previous.revision >= row.revision) return previous;
      const position = { messageId, revision: row.revision, readAt: now().toISOString() };
      database.transaction(
        (db) =>
          db
            .prepare(`
        INSERT INTO channel_read_positions (channel_id, human_id, message_id, revision, read_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(channel_id, human_id) DO UPDATE SET
          message_id = excluded.message_id, revision = excluded.revision, read_at = excluded.read_at
      `)
            .run(id, LOCAL_HUMAN_ID, messageId, position.revision, position.readAt),
        ['channel'],
      );
      if (readRecord(id)?.type === 'group') {
        try {
          options.onHumanReadChanged?.(id, LOCAL_HUMAN_ID, position.revision);
        } catch (error) {
          options.warn?.('Human read notification failed: ' + String(error));
        }
      }
      return position;
    },
    setHumanReaction(id, messageId, emoji, active) {
      if (!participates(id)) return undefined;
      return setReaction(id, 'human', LOCAL_HUMAN_ID, messageId, emoji, active);
    },
    setBotReaction(id, botSlug, messageId, emoji, active) {
      const channel = readRecord(id);
      if (channel === undefined || channel.deletedAt !== undefined) return undefined;
      if (!channel.members.includes(botSlug)) return undefined;
      return setReaction(id, 'bot', botSlug, messageId, emoji, active);
    },
    async appendMessage(id, message, origin) {
      const result = append(id, message, false, undefined, origin);
      return result?.status === 'appended' ? result.message : undefined;
    },
    previewAllBotMention(id) {
      const channel = readRecord(id);
      if (channel === undefined) throw new Error('Group Channel not found');
      return allBotPreview(channel, isBotActive, options.botDisplayName ?? (() => undefined));
    },
    async appendMessageOnce(id, message, preview, origin, canCommit) {
      const result = append(id, message, true, preview, origin, canCommit);
      return result ?? { status: 'missing' };
    },
    readMessages(id, readOptions) {
      const messages = allMessages(id);
      const limit = Math.max(
        1,
        Math.min(readOptions?.limit ?? DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE),
      );
      const end =
        readOptions?.before === undefined
          ? messages.length
          : messages.findIndex((message) => message.id === readOptions.before);
      if (end < 0) return [];
      return messages
        .slice(Math.max(0, end - limit), end)
        .reverse()
        .map((message) => project(messages, message));
    },
    queryMessages(id, queryOptions) {
      const query = prepareChannelMessageQuery(id, queryOptions);
      if (!isValidChannelId(id)) return { messages: [] };
      let before: { revision: number; at: string; message_id: string } | undefined;
      if (query.beforeId !== undefined) {
        const beforeId = query.beforeId;
        before = database.read((db) =>
          db
            .prepare(`
              SELECT p.revision, e.created_at AS at, p.message_id
                FROM channel_placements p
                JOIN source_events e ON e.source_event_id = p.source_event_id
               WHERE p.channel_id = ? AND p.message_id = ?
            `)
            .get(id, beforeId),
        ) as typeof before;
        if (before === undefined) throw new Error('channel_read: invalid cursor');
      }
      const where = ['p.channel_id = ?'];
      const values: Array<string | number> = [id];
      if (before !== undefined) {
        if (query.orderBy === 'time') {
          where.push(
            '(julianday(e.created_at) < julianday(?) OR (julianday(e.created_at) = julianday(?) AND p.message_id < ?))',
          );
          values.push(before.at, before.at, before.message_id);
        } else {
          where.push('p.revision < ?');
          values.push(before.revision);
        }
      }
      if (query.orderBy === 'time') where.push('julianday(e.created_at) IS NOT NULL');
      if (query.visibleFrom !== undefined) {
        where.push('p.revision >= ?');
        values.push(query.visibleFrom);
      }
      if (query.text !== undefined && query.text.length > 0) {
        where.push('instr(botharness_unicode_lower(e.body), ?) > 0');
        values.push(query.text);
      }
      if (query.authorBotId !== undefined) {
        where.push("json_extract(e.payload_json, '$.author.kind') = 'bot'");
        where.push("json_extract(e.payload_json, '$.author.slug') = ?");
        values.push(query.authorBotId);
      }
      if (query.authorKind !== undefined) {
        where.push("json_extract(e.payload_json, '$.author.kind') = ?");
        values.push(query.authorKind);
      }
      if (query.from !== undefined) {
        where.push('julianday(e.created_at) >= ?');
        values.push(query.from / 86_400_000 + 2_440_587.5);
      }
      if (query.to !== undefined) {
        where.push('julianday(e.created_at) <= ?');
        values.push(query.to / 86_400_000 + 2_440_587.5);
      }
      const rows = database.read((db) => {
        if (!lowerRegistered) {
          db.function('botharness_unicode_lower', { deterministic: true }, (value: unknown) =>
            typeof value === 'string' ? value.toLowerCase() : '',
          );
          lowerRegistered = true;
        }
        return db
          .prepare(`
          SELECT p.revision, p.source_event_id, p.message_id, e.payload_json, e.body,
                 e.channel_id AS home_channel_id
            FROM channel_placements p
            JOIN source_events e ON e.source_event_id = p.source_event_id
           WHERE ${where.join(' AND ')}
           ORDER BY ${query.orderBy === 'time' ? 'julianday(e.created_at) DESC, p.message_id DESC' : 'p.revision DESC'} LIMIT ?
        `)
          .all(...values, query.limit + 1);
      }) as unknown as PlacementRow[];
      const members = humanMembers(id);
      const reactionsById = channelReactions(id);
      const selected = rows.slice(0, query.limit).flatMap((row) => {
        const original = parseMessage(row.payload_json, row.body, row.message_id);
        if (original === undefined) return [];
        const message = attachmentMigration.project(row.source_event_id, original);
        const deliveries = admissionStatuses(row.source_event_id);
        const humanReceipts = humanReceiptsFor(message, row.revision, members);
        const reactions = reactionsById.get(row.message_id);
        return [
          {
            ...message,
            ...noticeOrigin(message, row, id),
            channelRevision: row.revision,
            ...(deliveries === undefined ? {} : { deliveries }),
            ...(humanReceipts === undefined ? {} : { humanReceipts }),
            ...(reactions === undefined ? {} : { reactions }),
          },
        ];
      });
      const replyIds = [
        ...new Set(
          selected.flatMap((message) => (message.replyTo === undefined ? [] : [message.replyTo])),
        ),
      ];
      const byId = new Map<string, ChannelMessage>();
      if (replyIds.length > 0) {
        const placeholders = replyIds.map(() => '?').join(', ');
        const replies = database.read((db) =>
          db
            .prepare(`
            SELECT p.message_id, e.payload_json, e.body
              FROM channel_placements p
              JOIN source_events e ON e.source_event_id = p.source_event_id
             WHERE p.channel_id = ? AND p.message_id IN (${placeholders})
          `)
            .all(id, ...replyIds),
        ) as unknown as Array<Pick<PlacementRow, 'message_id' | 'payload_json' | 'body'>>;
        for (const row of replies) {
          const message = parseMessage(row.payload_json, row.body, row.message_id);
          if (message !== undefined) byId.set(message.id, message);
        }
      }
      const last = selected.at(-1);
      return {
        messages: selected.map((message) =>
          projectAttachmentFiles(
            replyProjection(projectPostPreview(message), byId),
            options.attachments,
          ),
        ),
        ...(rows.length <= query.limit || last === undefined
          ? {}
          : {
              nextCursor: Buffer.from(
                JSON.stringify({ beforeId: last.id, filter: query.filter }),
              ).toString('base64url'),
            }),
      };
    },
    readTimeline(id, request) {
      const messages = allMessages(id);
      const page = pageChannelTimeline(id, messages, request);
      return page === undefined
        ? undefined
        : {
            ...page,
            entries: page.entries.map((message) => project(messages, message)),
          };
    },
    searchHumanMessages(id, request) {
      const channel = readRecord(id);
      if (channel === undefined) return undefined;
      const member = humanMembers(id).find((entry) => entry.human_id === LOCAL_HUMAN_ID);
      if (channel.type === 'group' && member === undefined) return undefined;
      return this.queryMessages(id, {
        ...request,
        visibleFrom: member?.visible_from_revision ?? 0,
      });
    },
    readHumanTimeline(id, request) {
      const channel = readRecord(id);
      if (channel === undefined) return undefined;
      const member = humanMembers(id).find((entry) => entry.human_id === LOCAL_HUMAN_ID);
      if (channel.type === 'group' && member === undefined) return undefined;
      const messages = allMessages(id).filter(
        (message) => (message.channelRevision ?? 0) >= (member?.visible_from_revision ?? 0),
      );
      const page = pageChannelTimeline(id, messages, request);
      return page === undefined
        ? undefined
        : { ...page, entries: page.entries.map((message) => project(messages, message)) };
    },
    readHumanJournalPage(id, request) {
      const channel = readRecord(id);
      if (channel === undefined) return undefined;
      const member = humanMembers(id).find((entry) => entry.human_id === LOCAL_HUMAN_ID);
      if (channel.type === 'group' && member === undefined) return undefined;
      const messages = allMessages(id);
      const page = pageChannelJournal(id, messages, {
        ...request,
        visibleFrom: member?.visible_from_revision ?? 0,
      });
      return page === undefined
        ? undefined
        : {
            ...page,
            entries: page.entries.map((entry) => ({
              ...entry,
              message: project(messages, entry.message),
            })),
          };
    },
    revision: revisionOf,
    admissionChanged(channelId, messageId) {
      const message = this.message(channelId, messageId);
      if (message !== undefined) options.onAdmissionChanged?.(channelId, messageId, message);
    },
    humanMessageCounts(from, to) {
      const rows = database.read((db) =>
        db
          .prepare(`
        SELECT p.channel_id, CASE WHEN json_extract(e.payload_json, '$.external.localChannelId') IS NOT NULL
                 THEN json_object('kind', 'bridged', 'source', COALESCE(
                   json_extract(e.payload_json, '$.external.event.actor.name'),
                   json_extract(e.payload_json, '$.external.event.actor.id')))
                 ELSE json_extract(e.payload_json, '$.author') END AS author_json,
               COUNT(DISTINCT p.source_event_id) AS count
          FROM channel_placements p
          JOIN source_events e ON e.source_event_id = p.source_event_id
          JOIN channel_records c ON c.channel_id = p.channel_id
          LEFT JOIN channel_human_members m ON m.channel_id = p.channel_id
            AND m.human_id = ? AND m.left_at IS NULL
         WHERE json_extract(c.record_json, '$.deletedAt') IS NULL
           AND ${notChannelNoticeSql('e.payload_json')}
           AND ((json_extract(c.record_json, '$.type') = 'dm'
                 AND json_extract(c.record_json, '$.botSlug') IS NOT NULL)
             OR (json_extract(c.record_json, '$.type') = 'group'
                 AND m.human_id IS NOT NULL AND p.revision >= m.visible_from_revision))
           AND julianday(e.created_at) >= julianday(?) AND julianday(e.created_at) < julianday(?)
         GROUP BY p.channel_id, author_json
      `)
          .all(LOCAL_HUMAN_ID, from, to),
      ) as Array<{ channel_id: string; author_json: string; count: number }>;
      return rows.map((row) => {
        const author: unknown = JSON.parse(row.author_json);
        if (!isChannelMessageAuthor(author)) throw new Error('Invalid committed message author');
        return { channelId: row.channel_id, author, count: row.count };
      });
    },
    admissionActivity(botSlug, sinceIso) {
      if (!isValidSlug(botSlug)) return [];
      const rows = database.read((db) =>
        db
          .prepare(
            `SELECT reason, COALESCE(observed_at, handled_at) AS at FROM inbox_admissions
              WHERE bot_slug = ? AND ignored_at IS NULL
                AND COALESCE(observed_at, handled_at) IS NOT NULL
                AND COALESCE(observed_at, handled_at) >= ?
              ORDER BY at
              LIMIT 20000`,
          )
          .all(botSlug, sinceIso),
      ) as unknown as Array<{ reason: string; at: string }>;
      return rows.map((row) => ({ at: row.at, reason: row.reason }));
    },
    messagesAfter(id, revision) {
      if (!isValidChannelId(id) || !Number.isSafeInteger(revision) || revision < 0)
        return undefined;
      const messages = allMessages(id);
      if (revision > messages.length) return undefined;
      return messages.slice(revision).map((message, index) => ({
        channelId: id,
        message: project(messages, message),
        revision: revision + index + 1,
      }));
    },
  };
}
