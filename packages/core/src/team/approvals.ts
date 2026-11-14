import { channelRoleEligibleSql } from './channel-contract.js';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ChannelStore } from '../channels/store.js';
import type { ChannelMessage } from '../channels/channel.js';
import type { ChannelMessageAuthor } from '../channels/message-author.js';
import { type HumanContext } from '../humans/context.js';
import { isDshGovernedTool } from '../workspaces/grant-execution.js';
import type { TeamRoles } from './roles.js';
import { TeamError } from './error.js';

import type { ApprovalKind, ApprovalCard, ApprovalDecider } from './approval-contract.js';
export { maskedApprovalCardSchema, isMaskedApprovalCard } from './approval-contract.js';
export type {
  ApprovalKind,
  ApprovalCard,
  ApprovalDecider,
  MaskedApprovalCard,
  ProjectedApprovalMessage,
} from './approval-contract.js';
const botSchema = z.object({ owner: z.string() });
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
const kinds = ['toolApprovalRequest', 'userQuestionRequest', 'privateInputRequest'] as const;
const resolutions = [
  'toolApprovalDecision',
  'userQuestionResolution',
  'privateInputResolution',
] as const;

type ApprovalStatusReader = (
  kind: ApprovalKind,
  botSlug: string,
  channelId: string,
  messageId: string,
) => string;

export class TeamApprovals {
  private status: ApprovalStatusReader | undefined;

  bindStatus(read: ApprovalStatusReader): () => void {
    this.status = read;
    return () => {
      if (this.status === read) this.status = undefined;
    };
  }

  constructor(
    private readonly database: OperationalDatabaseModulePort,
    private readonly channels: ChannelStore,
    private readonly roles: TeamRoles,
  ) {}

  botOwner(botSlug: string): string | undefined {
    const row = this.database.read((db) =>
      db.prepare('SELECT owner_human_id AS owner FROM persona_bots WHERE slug = ?').get(botSlug),
    );
    return row === undefined ? undefined : botSchema.parse(row).owner;
  }

  canApprove(human: HumanContext, botSlug: string, opaque = false): boolean {
    try {
      this.require(human, botSlug, opaque);
      return true;
    } catch (error) {
      if (error instanceof TeamError) return false;
      throw error;
    }
  }

  require(human: HumanContext, botSlug: string, opaque = false): void {
    const owner = this.botOwner(botSlug);
    const permissions = this.roles.permissions(human);
    if (
      owner === undefined ||
      !this.active(human) ||
      (owner !== human.humanId && !permissions.includes('approvals.opaqueTools'))
    )
      throw new TeamError('approval-not-allowed');
    if (
      opaque &&
      owner !== this.roles.ownerContext().humanId &&
      !permissions.includes('approvals.opaqueTools')
    )
      throw new TeamError('permission-required', undefined, {
        permission: 'approvals.opaqueTools',
      });
  }

  private active(human: HumanContext): boolean {
    return (
      this.database.read((db) =>
        db
          .prepare("SELECT 1 FROM humans WHERE human_id = ? AND status = 'active'")
          .get(human.humanId),
      ) !== undefined
    );
  }

  decider(human: HumanContext): ApprovalDecider {
    const row = this.database.read((db) =>
      db.prepare('SELECT display_name FROM humans WHERE human_id = ?').get(human.humanId),
    );
    return {
      humanId: human.humanId,
      ...(typeof row?.display_name === 'string' ? { displayName: row.display_name } : {}),
    };
  }

  request(channelId: string, messageId: string): ChannelMessage | undefined {
    const message = this.channels.message(channelId, messageId);
    return message && kinds.some((key) => message[key] !== undefined) ? message : undefined;
  }

  private audience(human: HumanContext, channelId: string): boolean {
    return (
      this.database.read((db) =>
        db
          .prepare(`SELECT 1 FROM channel_records c WHERE c.channel_id = $channelId
      AND (json_extract(c.record_json, '$.type') <> 'group' OR ${channelRoleEligibleSql('c', '$humanId')})
      AND (json_extract(c.record_json, '$.humanParticipants') IS NULL OR EXISTS (
        SELECT 1 FROM json_each(c.record_json, '$.humanParticipants') participant WHERE participant.value = $humanId))`)
          .get({ channelId, humanId: human.humanId }),
      ) !== undefined
    );
  }

  ownsRequest(human: HumanContext, channelId: string, messageId: string): boolean {
    const message = this.request(channelId, messageId);
    return (
      message?.author.kind === 'bot' &&
      this.botOwner(message.author.slug) === human.humanId &&
      this.audience(human, channelId)
    );
  }

  requireRequest(human: HumanContext, channelId: string, messageId: string): void {
    const message = this.request(channelId, messageId);
    if (message?.author.kind !== 'bot' || !this.audience(human, channelId))
      throw new TeamError('approval-not-allowed');
    const channel = this.channels.get(channelId);
    const owner = this.botOwner(message.author.slug);
    if (
      owner !== human.humanId &&
      !channel?.humanParticipants?.includes(human.humanId) &&
      (channel?.type !== 'group' ||
        !this.channels
          .listHumanMembers(human, channelId)
          .some((member) => member.humanId === human.humanId))
    )
      throw new TeamError('approval-not-allowed');
    this.require(
      human,
      message.author.slug,
      message.toolApprovalRequest !== undefined &&
        isDshGovernedTool(message.toolApprovalRequest.toolName),
    );
  }

  card(human: HumanContext, channelId: string, message: ChannelMessage): ApprovalCard | undefined {
    if (message.author.kind !== 'bot') return undefined;
    const index = kinds.findIndex((key) => message[key] !== undefined);
    if (index === -1) return undefined;
    const kind: ApprovalKind =
      index === 0 ? 'tool-approval' : index === 1 ? 'user-question' : 'private-input';
    const opaque =
      message.toolApprovalRequest !== undefined &&
      isDshGovernedTool(message.toolApprovalRequest.toolName);
    const row = this.database.read((db) =>
      db
        .prepare(`SELECT created_at, payload_json FROM source_events
      WHERE channel_id = ? AND (json_extract(payload_json, '$.toolApprovalDecision.requestMessageId') = ?
        OR json_extract(payload_json, '$.userQuestionResolution.requestMessageId') = ?
        OR json_extract(payload_json, '$.privateInputResolution.requestMessageId') = ?) LIMIT 1`)
        .get(channelId, message.id, message.id, message.id),
    );
    const payload =
      typeof row?.payload_json === 'string' ? object(JSON.parse(row.payload_json)) : undefined;
    const decision = payload && resolutions.map((key) => object(payload[key])).find(Boolean);
    const state =
      typeof decision?.['outcome'] === 'string'
        ? decision['outcome']
        : typeof decision?.['state'] === 'string'
          ? decision['state']
          : (this.status?.(kind, message.author.slug, channelId, message.id) ?? 'pending');
    const base = {
      kind,
      botSlug: message.author.slug,
      state,
      requestedAt: message.at,
      ...(typeof row?.created_at === 'string' ? { decidedAt: row.created_at } : {}),
    };
    if (!this.canApprove(human, message.author.slug, opaque)) return { masked: true, ...base };
    const decidedBy = z
      .object({ humanId: z.string(), displayName: z.string().optional() })
      .safeParse(decision?.['decidedBy']);
    return {
      masked: false,
      ...base,
      opaque,
      ...(decidedBy.success ? { decidedBy: decidedBy.data } : {}),
    };
  }

  project<T>(human: HumanContext, input: T, channelId?: string): T {
    const value = structuredClone(input);
    const authors = new Map<string, Extract<ChannelMessageAuthor, { kind: 'bot' }>>();
    const authorOf = (slug: string, recordedName?: string) => {
      const cached = authors.get(slug);
      if (cached) return cached;
      const row = this.database.read((db) =>
        db
          .prepare(
            "SELECT json_extract(body, '$.displayName') AS display_name FROM persona_bots WHERE slug = ?",
          )
          .get(slug),
      );
      const displayName = typeof row?.display_name === 'string' ? row.display_name : recordedName;
      const author = {
        kind: 'bot',
        slug,
        ...(displayName === undefined ? {} : { displayName }),
      } satisfies ChannelMessageAuthor;
      authors.set(slug, author);
      return author;
    };
    const cards = new Map<string, ApprovalCard | undefined>();
    const messages = new Map<string, ChannelMessage | undefined>();
    const read = (channel: string, id: string): ChannelMessage | undefined => {
      const key = channel + ':' + id;
      if (!messages.has(key)) messages.set(key, this.channels.message(channel, id));
      return messages.get(key);
    };
    const opaqueReaders = new Map<string, boolean>();
    const visit = (entry: unknown, inherited?: string, inheritedBot?: string): void => {
      if (Array.isArray(entry)) {
        for (const item of entry) visit(item, inherited, inheritedBot);
        return;
      }
      if (entry === null || typeof entry !== 'object') return;
      const record = object(entry)!;
      const bot = typeof record['slug'] === 'string' ? record['slug'] : inheritedBot;
      if (
        bot &&
        typeof record['activeToolCount'] === 'number' &&
        typeof record['startedAt'] === 'number'
      ) {
        if (!opaqueReaders.has(bot)) opaqueReaders.set(bot, this.canApprove(human, bot, true));
        if (!opaqueReaders.get(bot))
          for (const field of ['toolName', 'publicDetail', 'detailRefs'])
            Reflect.deleteProperty(entry, field);
      }
      const channel =
        typeof record['channelId'] === 'string'
          ? record['channelId']
          : (record['type'] === 'dm' || record['type'] === 'group') &&
              typeof record['id'] === 'string'
            ? record['id']
            : inherited;
      const messageId =
        typeof record['messageId'] === 'string'
          ? record['messageId']
          : typeof record['id'] === 'string' && record['author'] !== undefined
            ? record['id']
            : undefined;
      let message =
        channel &&
        messageId &&
        (record['author'] === undefined || kinds.some((key) => record[key] !== undefined))
          ? read(channel, messageId)
          : undefined;
      const reference = resolutions
        .map((key) => object(record[key])?.['requestMessageId'])
        .find((id) => typeof id === 'string');
      if (channel && typeof reference === 'string') message = read(channel, reference);
      const author = object(record['author']) ?? message?.author;
      if (channel && author?.kind === 'bot' && typeof author.slug === 'string')
        Reflect.set(
          entry,
          'author',
          authorOf(
            author.slug,
            typeof author.displayName === 'string' ? author.displayName : undefined,
          ),
        );
      const key = channel && message ? channel + ':' + message.id : undefined;
      if (key && channel && message && !cards.has(key))
        cards.set(key, this.card(human, channel, message));
      const card = key ? cards.get(key) : undefined;
      if (card) {
        Reflect.set(entry, 'approval', card);
        if (card.masked) {
          for (const key of Object.keys(record))
            if (
              ![
                'approval',
                'id',
                'at',
                'author',
                'replyTo',
                'channelId',
                'messageId',
                'category',
                'kind',
                'botSlug',
                'createdAt',
                'sourceEventId',
                'status',
                'revision',
                'isUnread',
              ].includes(key)
            )
              Reflect.deleteProperty(entry, key);
          for (const field of kinds)
            if (record[field] !== undefined) Reflect.set(entry, field, card);
          if (record['body'] !== undefined) Reflect.set(entry, 'body', '');
          if (record['summary'] !== undefined) Reflect.set(entry, 'summary', '');
          return;
        }
        for (const field of kinds) {
          const request = object(record[field]);
          if (request) {
            Reflect.set(Reflect.get(entry, field), 'opaque', card.opaque);
            if (card.decidedBy) Reflect.set(Reflect.get(entry, field), 'decidedBy', card.decidedBy);
          }
        }
        for (const key of resolutions)
          if (object(record[key]) && card.decidedBy)
            Reflect.set(Reflect.get(entry, key), 'decidedBy', card.decidedBy);
      }
      for (const item of Object.values(record)) visit(item, channel, bot);
      const nested = object(record['message']);
      if (
        nested &&
        object(Reflect.get(nested, 'approval'))?.['masked'] === true &&
        record['snippet'] !== undefined
      )
        Reflect.set(entry, 'snippet', '');
    };
    visit(value, channelId);
    return value;
  }
}
