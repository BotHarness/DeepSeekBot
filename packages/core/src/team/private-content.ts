import { botProfileFingerprint } from '../bots/profile-snapshot.js';
import type { BotAdminAction } from './bot-administration.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelStore } from '../channels/store.js';
import type { ChannelMessageAuthor } from '../channels/message-author.js';
import type { HumanContext } from '../humans/context.js';
import type { MemoryAcceptance } from '../memory/accepted.js';
import type { TeamRoles } from './roles.js';
import type { TeamChannels } from './channels.js';
import { TeamError } from './error.js';
import { PrivateAudit } from './audit.js';
import { botOwner } from './bot-access.js';
import {
  auditListSchema,
  privateListSchema,
  privateOpenSchema,
  privatePageSchema,
  type PrivateObject,
  type PrivateObjectListing,
} from './private-contract.js';

const VIEW_TTL = 30 * 60 * 1000;
const MAX_VIEWS = 128;
const PAGE_SIZE = 50;
type ContentProvider = {
  registry: PersonaBotRegistry;
  memory: Pick<MemoryAcceptance, 'snapshot' | 'readAccepted'>;
};
type View = { humanId: string; expires: number; object: PrivateObject };

export class TeamPrivateContent {
  private provider: ContentProvider | undefined;
  private readonly views = new Map<string, View>();
  private readonly audit: PrivateAudit;
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly channels: ChannelStore,
    private readonly roles: TeamRoles,
    private readonly channelAccess: TeamChannels,
    private readonly now: () => number,
  ) {
    this.audit = new PrivateAudit(db);
  }

  bind(provider: ContentProvider): void {
    this.provider = provider;
  }
  closeViews(): void {
    this.views.clear();
  }

  private require(human: HumanContext, permission: 'privateContent.view' | 'audit.view'): void {
    if (human.caller === 'bot')
      throw new TeamError('permission-required', undefined, { permission });
    this.roles.require(human, permission);
  }

  private candidates(): PrivateObject[] {
    const provider = this.provider;
    if (!provider) throw new TeamError('unavailable');
    const bots = provider.registry.list();
    const objects: PrivateObject[] = bots.map((bot) => ({
      objectId: bot.slug,
      kind: 'bot',
      name: bot.displayName,
      ownerHumanIds: [botOwner(bot)],
    }));
    const privateGroups = new Map(
      z
        .array(z.object({ channel_id: z.string(), owner_human_id: z.string() }))
        .parse(
          this.db.read((db) =>
            db
              .prepare(
                `SELECT channel_id, owner_human_id FROM channel_records WHERE json_extract(record_json, '$.type') = 'group' AND json_extract(visibility_json, '$.kind') = 'private'`,
              )
              .all(),
          ),
        )
        .map((row) => [row.channel_id, row.owner_human_id]),
    );
    const bySlug = new Map(provider.registry.listHistorical().map((bot) => [bot.slug, bot]));
    for (const channel of this.channels.list()) {
      if (channel.deletedAt || channel.remoteBot) continue;
      if (channel.type === 'group') {
        const owner = privateGroups.get(channel.id);
        if (owner)
          objects.push({
            objectId: channel.id,
            kind: 'channel',
            name: channel.name,
            ownerHumanIds: [owner],
          });
        continue;
      }
      const owners =
        (channel.dmHumanId ? [channel.dmHumanId] : channel.humanParticipants) ??
        channel.members.flatMap((id) => {
          const bot = bySlug.get(id);
          return bot ? [botOwner(bot)] : [];
        });
      if (!owners.length) continue;
      objects.push({
        objectId: channel.id,
        kind: !channel.humanParticipants && channel.members.length > 1 ? 'bot-dm' : 'dm',
        name: channel.name,
        ownerHumanIds: [...new Set(owners)].sort(),
      });
    }
    return objects;
  }

  private own(human: HumanContext, object: PrivateObject): boolean {
    return (
      object.ownerHumanIds.includes(human.humanId) ||
      (object.kind === 'channel' && this.channelAccess.canRead(human, object.objectId))
    );
  }

  private blockedOwners(human: HumanContext, ids?: string[]): Set<string> {
    if (this.roles.isOwner(human)) return new Set();
    const permissions = this.roles.permissions(human);
    const scope = ids === undefined ? '' : 'h.human_id IN (SELECT value FROM json_each(?)) AND';
    const bindings =
      ids === undefined
        ? [JSON.stringify(permissions)]
        : [JSON.stringify(ids), JSON.stringify(permissions)];
    return new Set(
      z
        .array(z.object({ human_id: z.string() }))
        .parse(
          this.db.read((db) =>
            db
              .prepare(`SELECT h.human_id FROM humans h CROSS JOIN team_settings s
        WHERE ${scope} (
          h.human_id = s.owner_human_id OR EXISTS (
            SELECT 1 FROM human_roles m JOIN host_roles r USING(role_id), json_each(r.permissions_json) p
            WHERE m.human_id = h.human_id AND p.value NOT IN (SELECT value FROM json_each(?))))`)
              .all(...bindings),
          ),
        )
        .map((row) => row.human_id),
    );
  }

  objects(human: HumanContext, payload: unknown): PrivateObjectListing[] {
    this.require(human, 'privateContent.view');
    const input = privateListSchema.parse(payload);
    if (input.humanId !== undefined && input.username !== undefined)
      throw new TeamError('invalid-input');
    const username = input.username;
    const member =
      username === undefined
        ? undefined
        : this.db.read((db) =>
            db
              .prepare('SELECT human_id FROM member_credentials WHERE username = ? COLLATE NOCASE')
              .get(username),
          );
    if (input.username !== undefined && !member) throw new TeamError('object-not-found');
    const humanId = member
      ? z.object({ human_id: z.string() }).parse(member).human_id
      : input.humanId;
    const blocked = this.blockedOwners(human);
    const readable = this.channelAccess.visibleIds(human, false);
    const objects = this.candidates().filter(
      (object) =>
        !object.ownerHumanIds.includes(human.humanId) &&
        !(object.kind === 'channel' && readable.has(object.objectId)) &&
        !object.ownerHumanIds.some((id) => blocked.has(id)) &&
        (input.kind === undefined || object.kind === input.kind) &&
        (humanId === undefined || object.ownerHumanIds.includes(humanId)),
    );
    const owners = [...new Set(objects.flatMap((object) => object.ownerHumanIds))];
    const names = new Map(
      z
        .array(z.object({ human_id: z.string(), display_name: z.string() }))
        .parse(
          this.db.read((db) =>
            db
              .prepare(
                'SELECT human_id, display_name FROM humans WHERE human_id IN (SELECT value FROM json_each(?))',
              )
              .all(JSON.stringify(owners)),
          ),
        )
        .map((row) => [row.human_id, row.display_name]),
    );
    return objects.map((object) => ({
      ...object,
      ownerNames: object.ownerHumanIds.map((id) => names.get(id) ?? ''),
    }));
  }

  private resolve(
    human: HumanContext,
    kind: PrivateObject['kind'],
    objectId: string,
  ): PrivateObject {
    if (!this.provider) throw new TeamError('unavailable');
    let object: PrivateObject | undefined;
    if (kind === 'bot') {
      const bot = this.provider.registry.get(objectId);
      if (bot) object = { objectId, kind, name: bot.displayName, ownerHumanIds: [botOwner(bot)] };
    } else {
      const channel = this.channels.get(objectId);
      if (channel && !channel.deletedAt && !channel.remoteBot) {
        if (channel.type === 'group' && kind === 'channel') {
          const row = this.db.read((db) =>
            db
              .prepare(
                `SELECT owner_human_id FROM channel_records WHERE channel_id = ? AND json_extract(visibility_json, '$.kind') = 'private'`,
              )
              .get(objectId),
          );
          if (row)
            object = {
              objectId,
              kind,
              name: channel.name,
              ownerHumanIds: [z.object({ owner_human_id: z.string() }).parse(row).owner_human_id],
            };
        } else if (channel.type === 'dm') {
          const actualKind =
            !channel.humanParticipants && channel.members.length > 1 ? 'bot-dm' : 'dm';
          const owners =
            (channel.dmHumanId ? [channel.dmHumanId] : channel.humanParticipants) ??
            channel.members.flatMap((slug) => {
              const bot = this.provider?.registry.getHistorical(slug);
              return bot ? [botOwner(bot)] : [];
            });
          if (kind === actualKind && owners.length)
            object = {
              objectId,
              kind,
              name: channel.name,
              ownerHumanIds: [...new Set(owners)].sort(),
            };
        }
      }
    }
    if (!object) throw new TeamError('object-not-found');
    if (this.own(human, object)) throw new TeamError('own-content');
    if (this.blockedOwners(human, object.ownerHumanIds).size)
      throw new TeamError('permission-required', undefined, { permission: 'privateContent.view' });
    return object;
  }

  private messages(object: PrivateObject, before?: string) {
    const names = new Map<string, string | undefined>();
    const author = (value: ChannelMessageAuthor): ChannelMessageAuthor => {
      if (value.kind !== 'bot') return value;
      if (!names.has(value.slug)) {
        const bot =
          this.provider?.registry.get(value.slug) ??
          this.provider?.registry.getHistorical(value.slug);
        names.set(value.slug, bot?.displayName || undefined);
      }
      return {
        kind: 'bot',
        slug: value.slug,
        displayName: names.get(value.slug) ?? value.displayName ?? value.slug,
      };
    };
    const dm =
      object.kind === 'bot'
        ? this.db.read((db) =>
            db
              .prepare(`SELECT channel_id FROM channel_records
      WHERE json_extract(record_json,'$.type')='dm' AND json_extract(record_json,'$.botSlug') IS NOT NULL
      AND json_extract(record_json,'$.botSlug')=? AND coalesce(json_extract(record_json,'$.dmHumanId'),?)=? ORDER BY channel_id LIMIT 1`)
              .get(
                object.objectId,
                object.ownerHumanIds[0] ?? null,
                object.ownerHumanIds[0] ?? null,
              ),
          )
        : undefined;
    const channelId =
      object.kind === 'bot'
        ? typeof dm?.['channel_id'] === 'string'
          ? dm['channel_id']
          : undefined
        : object.objectId;
    if (channelId === undefined) return [];
    return this.channels
      .readMessages(channelId, {
        limit: PAGE_SIZE,
        ...(before === undefined ? {} : { before }),
      })
      .map((message) => ({
        ...message,
        author: author(message.author),
        ...(message.replyToPreview
          ? {
              replyToPreview: {
                ...message.replyToPreview,
                author: author(message.replyToPreview.author),
              },
            }
          : {}),
      }));
  }

  open(human: HumanContext, payload: unknown) {
    this.require(human, 'privateContent.view');
    const input = privateOpenSchema.parse(payload);
    const object = this.resolve(human, input.kind, input.objectId);
    for (const [id, view] of this.views) if (view.expires <= this.now()) this.views.delete(id);
    if (this.views.size >= MAX_VIEWS) throw new TeamError('private-views-full');
    const viewId = randomUUID();
    this.audit.append({
      at: new Date(this.now()).toISOString(),
      viewerHumanId: human.humanId,
      viewerName: z
        .object({ display_name: z.string() })
        .parse(
          this.db.read((db) =>
            db.prepare('SELECT display_name FROM humans WHERE human_id = ?').get(human.humanId),
          ),
        ).display_name,
      kind: object.kind,
      objectId: object.objectId,
      objectName: object.name,
      ownerHumanIds: object.ownerHumanIds,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
    const content = this.load(object);
    this.views.set(viewId, { humanId: human.humanId, expires: this.now() + VIEW_TTL, object });
    return { viewId, ...content };
  }

  private load(object: PrivateObject) {
    const provider = this.provider;
    if (object.kind !== 'bot' || !provider) return { object, messages: this.messages(object) };
    const bot = provider.registry.get(object.objectId);
    const profile = bot && { ...bot };
    const memoryFiles = provider.memory
      .snapshot(object.objectId)
      .files.map((path) => provider.memory.readAccepted(object.objectId, path))
      .filter((file) => file !== undefined);
    return {
      object: {
        ...object,
        profile,
        ...(bot ? { profileFingerprint: botProfileFingerprint(bot) } : {}),
      },
      messages: this.messages(object),
      memoryFiles,
    };
  }

  page(human: HumanContext, payload: unknown) {
    this.require(human, 'privateContent.view');
    const { viewId, before } = privatePageSchema.parse(payload);
    const view = this.views.get(viewId);
    if (!view || view.humanId !== human.humanId || view.expires <= this.now()) {
      if (view?.expires !== undefined && view.expires <= this.now()) this.views.delete(viewId);
      throw new TeamError('object-not-found');
    }
    const object = this.resolve(human, view.object.kind, view.object.objectId);
    if (JSON.stringify(object.ownerHumanIds) !== JSON.stringify(view.object.ownerHumanIds)) {
      this.views.delete(viewId);
      throw new TeamError('object-not-found');
    }
    return { messages: this.messages(object, before) };
  }

  recordBotAction(
    human: HumanContext,
    bot: Pick<PersonaBotRecord, 'slug' | 'displayName' | 'ownerHumanId'>,
    action: BotAdminAction,
    transaction?: DatabaseSync,
  ): void {
    if (human.caller === 'bot')
      throw new TeamError('permission-required', undefined, { permission: 'owner' });
    if (action === 'transfer' || action === 'memberPurgeConfirm')
      this.roles.requireManagementTarget(human, botOwner(bot));
    else this.roles.require(human, 'bots.manageAll');
    if (botOwner(bot) === human.humanId) return;
    this.audit.append(
      {
        at: new Date(this.now()).toISOString(),
        viewerHumanId: human.humanId,
        viewerName: z
          .object({ display_name: z.string() })
          .parse(
            this.db.read((db) =>
              db.prepare('SELECT display_name FROM humans WHERE human_id = ?').get(human.humanId),
            ),
          ).display_name,
        kind: 'bot',
        objectId: bot.slug,
        objectName: bot.displayName,
        ownerHumanIds: [botOwner(bot)],
        action,
      },
      transaction,
    );
  }

  log(human: HumanContext, payload: unknown) {
    this.require(human, 'audit.view');
    return this.audit.list(auditListSchema.parse(payload));
  }
  verify(human: HumanContext) {
    this.require(human, 'audit.view');
    return this.audit.verify();
  }
}
