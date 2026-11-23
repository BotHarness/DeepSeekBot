import { vi } from 'vitest';
import { join } from 'node:path';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { TeamService } from '../src/team/service.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createUsageProjection } from '../src/usage/usage.js';
import { createModelPresetStore } from '../src/models/presets.js';
import { createRoutingGroupStore } from '../src/models/routing-groups.js';
import type { ModelCatalogEntry } from '../src/models/catalog.js';

export const permitted = { provider: 'provider', model: 'allowed' };
export const now = new Date('2026-11-14T12:00:00Z');
export function teamModelFixture() {
  const root = createTempRoot('team-usage-models-');
  const registry = createTestRegistry({ rootDir: root });
  const db = registryDatabase(root);
  const database = attachOperationalModule(db, 'team');
  const channels = createSqliteChannelStore({ database, rootDir: join(root, 'channels') });
  const team = new TeamService(database, channels);
  const member = humanContext('member-id');
  database.transaction(
    (db) => {
      db.prepare(
        "INSERT INTO humans (human_id, display_name, status, created_at) VALUES (?, 'Member', 'active', ?)",
      ).run(member.humanId, now.toISOString());
      db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(member.humanId);
      db.prepare('UPDATE team_settings SET enabled = 1').run();
    },
    ['team'],
  );
  registry.create({ slug: 'ada', displayName: 'Ada', ownerHumanId: member.humanId });
  registry.create({ slug: 'bob', displayName: 'Bob' });
  const ownership = createTestOwnership({ session: { botSlug: 'ada', rootRole: 'orchestrator' } });
  const usage = createUsageProjection({
    database: db,
    ownership,
    now: () => now,
    botOwner: (slug) => registry.get(slug)?.ownerHumanId ?? team.ownerContext().humanId,
  });
  const catalog = {
    list: vi.fn(async (): Promise<ModelCatalogEntry[]> => [
      {
        ...permitted,
        providerName: 'Provider',
        modelName: 'Allowed',
        efforts: [],
        credential: 'missing',
      },
    ]),
    validate: vi.fn(async () => {}),
    defaultRoute: () => permitted,
  };
  const deps = {
    registry,
    channels,
    team,
    usage,
    ownership,
    states: createBotStateTracker(),
    roster: createTestRosterStore({ database: db }),
    modelCatalog: catalog,
    modelPresets: createModelPresetStore({ rootDir: root, database: db }),
    routingGroups: createRoutingGroupStore({ database: db }),
  };
  const methods = createBridgeMethods(member, deps);
  const ownerMethods = createBridgeMethods(owner, deps);
  const restrict = () =>
    team.roles.update(owner, 'member', { models: { kind: 'only', routes: ['provider/allowed'] } });
  const fold = (seq: number, total: number) =>
    usage.handleSessionEvent('session', {
      type: 'assistant/message',
      seq,
      time: now.getTime() + seq,
      data: {
        message: { source: permitted },
        usage: {
          inputTokens: total,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: total,
        },
      },
    });
  return {
    root,
    channels,
    database,
    db,
    registry,
    team,
    member,
    methods,
    ownerMethods,
    usage,
    catalog,
    deps,
    restrict,
    fold,
  };
}
