import { humanContext, type HumanContext } from '../humans/context.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelStore } from '../channels/store.js';
import { botOwner } from '../team/bot-access.js';
import { initializeSteward, isSteward, readSteward } from './steward-role.js';
import type { ChannelMessage } from '../channels/channel.js';
import type { WorkspaceGrantStore } from '../workspaces/grants.js';

export interface TobHome {
  botSlug: string;
  channelId: string;
  workspacePath: string;
}
export interface TobSetting {
  scope: 'global';
  value: number;
  revision: number;
}
export interface TobSettingsProvider {
  describe(options: { redactSecrets: boolean }): { ns: string; value: unknown; revision: number }[];
  update(ns: string, patch: object, expectedRevision: number): Promise<void>;
}
export class TobError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'TobError';
  }
}
export function isTob(database: OperationalDatabaseModulePort, slug: string): boolean {
  return (
    database.read((db) =>
      db
        .prepare(
          'SELECT 1 FROM tob_identity t JOIN team_settings s ON s.owner_human_id = t.human_id WHERE t.bot_slug = ?',
        )
        .get(slug),
    ) !== undefined
  );
}
export interface TobService {
  ensure(human?: HumanContext): Promise<TobHome>;
  close(): Promise<void>;
  isTob(slug: string): boolean;
  isSteward(slug: string): boolean;
  stewardRole(): ReturnType<typeof readSteward>;
  steward(): Promise<{ botSlug: string }>;
  transferSteward(human: HumanContext, botSlug: string): Promise<{ botSlug: string }>;
  ownerId(): string;
  slug(human?: HumanContext): string | undefined;
  readSetting(): TobSetting;
  writeSetting(value: number, expectedRevision: number, authorize: () => void): Promise<TobSetting>;
}
export function createTobService(options: {
  database: OperationalDatabaseModulePort;
  registry: PersonaBotRegistry;
  channels: ChannelStore;
  workspaceRoot: string;
  workspaceFor?: (human: HumanContext) => string;
  ensureWorkspace?: (path: string) => Promise<{ id: string }>;
  grants: WorkspaceGrantStore;
  settings?: () => TobSettingsProvider | undefined;
}): TobService {
  const { database, registry, channels } = options;
  const ownerId = () =>
    z
      .object({ owner_human_id: z.string() })
      .parse(database.read((db) => db.prepare('SELECT owner_human_id FROM team_settings').get()))
      .owner_human_id;
  const pending = new Map<string, Promise<TobHome>>();
  let closed = false;
  const prepare = async (human: HumanContext): Promise<TobHome> => {
    const slug = database.transaction((db) => {
      db.prepare('INSERT OR IGNORE INTO tob_identity (human_id, bot_slug) VALUES (?, ?)').run(
        human.humanId,
        'bot-' + randomUUID().replaceAll('-', ''),
      );
      return (
        db.prepare('SELECT bot_slug FROM tob_identity WHERE human_id = ?').get(human.humanId) as {
          bot_slug: string;
        }
      ).bot_slug;
    });
    const workspacePath =
      (options.workspaceFor ? join(options.workspaceFor(human), 'files') : undefined) ??
      join(options.workspaceRoot, slug);
    mkdirSync(workspacePath, { recursive: true });
    let bot = registry.get(slug);
    if (bot?.paused || (!bot && registry.getHistorical(slug))) {
      const role = readSteward(database);
      const current = role && registry.get(role.botSlug);
      if (!current || botOwner(current) !== human.humanId)
        throw new TobError('tob-identity-unavailable');
      const channel = channels.getOrCreateDm(human, current.slug, current.displayName);
      if (!channel) throw new TobError('tob-channel-unavailable');
      return { botSlug: current.slug, channelId: channel.id, workspacePath };
    }
    if (!bot) {
      const created = await registry.createAsync(
        {
          slug,
          ownerHumanId: human.humanId,
          displayName: 'Tob',
          workspaces: [workspacePath],
          persona: 'You are Tob. Help the Human with their requests.',
        },
        () => {
          const identity = database.read((db) =>
            db
              .prepare(`SELECT 1 FROM tob_identity t
          JOIN humans h ON h.human_id = t.human_id
          JOIN team_settings s ON s.owner_human_id = t.human_id
          WHERE t.human_id = ? AND t.bot_slug = ? AND h.status = 'active'`)
              .get(human.humanId, slug),
          );
          if (!identity) throw new TobError('tob-identity-unavailable');
        },
      );
      if (!created.ok) throw new TobError(created.reason);
      bot = created.record;
    }
    if (readSteward(database) === undefined)
      database.transaction((db) => initializeSteward(db, slug), ['steward']);
    if (options.ensureWorkspace) {
      const workspace = await options.ensureWorkspace(workspacePath);
      const current = registry.get(slug);
      if (!current || current.ownerHumanId !== human.humanId || human.humanId !== ownerId())
        throw new TobError('tob-identity-unavailable');
      if (!options.grants.list(slug).some((grant) => grant.workspaceId === workspace.id)) {
        const grant = await options.grants.create(slug, workspace.id);
        options.grants.setOrchestratorWrite(slug, grant.id, true);
      }
    }
    const channel = channels.getOrCreateDm(human, slug, bot.displayName);
    if (!channel) throw new TobError('tob-channel-unavailable');
    return { botSlug: slug, channelId: channel.id, workspacePath };
  };
  const provider = (): TobSettingsProvider => {
    const settings = options.settings?.();
    if (!settings) throw new TobError('settings-unavailable');
    return settings;
  };
  const readSetting = (): TobSetting => {
    const descriptor = provider()
      .describe({ redactSecrets: true })
      .find((x) => x.ns === 'botharness-client');
    if (!descriptor) throw new TobError('settings-unavailable');
    const value =
      (descriptor.value as { assignmentConcurrencyLimit?: unknown }).assignmentConcurrencyLimit ??
      8;
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 32)
      throw new TobError('invalid-setting');
    return { scope: 'global', value: Number(value), revision: descriptor.revision };
  };
  const service: TobService = {
    async ensure(human = humanContext(ownerId())) {
      if (closed) throw new TobError('tob-closed');
      if (human.humanId !== ownerId()) throw new TobError('tob-unavailable');
      let current = pending.get(human.humanId);
      if (!current) {
        current = prepare(human).finally(() => {
          pending.delete(human.humanId);
        });
        pending.set(human.humanId, current);
      }
      return current;
    },
    async close() {
      closed = true;
      await Promise.allSettled(pending.values());
    },
    isTob: (slug) => isTob(database, slug),
    isSteward: (slug) => isSteward(database, slug),
    stewardRole: () => readSteward(database),
    ownerId,
    async steward() {
      await service.ensure();
      const role = readSteward(database);
      if (!role) throw new TobError('steward-unavailable');
      return { botSlug: role.botSlug };
    },
    async transferSteward(human, botSlug) {
      const requireOwner = () => {
        if (human.caller === 'bot' || human.humanId !== ownerId())
          throw new TobError('permission-required');
      };
      requireOwner();
      await service.steward();
      requireOwner();
      const previous = readSteward(database);
      const next = registry.get(botSlug);
      if (!previous || !next || botOwner(next) !== human.humanId)
        throw new TobError('bot-not-found');
      if (next.paused) throw new TobError('archived-bot');
      if (previous.botSlug === botSlug) return { botSlug };
      const former = registry.get(previous.botSlug);
      if (!former || !channels.appendSystemNotices) throw new TobError('steward-unavailable');
      const from = channels.getOrCreateDm(
        humanContext(botOwner(former)),
        former.slug,
        former.displayName,
      );
      const to = channels.getOrCreateDm(human, next.slug, next.displayName);
      if (!from || !to) throw new TobError('steward-unavailable');
      const message: ChannelMessage = {
        id: `steward-transfer-${randomUUID()}`,
        at: new Date().toISOString(),
        author: { kind: 'system' },
        body: `${next.displayName} is now the Steward.`,
        stewardTransfer: { botSlug, botName: next.displayName },
      };
      const committed = channels.appendSystemNotices(
        [from, to].map((channel) => ({ channelId: channel.id, message })),
        (db) => {
          const result = db
            .prepare(`
            UPDATE steward_role SET bot_slug = ?, revision = revision + 1
            WHERE singleton = 1 AND revision = ?
              AND EXISTS (SELECT 1 FROM team_settings WHERE owner_human_id = ?)
              AND EXISTS (
                SELECT 1 FROM persona_bots
                WHERE slug = ? AND owner_human_id = ?
                  AND COALESCE(json_extract(body, '$.paused'), 0) = 0
                  AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions WHERE slug = ?)
              )
          `)
            .run(botSlug, previous.revision, human.humanId, botSlug, human.humanId, botSlug);
          if (result.changes !== 1) return false;
          db.prepare(`
            UPDATE tob_memory_leases SET revoked_at = ?, revoke_reason = 'steward-transferred'
            WHERE tob_slug = ? AND revoked_at IS NULL
          `).run(message.at, previous.botSlug);
          return true;
        },
      );
      if (!committed) throw new TobError('steward-changed');
      return { botSlug };
    },
    slug: (human = humanContext(ownerId())) =>
      (
        database.read((db) =>
          db
            .prepare(
              'SELECT bot_slug FROM tob_identity t JOIN team_settings s ON s.owner_human_id = t.human_id WHERE t.human_id = ?',
            )
            .get(human.humanId),
        ) as { bot_slug: string } | undefined
      )?.bot_slug,
    readSetting,
    async writeSetting(value, expectedRevision, authorize) {
      if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > 32 ||
        !Number.isSafeInteger(expectedRevision)
      )
        throw new TobError('invalid-setting');
      authorize();
      if (readSetting().revision !== expectedRevision) throw new TobError('stale-setting');
      try {
        await provider().update(
          'botharness-client',
          { assignmentConcurrencyLimit: value },
          expectedRevision,
        );
      } catch (error) {
        if ((error as { code?: string }).code === 'SETTINGS_CONFLICT')
          throw new TobError('stale-setting');
        throw new TobError('setting-outcome-uncertain');
      }
      const saved = readSetting();
      if (saved.value !== value) throw new TobError('setting-readback-mismatch');
      return saved;
    },
  };
  return service;
}
