import { humanContext, type HumanContext } from '../humans/context.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelStore } from '../channels/store.js';
import { botOwner } from '../team-policy/bot-access.js';
import {
  canManageGrants,
  grantAllManagement,
  holdsManagementGrant,
  managementGrantHolders,
  managementGrants,
  writeManagementGrant,
  type ManagementCapability,
} from './management-grants.js';
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
export interface ManagementGrantChange {
  botSlug: string;
  capabilities: ManagementCapability[];
  changed: boolean;
  noAppManager: boolean;
}
export interface TobService {
  ensure(human?: HumanContext): Promise<TobHome>;
  close(): Promise<void>;
  isTob(slug: string): boolean;
  managementGrants(slug: string): ManagementCapability[];
  holdsManagementGrant(slug: string, capability?: ManagementCapability): boolean;
  managementGrantHolders(
    ownerHumanId?: string,
  ): { botSlug: string; capabilities: ManagementCapability[] }[];
  canManageGrants(human: HumanContext): boolean;
  setManagementGrant(
    human: HumanContext,
    botSlug: string,
    capability: ManagementCapability,
    enabled: boolean,
  ): ManagementGrantChange;
  onOwnerChanged(): Promise<void>;
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
    if (bot?.paused || (!bot && registry.getHistorical(slug)))
      throw new TobError('tob-identity-unavailable');
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
      database.transaction(
        (db) => grantAllManagement(db, slug, new Date().toISOString()),
        ['management-grants'],
      );
    }
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
    managementGrants: (slug) => managementGrants(database, slug),
    holdsManagementGrant: (slug, capability) => holdsManagementGrant(database, slug, capability),
    managementGrantHolders: (ownerHumanId) => managementGrantHolders(database, ownerHumanId),
    canManageGrants: (human) => human.caller !== 'bot' && canManageGrants(database, human.humanId),
    ownerId,
    setManagementGrant(human, botSlug, capability, enabled) {
      if (human.caller === 'bot' || !canManageGrants(database, human.humanId))
        throw new TobError('permission-required');
      const bot = registry.get(botSlug);
      if (!bot || botOwner(bot) !== human.humanId) throw new TobError('bot-not-found');
      if (enabled && bot.paused) throw new TobError('archived-bot');
      const at = new Date().toISOString();
      const message: ChannelMessage = {
        id: `management-grant-${randomUUID()}`,
        at,
        author: { kind: 'system' },
        body: enabled
          ? `${bot.displayName} can now ${capability === 'manage-app' ? 'manage the App' : 'manage other Bots'}.`
          : `${bot.displayName} can no longer ${capability === 'manage-app' ? 'manage the App' : 'manage other Bots'}.`,
        managementGrant: { botSlug, botName: bot.displayName, capability, enabled },
      };
      const write = (db: Parameters<typeof grantAllManagement>[0]) => {
        const changed = writeManagementGrant(db, botSlug, capability, enabled, at);
        if (changed && !enabled && capability === 'manage-bots')
          db.prepare(`
            UPDATE tob_memory_leases SET revoked_at = ?, revoke_reason = 'management-grant-revoked'
            WHERE tob_slug = ? AND revoked_at IS NULL
          `).run(at, botSlug);
        return changed;
      };
      const dm = channels.getOrCreateDm(human, bot.slug, bot.displayName);
      let changed: boolean;
      if (dm && channels.appendSystemNotices) {
        let wrote = false;
        channels.appendSystemNotices([{ channelId: dm.id, message }], (db) => {
          wrote = write(db);
          return wrote;
        });
        changed = wrote;
      } else changed = database.transaction((db) => write(db), ['management-grants']);
      return {
        botSlug,
        capabilities: managementGrants(database, botSlug),
        changed,
        noAppManager: !managementGrantHolders(database, human.humanId).some((holder) =>
          holder.capabilities.includes('manage-app'),
        ),
      };
    },
    async onOwnerChanged() {
      const home = await service.ensure();
      database.transaction(
        (db) => grantAllManagement(db, home.botSlug, new Date().toISOString()),
        ['management-grants'],
      );
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
