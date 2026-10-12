import { allBotPreview, assertAllBotPreview, type AllBotPreview } from './all-bot-mention.js';
import type { AttachmentMigrationResult } from '../attachments/legacy-migration.js';
import { projectAttachmentFiles } from '../attachments/message-files.js';
import { assertGrantRequestReply, isGrantRequestResolved } from './grant-request.js';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

import { isValidSlug } from '../bots/slug.js';
import { ChannelAttachmentError, type AttachmentStore } from '../attachments/store.js';
import {
  attachmentIdentity,
  attachmentIntent,
  isChannelAttachmentRef,
  type ChannelAttachmentRef,
} from '../attachments/ref.js';
import { atomicWriteFile } from '../fs/atomic-write.js';
import {
  botDmChannelId,
  dmChannelId,
  groupChannelIdBase,
  isChannelMessage,
  isChannelRecord,
  isGroupAvatar,
  isValidChannelId,
  type LocalHumanIdentity,
  type ChannelMemoryCommit,
  type ChannelMessage,
  type ChannelRecord,
  type GroupInvitation,
  type GroupJoinRequest,
  type GroupWakePolicyActor,
  type GroupWakePolicyView,
  type BotMessageCausation,
} from './channel.js';
import {
  DEFAULT_MESSAGE_PAGE,
  MAX_MESSAGE_PAGE,
  pageChannelTimeline,
  type ChannelTimelinePage,
  type ChannelTimelineRequest,
} from './timeline.js';

export { DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE } from './timeline.js';

export interface ChannelStoreOptions {
  rootDir: string;
  attachments?: AttachmentStore;
  now?: () => Date;
  onCommitted?: (commit: ChannelMessageCommit) => void;
  onRecordChanged?: () => void;
  onAdmissionChanged?: (channelId: string, messageId: string, message: ChannelMessage) => void;
  onHumanReadChanged?: (channelId: string, humanId: string, revision: number) => void;
  warn?: (message: string) => void;
  isBotActive?: (botSlug: string) => boolean;
  botDisplayName?: (botSlug: string) => string | undefined;
}

export interface ChannelMessageOrigin {
  sessionId: string;
  sourceEventId?: string;
}

export interface ChannelSendStatus {
  sourceEventId: string;
  state: string;
  replies: ChannelMessage[];
}

export interface ChannelMessageCommit {
  channelId: string;
  message: ChannelMessage;
  revision: number;
  origin?: ChannelMessageOrigin;
}
export type ChannelAppendOnceResult =
  | { status: 'appended'; message: ChannelMessage }
  | { status: 'existing'; message: ChannelMessage }
  | { status: 'conflict' }
  | { status: 'missing' };

export interface ChannelReadPosition {
  messageId: string;
  revision: number;
  readAt: string;
}

export interface ChannelReadOptions {
  before?: string;
  limit?: number;
}

export interface ChannelMessageQueryOptions {
  text?: string;
  authorBotId?: string;
  authorKind?: 'human' | 'bot' | 'bridged' | 'system';
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;

  orderBy?: 'time';
}

export interface ChannelMessageQueryPage {
  messages: ChannelMessage[];
  nextCursor?: string;
}

export interface PreparedChannelMessageQuery {
  text?: string;
  authorBotId?: string;
  authorKind?: 'human' | 'bot' | 'bridged' | 'system';
  from?: number;
  to?: number;
  beforeId?: string;
  orderBy?: 'time';
  filter: string;
  limit: number;
}

export function prepareChannelMessageQuery(
  channelId: string,
  options: ChannelMessageQueryOptions = {},
): PreparedChannelMessageQuery {
  if (
    options.authorBotId !== undefined &&
    options.authorKind !== undefined &&
    options.authorKind !== 'bot'
  ) {
    throw new Error('channel_read: author_bot_id requires author_kind bot');
  }
  if (
    options.authorKind !== undefined &&
    !['human', 'bot', 'bridged', 'system'].includes(options.authorKind)
  ) {
    throw new Error('channel_read: invalid author_kind');
  }
  const from = options.from === undefined ? undefined : Date.parse(options.from);
  const to =
    options.to === undefined
      ? undefined
      : Date.parse(options.to) + (/^\d{4}-\d{2}-\d{2}$/u.test(options.to) ? 86_400_000 - 1 : 0);
  if (
    (from !== undefined && !Number.isFinite(from)) ||
    (to !== undefined && !Number.isFinite(to)) ||
    (from !== undefined && to !== undefined && from > to)
  )
    throw new Error('channel_read: invalid date range');
  const text = options.text?.trim().toLowerCase();
  const filter = createHash('sha256')
    .update(
      JSON.stringify({
        channelId,
        text,
        authorBotId: options.authorBotId,
        authorKind: options.authorKind,
        from,
        to,
        orderBy: options.orderBy,
      }),
    )
    .digest('hex')
    .slice(0, 16);
  let beforeId: string | undefined;
  if (options.cursor !== undefined) {
    try {
      const decoded: unknown = JSON.parse(
        Buffer.from(options.cursor, 'base64url').toString('utf8'),
      );
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        !('beforeId' in decoded) ||
        typeof decoded.beforeId !== 'string' ||
        !('filter' in decoded) ||
        decoded.filter !== filter
      )
        throw new Error('invalid');
      beforeId = decoded.beforeId;
    } catch {
      throw new Error('channel_read: invalid cursor');
    }
  }
  return {
    ...(text === undefined ? {} : { text }),
    ...(options.authorBotId === undefined ? {} : { authorBotId: options.authorBotId }),
    ...(options.authorKind === undefined ? {} : { authorKind: options.authorKind }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(beforeId === undefined ? {} : { beforeId }),
    ...(options.orderBy === undefined ? {} : { orderBy: options.orderBy }),
    filter,
    limit: Math.max(
      1,
      Math.min(Math.floor(options.limit ?? DEFAULT_MESSAGE_PAGE), MAX_MESSAGE_PAGE),
    ),
  };
}

export function queryChannelMessages(
  channelId: string,
  messages: readonly ChannelMessage[],
  options: ChannelMessageQueryOptions = {},
): ChannelMessageQueryPage {
  const query = prepareChannelMessageQuery(channelId, options);
  const ordered =
    query.orderBy === 'time'
      ? messages
          .filter((message) => Number.isFinite(Date.parse(message.at)))
          .sort(
            (left, right) =>
              Date.parse(right.at) - Date.parse(left.at) ||
              (right.id < left.id ? -1 : right.id > left.id ? 1 : 0),
          )
      : [...messages].reverse();
  const beforeIndex =
    query.beforeId === undefined
      ? -1
      : ordered.findIndex((message) => message.id === query.beforeId);
  if (query.beforeId !== undefined && beforeIndex < 0)
    throw new Error('channel_read: invalid cursor');
  const matching = ordered.slice(beforeIndex + 1).filter((message) => {
    if (query.text !== undefined && !message.body.toLowerCase().includes(query.text)) return false;
    if (
      query.authorBotId !== undefined &&
      (message.author.kind !== 'bot' || message.author.slug !== query.authorBotId)
    )
      return false;
    if (query.authorKind !== undefined && message.author.kind !== query.authorKind) return false;
    const at = Date.parse(message.at);
    if ((query.from !== undefined || query.to !== undefined) && !Number.isFinite(at)) return false;
    if (query.from !== undefined && at < query.from) return false;
    if (query.to !== undefined && at > query.to) return false;
    return true;
  });
  const page = matching.slice(0, query.limit + 1);
  const selected = page.slice(0, query.limit);
  const last = selected.at(-1);
  return {
    messages: selected,
    ...(page.length <= query.limit || last === undefined
      ? {}
      : {
          nextCursor: Buffer.from(
            JSON.stringify({ beforeId: last.id, filter: query.filter }),
          ).toString('base64url'),
        }),
  };
}

export interface CreateChannelGroupInput {
  name: string;
  members: string[];
  ownerBotSlug?: string;
}

export interface ChannelStore {
  rootDir: string;
  humanIdentity(): LocalHumanIdentity;
  setHumanDefaultName(displayName: string | null): LocalHumanIdentity;
  humanNickname(id: string): string | null | undefined;
  setHumanNickname(id: string, nickname: string | null): void;
  list(): ChannelRecord[];
  get(id: string): ChannelRecord | undefined;
  listHumanMembers(id: string): Array<{ humanId: string; displayName: string }>;

  latestHumanMessageId?(id: string): string | undefined;
  latestMessage(id: string): ChannelMessage | undefined;

  hasMessage(id: string, messageId: string): boolean;
  message(id: string, messageId: string): ChannelMessage | undefined;
  humanSendStatus?(id: string, messageId: string): ChannelSendStatus | undefined;
  observeOutput(id: string, messageId: string): ChannelOutputObservation | undefined;
  outputCheckpoint(): number | undefined;
  assertAttachmentRefs(refs: readonly ChannelAttachmentRef[]): void;

  referencedAttachmentHashes(): ReadonlySet<string>;
  migrateAttachments?(signal?: AbortSignal): Promise<AttachmentMigrationResult>;
  attachmentReference?(
    channelId: string,
    messageId: string,
    identity: string,
  ): ChannelAttachmentRef | undefined;
  getOrCreateDm(botSlug: string, botName: string): ChannelRecord | undefined;
  getOrCreateBotDm(
    firstBotSlug: string,
    secondBotSlug: string,
    name: string,
  ): ChannelRecord | undefined;
  createGroup(input: CreateChannelGroupInput): ChannelRecord;

  inviteGroupBot(input: {
    channelId: string;
    inviterBotSlug?: string;
    inviterHuman?: true;
    targetBotSlug: string;
    targetBotCreatedAt: string;
    targetDmChannelId: string;
    botCausation?: BotMessageCausation;
  }): GroupInvitation;
  setGroupAvatar(channelId: string, avatar: string | null): ChannelRecord;

  respondToGroupInvite(input: {
    invitationId: string;
    targetBotSlug: string;
    targetBotCreatedAt: string;
    accept: boolean;
  }): {
    channel: ChannelRecord;
    invitation: GroupInvitation;
  };

  requestGroupJoin(input: {
    channelId: string;
    requesterBotSlug: string;
    requesterBotCreatedAt: string;
    ownerDmChannelId?: string;
    botCausation?: BotMessageCausation;
  }): GroupJoinRequest;

  decideGroupJoin(input: {
    channelId: string;
    requestId: string;
    accept: boolean;
    decidedBy: 'human' | string;
    requesterBotCreatedAt: string;
    requesterDmChannelId: string;
    botCausation?: BotMessageCausation;
  }): { channel: ChannelRecord; request: GroupJoinRequest; notified: boolean };

  cancelGroupInvite(channelId: string, invitationId: string): ChannelRecord;
  cancelInvitationsForBot(botSlug: string): void;
  getGroupWakePolicy(channelId: string, botSlug: string): GroupWakePolicyView;
  setGroupWakePolicy(
    channelId: string,
    botSlug: string,
    policy: {
      mode: 'all' | 'mentions' | 'digest' | 'silent';
      count: number;
      intervalSeconds: number;
      inherit?: boolean;
    },
    actor?: GroupWakePolicyActor,
  ): ChannelRecord;
  removeGroupMember(
    channelId: string,
    botSlug: string,
    departureType?: 'left' | 'removed',
  ): ChannelRecord;

  deleteGroup(channelId: string): void;
  appendMemoryCommits(input: {
    botSlug: string;
    causeSourceEventId: string;
    commits: ReadonlyArray<Omit<ChannelMemoryCommit, 'botSlug'>>;
  }): ChannelMessage[];
  rename(id: string, name: string): ChannelRecord | undefined;
  previewAllBotMention(id: string): AllBotPreview;
  appendMessageOnce(
    id: string,
    message: ChannelMessage,
    preview?: AllBotPreview,
    origin?: ChannelMessageOrigin,
    canCommit?: () => boolean,
  ): Promise<ChannelAppendOnceResult>;
  readPosition(id: string): ChannelReadPosition | undefined;
  markRead(id: string, messageId: string): Promise<ChannelReadPosition | undefined>;
  appendMessage(
    id: string,
    message: ChannelMessage,
    origin?: ChannelMessageOrigin,
  ): Promise<ChannelMessage | undefined>;
  readMessages(id: string, options?: ChannelReadOptions): ChannelMessage[];
  queryMessages(id: string, options?: ChannelMessageQueryOptions): ChannelMessageQueryPage;
  readTimeline(id: string, request?: ChannelTimelineRequest): ChannelTimelinePage | undefined;
  readHumanTimeline(id: string, request?: ChannelTimelineRequest): ChannelTimelinePage | undefined;
  revision(id: string): number;
  messagesAfter(id: string, revision: number): ChannelMessageCommit[] | undefined;
  admissionChanged?(channelId: string, messageId: string): void;

  humanMessageCounts?(
    from: string,
    to: string,
  ): Array<{
    channelId: string;
    author: ChannelMessage['author'];
    count: number;
  }>;
  admissionActivity?(botSlug: string, sinceIso: string): Array<{ at: string; reason: string }>;
}

export interface ChannelOutputObservation {
  position?: number;
  channel: Pick<ChannelRecord, 'id' | 'type' | 'name' | 'botSlug' | 'members' | 'deletedAt'>;
  message: Pick<ChannelMessage, 'id' | 'author' | 'body'>;
  humanParticipant: boolean;
  canRead: boolean;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export class ChannelMentionTargetError extends Error {
  constructor() {
    super('Mentioned PersonaBot is not eligible for this Channel');
    this.name = 'ChannelMentionTargetError';
  }
}

export class ChannelReplyTargetError extends Error {
  constructor() {
    super('Reply target must exist in this Channel');
    this.name = 'ChannelReplyTargetError';
  }
}

const REPLY_PREVIEW_LIMIT = 140;

function projectReplyBase(
  message: ChannelMessage,
  byId: ReadonlyMap<string, ChannelMessage>,
): ChannelMessage {
  if (message.replyTo === undefined) return message;
  const target = byId.get(message.replyTo);
  if (target === undefined) return { ...message, replyToPreview: null };
  const normalized = target.body.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(normalized);
  const body =
    characters.length > REPLY_PREVIEW_LIMIT
      ? characters.slice(0, REPLY_PREVIEW_LIMIT).join('') + '...'
      : normalized;
  return { ...message, replyToPreview: { author: target.author, body } };
}

function sameMessageIntent(left: ChannelMessage, right: ChannelMessage): boolean {
  return (
    JSON.stringify(left.author) === JSON.stringify(right.author) &&
    left.body === right.body &&
    left.replyTo === right.replyTo &&
    JSON.stringify(left.grantRequestResolution) === JSON.stringify(right.grantRequestResolution) &&
    JSON.stringify(left.assignmentReply) === JSON.stringify(right.assignmentReply) &&
    JSON.stringify(attachmentIntent(left.attachments ?? [])) ===
      JSON.stringify(attachmentIntent(right.attachments ?? []))
  );
}

function messageIndex(messages: readonly ChannelMessage[]): Map<string, ChannelMessage> {
  return new Map(messages.map((message) => [message.id, message]));
}

export function createChannelStore(options: ChannelStoreOptions): ChannelStore {
  const projectReply = (
    message: ChannelMessage,
    byId: ReadonlyMap<string, ChannelMessage>,
  ): ChannelMessage =>
    projectAttachmentFiles(
      projectReplyBase(
        {
          ...message,
          ...(message.grantRequest
            ? { grantRequestResolved: isGrantRequestResolved([...byId.values()], message.id) }
            : {}),
        },
        byId,
      ),
      options.attachments,
    );
  const rootDir = options.rootDir;
  const now = options.now ?? (() => new Date());
  const channelDir = (id: string): string => join(rootDir, id);
  const recordFile = (id: string): string => join(channelDir(id), 'channel.json');
  const messagesFile = (id: string): string => join(channelDir(id), 'messages.ndjson');
  const readPositionFile = (id: string): string => join(channelDir(id), 'read-position.json');
  const revisions = new Map<string, number>();
  const assertAttachmentRefs = (refs: readonly ChannelAttachmentRef[]): void => {
    if (
      refs.length > 10 ||
      refs.some((ref) => !isChannelAttachmentRef(ref) || !options.attachments?.has(ref))
    )
      throw new ChannelAttachmentError('Attachment does not belong to this profile', 'invalid-ref');
  };

  const readValidMessages = (id: string): ChannelMessage[] => {
    if (!isValidChannelId(id)) return [];
    let text: string;
    try {
      text = readFileSync(messagesFile(id), 'utf8');
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const messages: ChannelMessage[] = [];
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (isChannelMessage(parsed)) messages.push(parsed);
    }
    return messages;
  };

  const revisionOf = (id: string): number => {
    if (!isValidChannelId(id)) return 0;
    let revision = revisions.get(id);
    if (revision === undefined) {
      revision = readValidMessages(id).length;
      revisions.set(id, revision);
    }
    return revision;
  };

  const read = (id: string): ChannelRecord | undefined => {
    if (!isValidChannelId(id)) return undefined;
    let text: string;
    try {
      text = readFileSync(recordFile(id), 'utf8');
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return undefined;
    }
    return isChannelRecord(parsed, id) ? parsed : undefined;
  };

  const readPosition = (id: string): ChannelReadPosition | undefined => {
    if (read(id) === undefined) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(readPositionFile(id), 'utf8'));
    } catch (error) {
      if (isMissing(error) || error instanceof SyntaxError) return undefined;
      throw error;
    }
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const position = parsed as Record<string, unknown>;
    const messageId = position['messageId'];
    const revision = position['revision'];
    const readAt = position['readAt'];
    if (
      typeof messageId !== 'string' ||
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      typeof readAt !== 'string'
    )
      return undefined;
    if (readValidMessages(id)[revision - 1]?.id !== messageId) return undefined;
    return { messageId, revision, readAt };
  };

  const write = (record: ChannelRecord): void => {
    mkdirSync(channelDir(record.id), { recursive: true });
    atomicWriteFile(recordFile(record.id), `${JSON.stringify(record, null, 2)}\n`);
  };

  const queueTails = new Map<string, Promise<unknown>>();
  const enqueue = <T>(id: string, task: () => T): Promise<T> => {
    const previous = queueTails.get(id) ?? Promise.resolve();
    const run = previous.then(task, task);
    queueTails.set(
      id,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  };

  const nextGroupId = (name: string): string => {
    const base = groupChannelIdBase(name);
    let candidate = base;
    let suffix = 2;
    while (existsSync(channelDir(candidate))) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  return {
    rootDir,
    get: read,
    humanIdentity: () => ({
      humanId: 'local-human',
      defaultDisplayName: null,
      displayName: 'Human',
    }),
    setHumanDefaultName: () => {
      throw new Error('Human names require the operational database');
    },
    humanNickname: () => undefined,
    setHumanNickname: () => {
      throw new Error('Human names require the operational database');
    },
    listHumanMembers: () => [],
    readPosition,
    markRead(id, messageId) {
      return enqueue(id, () => {
        if (read(id) === undefined || messageId.trim().length === 0) return undefined;
        const messages = readValidMessages(id);
        const index = messages.findIndex((message) => message.id === messageId);
        if (index < 0) return undefined;
        const previous = readPosition(id);
        if (previous !== undefined && previous.revision >= index + 1) return previous;
        const position: ChannelReadPosition = {
          messageId,
          revision: index + 1,
          readAt: now().toISOString(),
        };
        atomicWriteFile(readPositionFile(id), `${JSON.stringify(position, null, 2)}\n`);
        return position;
      });
    },
    latestMessage(id) {
      if (!isValidChannelId(id)) return undefined;
      let text: string;
      try {
        text = readFileSync(messagesFile(id), 'utf8');
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
      const lines = text.split('\n');
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index]?.trim() ?? '';
        if (line.length === 0) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (isChannelMessage(parsed)) return parsed;
      }
      return undefined;
    },
    assertAttachmentRefs,
    referencedAttachmentHashes() {
      const hashes = new Set<string>();
      for (const channel of this.list())
        for (const message of readValidMessages(channel.id))
          for (const ref of message.attachments ?? []) hashes.add(attachmentIdentity(ref));
      return hashes;
    },
    hasMessage(id, messageId) {
      if (!isValidChannelId(id) || messageId.length === 0) return false;
      return readValidMessages(id).some((message) => message.id === messageId);
    },
    message(id, messageId) {
      if (!isValidChannelId(id) || messageId.length === 0) return undefined;
      const messages = readValidMessages(id);
      const message = messages.find((candidate) => candidate.id === messageId);
      return message === undefined ? undefined : projectReply(message, messageIndex(messages));
    },
    observeOutput(id, messageId) {
      const channel = this.get(id);
      const message = this.message(id, messageId);
      if (!channel || channel.deletedAt !== undefined || !message) return undefined;
      return {
        channel,
        message: { id: message.id, author: message.author, body: message.body },
        humanParticipant: channel.type === 'group' || channel.botSlug !== undefined,
        canRead:
          this.readHumanTimeline(id, {
            direction: 'around',
            around: messageId,
            olderLimit: 0,
            newerLimit: 0,
          }) !== undefined,
      };
    },
    outputCheckpoint: () => undefined,
    list() {
      let entries: Dirent[];
      try {
        entries = readdirSync(rootDir, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => read(entry.name))
        .filter((record): record is ChannelRecord => record !== undefined)
        .sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
        );
    },
    getOrCreateDm(botSlug, botName) {
      if (!isValidSlug(botSlug)) return undefined;
      const id = dmChannelId(botSlug);
      const existing = read(id);
      if (existing !== undefined) return existing;
      const name = botName.trim();
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'dm',
        name: name.length > 0 ? name : botSlug,
        members: [botSlug],
        botSlug,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      write(record);
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
      const existing = read(id);
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
      write(record);
      return record;
    },
    createGroup(input) {
      const id = nextGroupId(input.name);
      const name = input.name.trim();
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'group',
        name: name.length > 0 ? name : id,
        members: [...input.members],
        ...(input.ownerBotSlug === undefined ? {} : { ownerBotSlug: input.ownerBotSlug }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      write(record);
      return record;
    },
    inviteGroupBot() {
      throw new Error('Group invitations require the operational Channel store');
    },
    setGroupAvatar(channelId, avatar) {
      const channel = read(channelId);
      if (channel?.type !== 'group') throw new Error('Group Channel not found');
      if (avatar !== null && !isGroupAvatar(avatar)) throw new Error('Invalid Group avatar');
      const updated = { ...channel, updatedAt: now().toISOString() };
      if (avatar === null) delete updated.avatar;
      else updated.avatar = avatar;
      write(updated);
      return updated;
    },
    respondToGroupInvite() {
      throw new Error('Group invitations require the operational Channel store');
    },
    requestGroupJoin() {
      throw new Error('Group join requests require the operational Channel store');
    },
    decideGroupJoin() {
      throw new Error('Group join requests require the operational Channel store');
    },
    cancelGroupInvite() {
      throw new Error('Group invitations require the operational Channel store');
    },
    cancelInvitationsForBot() {},
    getGroupWakePolicy() {
      throw new Error('Group wake policy requires the operational Channel store');
    },
    setGroupWakePolicy() {
      throw new Error('Group wake policy requires the operational Channel store');
    },
    removeGroupMember() {
      throw new Error('Group management requires the operational Channel store');
    },
    deleteGroup() {
      throw new Error('Group deletion requires the operational Channel store');
    },
    appendMemoryCommits() {
      throw new Error('Memory commit notices require the operational Channel store');
    },
    rename(id, name) {
      const record = read(id);
      const trimmed = name.trim();
      if (record === undefined || trimmed.length === 0) return undefined;
      const renamed = { ...record, name: trimmed };
      write(renamed);
      return renamed;
    },
    appendMessage(id, message, origin) {
      return enqueue(id, () => {
        const record = read(id);
        if (record === undefined) return undefined;
        const priorMessages = message.replyTo === undefined ? [] : readValidMessages(id);
        if (
          message.replyTo !== undefined &&
          !priorMessages.some((candidate) => candidate.id === message.replyTo)
        ) {
          throw new ChannelReplyTargetError();
        }
        assertAttachmentRefs(message.attachments ?? []);
        assertGrantRequestReply(record, message, priorMessages);
        const durableMessage = { ...message };
        delete durableMessage.grantRequestResolved;
        delete durableMessage.replyToPreview;
        const projected = projectReply(durableMessage, messageIndex(priorMessages));
        const revision = revisionOf(id) + 1;
        mkdirSync(channelDir(id), { recursive: true });
        appendFileSync(messagesFile(id), `${JSON.stringify(durableMessage)}\n`, 'utf8');
        revisions.set(id, revision);
        write({ ...record, updatedAt: now().toISOString() });
        try {
          options.onCommitted?.({
            channelId: id,
            message: projected,
            revision,
            ...(origin === undefined ? {} : { origin }),
          });
        } catch (error) {
          options.warn?.(`Channel post-commit notification failed: ${String(error)}`);
        }
        return projected;
      });
    },
    previewAllBotMention(id) {
      const channel = read(id);
      if (channel === undefined) throw new Error('Group Channel not found');
      return allBotPreview(
        channel,
        options.isBotActive ?? (() => false),
        options.botDisplayName ?? (() => undefined),
      );
    },
    appendMessageOnce(id, message, preview, origin, canCommit) {
      return enqueue(id, () => {
        const record = read(id);
        if (record === undefined) return { status: 'missing' };
        const priorMessages = readValidMessages(id);
        const existing = priorMessages.find((candidate) => candidate.id === message.id);
        if (existing !== undefined) {
          if (!sameMessageIntent(existing, message)) return { status: 'conflict' };
          return {
            status: 'existing',
            message: projectReply(existing, messageIndex(priorMessages)),
          };
        }
        if (canCommit?.() === false) return { status: 'conflict' };
        if (preview !== undefined) {
          if (message.author.kind !== 'human') throw new Error('All Bots requires a Human sender');
          assertAllBotPreview(
            allBotPreview(
              record,
              options.isBotActive ?? (() => false),
              options.botDisplayName ?? (() => undefined),
            ),
            preview,
          );
        }
        if (
          message.replyTo !== undefined &&
          !priorMessages.some((candidate) => candidate.id === message.replyTo)
        ) {
          throw new ChannelReplyTargetError();
        }
        assertAttachmentRefs(message.attachments ?? []);
        assertGrantRequestReply(record, message, priorMessages);
        const durableMessage = { ...message };
        delete durableMessage.grantRequestResolved;
        delete durableMessage.replyToPreview;
        const projected = projectReply(durableMessage, messageIndex(priorMessages));
        const revision = revisionOf(id) + 1;
        mkdirSync(channelDir(id), { recursive: true });
        appendFileSync(messagesFile(id), `${JSON.stringify(durableMessage)}\n`, 'utf8');
        revisions.set(id, revision);
        write({ ...record, updatedAt: now().toISOString() });
        try {
          options.onCommitted?.({
            channelId: id,
            message: projected,
            revision,
            ...(origin === undefined ? {} : { origin }),
          });
        } catch (error) {
          options.warn?.(`Channel post-commit notification failed: ${String(error)}`);
        }
        return { status: 'appended', message: projected };
      });
    },
    readMessages(id, readOptions) {
      const messages = readValidMessages(id);
      const requested = readOptions?.limit ?? DEFAULT_MESSAGE_PAGE;
      const limit = Math.max(1, Math.min(requested, MAX_MESSAGE_PAGE));
      let end = messages.length;
      const before = readOptions?.before;
      if (before !== undefined) {
        const index = messages.findIndex((message) => message.id === before);
        if (index === -1) return [];
        end = index;
      }
      const byId = messageIndex(messages);
      return messages
        .slice(Math.max(0, end - limit), end)
        .reverse()
        .map((message) => projectReply(message, byId));
    },
    queryMessages(id, queryOptions) {
      const messages = readValidMessages(id);
      const page = queryChannelMessages(id, messages, queryOptions);
      const byId = messageIndex(messages);
      return { ...page, messages: page.messages.map((message) => projectReply(message, byId)) };
    },
    readTimeline(id, request) {
      const messages = readValidMessages(id);
      const page = pageChannelTimeline(id, messages, request);
      if (page === undefined) return undefined;
      const byId = messageIndex(messages);
      return { ...page, entries: page.entries.map((message) => projectReply(message, byId)) };
    },
    readHumanTimeline(id, request) {
      const channel = this.get(id);
      if (channel === undefined) return undefined;
      return this.readTimeline(id, request);
    },
    revision: revisionOf,
    messagesAfter(id, revision) {
      if (!isValidChannelId(id) || !Number.isSafeInteger(revision) || revision < 0) {
        return undefined;
      }
      const messages = readValidMessages(id);
      if (revision > messages.length) return undefined;
      revisions.set(id, messages.length);
      const byId = messageIndex(messages);
      return messages.slice(revision).map((message, index) => ({
        channelId: id,
        message: projectReply(message, byId),
        revision: revision + index + 1,
      }));
    },
  };
}
