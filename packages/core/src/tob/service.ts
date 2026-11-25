import {
  botManagementGrants,
  managementCapability,
  type ManagementCapability,
} from '../authorization/bot-management.js';
import { humanContext, type HumanContext } from '../humans/context.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelStore } from '../channels/store.js';
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
  shareExportDirectory(human: HumanContext): string;
  isTob(slug: string): boolean;
  bindManagementPrompt(sessionId: string, slug: string): { text(): string; dispose(): void };
  refreshManagementPrompt(sessionId: string): void;
  managementGrants(slug: string): ManagementCapability[];
  hasManagementGrant(slug: string, capability?: ManagementCapability): boolean;
  isLastAppManager(slug: string): boolean;
  setManagementGrant(
    human: HumanContext,
    slug: string,
    capability: ManagementCapability,
    enabled: boolean,
  ): Promise<ManagementCapability[]>;
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
  const promptRefresh = new Map<string, () => void>();
  let closed = false;
  const prepare = async (human: HumanContext): Promise<TobHome> => {
    const slug = database.transaction((db) => {
      const existing = db
        .prepare('SELECT bot_slug FROM tob_identity WHERE human_id = ?')
        .get(human.humanId);
      if (typeof existing?.bot_slug === 'string') return existing.bot_slug;
      const slug = 'bot-' + randomUUID().replaceAll('-', '');
      db.prepare('INSERT INTO tob_identity (human_id, bot_slug) VALUES (?, ?)').run(
        human.humanId,
        slug,
      );
      const insertGrant = db.prepare(
        'INSERT INTO bot_management_grants (bot_slug, capability) VALUES (?, ?)',
      );
      for (const capability of managementCapability.options) insertGrant.run(slug, capability);
      return slug;
    });
    const workspacePath =
      (options.workspaceFor ? join(options.workspaceFor(human), 'files') : undefined) ??
      join(options.workspaceRoot, slug);
    mkdirSync(workspacePath, { recursive: true });
    let bot = registry.get(slug);
    if (!bot) {
      if (registry.getHistorical(slug)) throw new TobError('tob-identity-unavailable');
      const created = await registry.createAsync(
        {
          slug,
          ownerHumanId: human.humanId,
          displayName: 'Tob',
          workspaces: [workspacePath],
          persona:
            'You are Tob (Bot reversed; Thousands of Bot). Help the Human configure and use the App.',
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
  return {
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
      promptRefresh.clear();
    },
    shareExportDirectory(human) {
      if (human.humanId !== ownerId()) throw new TobError('permission-required');
      const workspace = options.workspaceFor?.(human);
      return workspace === undefined
        ? join(options.workspaceRoot, 'share-exports')
        : join(workspace, 'files', 'share-exports');
    },
    isTob: (slug) => isTob(database, slug),
    bindManagementPrompt(sessionId, slug) {
      const current = () => (botManagementGrants(database, slug).length > 0 ? TOB_CLI_PROMPT : '');
      let text = current();
      const refresh = () => {
        text = current();
      };
      promptRefresh.set(sessionId, refresh);
      return {
        text: () => text,
        dispose: () => {
          if (promptRefresh.get(sessionId) === refresh) promptRefresh.delete(sessionId);
        },
      };
    },
    refreshManagementPrompt: (sessionId) => promptRefresh.get(sessionId)?.(),
    managementGrants: (slug) => botManagementGrants(database, slug),
    hasManagementGrant(slug, capability) {
      const grants = botManagementGrants(database, slug);
      return capability === undefined ? grants.length > 0 : grants.includes(capability);
    },
    isLastAppManager(slug) {
      return (
        botManagementGrants(database, slug).includes('manage-app') &&
        !registry
          .list()
          .some(
            (bot) =>
              bot.slug !== slug && botManagementGrants(database, bot.slug).includes('manage-app'),
          )
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
    async setManagementGrant(human, slug, capability, enabled) {
      if (human.caller === 'bot' || human.humanId !== ownerId())
        throw new TobError('permission-required');
      const bot = registry.get(slug);
      if (!bot || bot.ownerHumanId !== human.humanId) throw new TobError('unknown-bot');
      if (bot.paused && enabled) throw new TobError('archived-bot');
      const channel = channels.getOrCreateDm(human, slug, bot.displayName);
      if (!channel) throw new TobError('tob-channel-unavailable');
      let attempted = false;
      const result = await channels.appendMessageOnce(
        human,
        channel.id,
        {
          id: 'management-grant-' + randomUUID(),
          at: new Date().toISOString(),
          author: { kind: 'system' },
          managementGrantChange: { capability, enabled },
          body: `[Host timeline] This Bot ${enabled ? 'can now' : 'can no longer'} manage ${capability === 'manage-app' ? 'the App' : 'other Bots'}.`,
        },
        undefined,
        undefined,
        (db) => {
          if (!db) throw new TobError('tob-channel-unavailable');
          attempted = true;
          const statement = enabled
            ? 'INSERT OR IGNORE INTO bot_management_grants (bot_slug, capability) VALUES (?, ?)'
            : 'DELETE FROM bot_management_grants WHERE bot_slug = ? AND capability = ?';
          return db.prepare(statement).run(slug, capability).changes > 0;
        },
      );
      if (!attempted && result.status !== 'existing') throw new TobError('tob-channel-unavailable');
      return botManagementGrants(database, slug);
    },
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
}

export const TOB_CLI_PROMPT =
  'For problems with the App, run deepseekbot capabilities and doctor first and use the CLI yourself.';
