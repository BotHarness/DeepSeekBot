import { assertQuoteTargets, durableQuotes, projectQuotes, sameQuoteIntent } from './quotes.js';
import { acceptedQuestionAnswer } from './accepted-question-answer.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import { isChannelNotice } from './channel-notice.js';
import { assertGenuiMessage } from './genui-message.js';
import {
  compareToolApprovalHistory,
  toolApprovalHistoryEntry,
  type ToolApprovalHistoryEntry,
} from './approval-history.js';
import { allBotPreview, assertAllBotPreview } from './all-bot-mention.js';
import { projectAttachmentFiles } from '../attachments/message-files.js';
import { replyPreviewOf } from './reply-preview.js';
import { assertGrantRequestReply, isGrantRequestResolved } from './grant-request.js';
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
  isBotDmChannel,
  isChannelMessage,
  isChannelRecord,
  isGroupAvatar,
  isValidChannelId,
  type ChannelMessage,
  type ChannelRecord,
} from './channel.js';
import {
  CHANNEL_FILES_LIMIT,
  CHANNEL_FILES_MAX,
  DEFAULT_MESSAGE_PAGE,
  MAX_MESSAGE_PAGE,
  pageChannelJournal,
  pageChannelTimeline,
} from './timeline.js';
import { queryChannelMessages } from './store-query.js';
import type { ChannelStoreOptions, ChannelReadPosition, ChannelStore } from './store-types.js';

export { DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE } from './timeline.js';
export {
  inChannelCallWindow,
  prepareChannelMessageQuery,
  queryChannelMessages,
} from './store-query.js';
export type {
  ChannelMessageQueryOptions,
  ChannelMessageQueryPage,
  PreparedChannelMessageQuery,
  PreparedChannelCallWindow,
} from './store-query.js';
export type {
  ChannelStoreOptions,
  ChannelMessageOrigin,
  ChannelRequestProgress,
  ChannelSendStatus,
  ChannelMessageCommit,
  ChannelAppendOnceResult,
  ChannelReadPosition,
  ChannelReadOptions,
  HumanMessageSearchRequest,
  HumanMessageSearchHit,
  HumanMessageSearchPage,
  CreateChannelGroupInput,
  ChannelStore,
  ChannelOutputObservation,
} from './store-types.js';

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export class ChannelReactionLimitError extends Error {
  constructor() {
    super('A message holds at most 20 of your reactions');
    this.name = 'ChannelReactionLimitError';
  }
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

function projectReplyBase(
  input: ChannelMessage,
  byId: ReadonlyMap<string, ChannelMessage>,
  attachments?: AttachmentStore,
): ChannelMessage {
  const message = projectQuotes(
    input,
    (messageId) => byId.get(messageId),
    (target, ref) =>
      projectAttachmentFiles({ ...(target as ChannelMessage), attachments: [ref] }, attachments)
        .attachments?.[0] ?? ref,
  );
  if (message.replyTo === undefined) return message;
  const target = byId.get(message.replyTo);
  if (target === undefined) return { ...message, replyToPreview: null };
  return {
    ...message,
    replyToPreview: replyPreviewOf(
      target,
      (ref) =>
        projectAttachmentFiles({ ...target, attachments: [ref] }, attachments).attachments?.[0] ??
        ref,
    ),
  };
}

function sameMessageIntent(left: ChannelMessage, right: ChannelMessage): boolean {
  const actor = (message: ChannelMessage) =>
    message.author.kind === 'human'
      ? { kind: 'human', humanId: message.author.humanId ?? OWNER_HUMAN_CONTEXT.humanId }
      : message.author;
  return (
    JSON.stringify(actor(left)) === JSON.stringify(actor(right)) &&
    JSON.stringify(left.genui) === JSON.stringify(right.genui) &&
    JSON.stringify(left.genuiReply) === JSON.stringify(right.genuiReply) &&
    left.genuiReplyContext === right.genuiReplyContext &&
    left.body === right.body &&
    left.replyTo === right.replyTo &&
    sameQuoteIntent(left.quotes, right.quotes) &&
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
        options.attachments,
      ),
      options.attachments,
    );
  const rootDir = options.rootDir;
  const now = options.now ?? (() => new Date());
  const channelDir = (id: string): string => join(rootDir, id);
  const recordFile = (id: string): string => join(channelDir(id), 'channel.json');
  const messagesFile = (id: string): string => join(channelDir(id), 'messages.ndjson');
  const readPositionFile = (human: HumanContext, id: string): string =>
    join(
      channelDir(id),
      human.humanId === OWNER_HUMAN_CONTEXT.humanId
        ? 'read-position.json'
        : `read-position-${Buffer.from(human.humanId).toString('hex')}.json`,
    );
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

  const readPosition = (human: HumanContext, id: string): ChannelReadPosition | undefined => {
    if (read(id) === undefined) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(readPositionFile(human, id), 'utf8'));
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
    humanIdentity: (human: HumanContext) => ({
      humanId: human.humanId,
      defaultDisplayName: null,
      displayName: 'Human',
    }),
    setHumanDefaultName: (human: HumanContext) => {
      throw new Error('Human names require the operational database');
    },
    humanNickname: (human: HumanContext) => undefined,
    setHumanNickname: (human: HumanContext) => {
      throw new Error('Human names require the operational database');
    },
    setHumanAvatar: (human: HumanContext) => {
      throw new Error('Human avatars require the operational database');
    },
    finishHumanProfileSetup: (human: HumanContext) => ({
      humanId: human.humanId,
      defaultDisplayName: null,
      displayName: 'Human',
    }),
    humanAvatars: (human: HumanContext) => [],
    listHumanMembers: (human: HumanContext) => [],
    readPosition,
    markRead(human: HumanContext, id, messageId) {
      return enqueue(id, () => {
        if (read(id) === undefined || messageId.trim().length === 0) return undefined;
        const messages = readValidMessages(id);
        const index = messages.findIndex((message) => message.id === messageId);
        if (index < 0) return undefined;
        const previous = readPosition(human, id);
        if (previous !== undefined && previous.revision >= index + 1) return previous;
        const position: ChannelReadPosition = {
          messageId,
          revision: index + 1,
          readAt: now().toISOString(),
        };
        atomicWriteFile(readPositionFile(human, id), `${JSON.stringify(position, null, 2)}\n`);
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
    storedQuotes(id, messageId) {
      if (!isValidChannelId(id) || messageId.length === 0) return undefined;
      return readValidMessages(id).find((candidate) => candidate.id === messageId)?.quotes;
    },
    observeOutput(human: HumanContext, id, messageId) {
      const channel = this.get(id);
      const message = this.message(id, messageId);
      if (!channel || channel.deletedAt !== undefined || !message) return undefined;
      return {
        channel,
        message: { id: message.id, author: message.author, body: message.body },
        humanParticipant: channel.type === 'group' || channel.botSlug !== undefined,
        canRead:
          this.readHumanTimeline(human, id, {
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
    getOrCreateDm(human: HumanContext, botSlug, botName) {
      if (!isValidSlug(botSlug)) return undefined;
      const id = dmChannelId(botSlug);
      const existing = read(id);
      if (existing !== undefined) return existing;
      const displayName = botName ?? options.botDisplayName?.(botSlug);
      if (displayName === undefined) return undefined;
      const name = displayName.trim();
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
    getOrCreateRemoteBotDm() {
      throw new Error('Remote Bot DMs require the operational database');
    },
    getOrCreateBotDm(human: HumanContext, firstBotSlug, secondBotSlug, name) {
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
    createGroup(human: HumanContext, input) {
      const id = input.id ?? nextGroupId(input.name);
      if (!isValidChannelId(id) || read(id) !== undefined)
        throw new Error('Group Channel identity is unavailable');
      const name = input.name.trim();
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'group',
        ...(input.ownerBotSlug === undefined ? { ownerHumanId: human.humanId } : {}),
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
    setGroupAvatar(human: HumanContext, channelId, avatar) {
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
    removeBotFromGroups() {
      throw new Error('Bot membership cleanup requires the operational Channel store');
    },
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
    rename(human: HumanContext, id, name) {
      const record = read(id);
      const trimmed = name.trim();
      if (record === undefined || trimmed.length === 0) return undefined;
      const renamed = { ...record, name: trimmed };
      write(renamed);
      return renamed;
    },
    async reconcileQuestionAnswer(human, id, reference, answer) {
      const message = acceptedQuestionAnswer(
        this.message(id, reference.messageId),
        reference,
        answer,
        human ? this.humanIdentity(human) : undefined,
      );
      if (!message) return undefined;
      const result = await this.appendMessageOnce(
        human ?? OWNER_HUMAN_CONTEXT,
        id,
        message,
        undefined,
        undefined,
        () =>
          acceptedQuestionAnswer(this.message(id, reference.messageId), reference, answer) !==
          undefined,
      );
      return result.status === 'appended' || result.status === 'existing'
        ? result.message
        : undefined;
    },
    appendMessage(human: HumanContext, id, input, origin, beforeCommit) {
      const message =
        input.author.kind === 'human'
          ? ({
              ...input,
              author: {
                kind: 'human',
                humanId: human.humanId,
                displayName: this.humanIdentity(human).displayName,
              },
            } satisfies ChannelMessage)
          : input;
      return enqueue(id, () => {
        const record = read(id);
        if (record === undefined) return undefined;
        const priorMessages = readValidMessages(id);
        if (
          message.replyTo !== undefined &&
          !priorMessages.some((candidate) => candidate.id === message.replyTo)
        ) {
          throw new ChannelReplyTargetError();
        }
        assertQuoteTargets(message.quotes, (messageId) =>
          priorMessages.find((candidate) => candidate.id === messageId),
        );
        assertAttachmentRefs(message.attachments ?? []);
        assertGrantRequestReply(record, message, priorMessages);
        assertGenuiMessage(record, message, priorMessages);
        if (beforeCommit && !beforeCommit()) return undefined;
        const durableMessage = durableQuotes({ ...message });
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
    grantRequestResolution(channelId, requestMessageId) {
      return this.readMessages(channelId).find(
        (message) => message.grantRequestResolution?.requestMessageId === requestMessageId,
      );
    },
    appendMessageOnce(human: HumanContext, id, input, preview, origin, canCommit) {
      const message =
        input.author.kind === 'human'
          ? ({
              ...input,
              author: {
                kind: 'human',
                humanId: human.humanId,
                displayName: this.humanIdentity(human).displayName,
              },
            } satisfies ChannelMessage)
          : input;
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
        assertQuoteTargets(message.quotes, (messageId) =>
          priorMessages.find((candidate) => candidate.id === messageId),
        );
        assertAttachmentRefs(message.attachments ?? []);
        assertGrantRequestReply(record, message, priorMessages);
        assertGenuiMessage(record, message, priorMessages);
        const durableMessage = durableQuotes({ ...message });
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
    latestBotActivity(human: HumanContext) {
      const result = new Map<string, number>();
      for (const channel of this.list()) {
        if (isBotDmChannel(channel) || channel.deletedAt) continue;
        for (const message of readValidMessages(channel.id)) {
          if (message.author.kind !== 'bot' || isChannelNotice(message)) continue;
          const at = Date.parse(message.at);
          if (Number.isFinite(at))
            result.set(message.author.slug, Math.max(result.get(message.author.slug) ?? 0, at));
        }
      }
      return result;
    },
    toolApprovalHistory(botSlug, page) {
      const entries: ToolApprovalHistoryEntry[] = [];
      for (const channel of this.list()) {
        if (channel.deletedAt) continue;
        const messages = readValidMessages(channel.id);
        const byId = new Map(messages.map((message) => [message.id, message]));
        for (const message of messages) {
          const requestId = message.toolApprovalDecision?.requestMessageId;
          const request = requestId === undefined ? undefined : byId.get(requestId);
          const entry =
            request === undefined
              ? undefined
              : toolApprovalHistoryEntry(channel.id, message, request, botSlug);
          if (
            entry !== undefined &&
            (page.after === undefined || compareToolApprovalHistory(page.after, entry) < 0)
          )
            entries.push(entry);
        }
      }
      return entries.sort(compareToolApprovalHistory).slice(0, page.limit);
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
    readHumanTimeline(human: HumanContext, id, request) {
      const channel = this.get(id);
      if (channel === undefined) return undefined;
      return this.readTimeline(id, request);
    },
    readHumanFilesPage(human: HumanContext, id, request) {
      if (this.get(id) === undefined) return undefined;
      const limit = Math.min(Math.max(request.limit ?? CHANNEL_FILES_LIMIT, 1), CHANNEL_FILES_MAX);
      const entries = readValidMessages(id)
        .map((message, index) => ({ channelId: id, message, revision: index + 1 }))
        .filter(
          (entry) =>
            (request.before === undefined || entry.revision < request.before) &&
            (entry.message.attachments?.length ?? 0) > 0,
        );
      const page = entries.slice(-limit);
      const oldest = page[0]?.revision;
      return {
        entries: page,
        ...(entries.length > limit && oldest !== undefined ? { nextBefore: oldest } : {}),
      };
    },
    readHumanJournalPage(human: HumanContext, id, request) {
      if (this.get(id) === undefined) return undefined;
      const messages = readValidMessages(id);
      const page = pageChannelJournal(id, messages, request);
      if (page === undefined) return undefined;
      const byId = messageIndex(messages);
      return {
        ...page,
        entries: page.entries.map((entry) => ({
          ...entry,
          message: projectReply(entry.message, byId),
        })),
      };
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
