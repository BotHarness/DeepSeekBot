import { afterEach, expect } from 'vitest';
import { join } from 'node:path';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { TeamService } from '../src/team/service.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createBridgeMethodsForHumans, type BridgeMethodsDeps } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';

export const closes: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
export const alice = humanContext('alice'),
  bob = humanContext('bob'),
  carol = humanContext('carol');
export function fixture(
  sessions: Pick<BridgeMethodsDeps, 'nativeSessions' | 'readSessionTitles' | 'sessionLive'> = {},
) {
  const root = createTempRoot('m7-visibility-');
  const registry = createTestRegistry({ rootDir: root });
  const database = registryDatabase(root);
  const db = attachOperationalModule(database, 'team');
  const channels = createSqliteChannelStore({ database: db, rootDir: join(root, 'channels') });
  const team = new TeamService(db, channels);
  db.transaction((db) => {
    db.prepare('UPDATE team_settings SET enabled=1').run();
    for (const h of [alice, bob, carol]) {
      db.prepare("INSERT INTO humans VALUES (?,?,'active',?)").run(
        h.humanId,
        h.humanId,
        '2026-11-15T00:00:00Z',
      );
      db.prepare("INSERT INTO human_roles VALUES (?,'member')").run(h.humanId);
    }
  });
  for (const [slug, human] of [
    ['alice-bot', alice],
    ['bob-bot', bob],
    ['owner-bot', owner],
  ] as const) {
    expect(registry.create({ slug, displayName: slug, ownerHumanId: human.humanId }).ok).toBe(true);
    channels.getOrCreateDm(human, slug, slug);
  }
  closes.push(() => database.close());
  const states = createBotStateTracker();
  const ownership = createTestOwnership();
  const bridge = createBridgeMethodsForHumans({
    registry,
    channels,
    team,
    states,
    ownership,
    ...sessions,
    roster: createTestRosterStore({ database }),
  });
  return { root, registry, database, db, channels, team, bridge, states, ownership };
}
export function proactiveFixture(teamEnabled: boolean) {
  const root = createTempRoot('m7-proactive-');
  const core = createCore({
    dshHome: root,
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => {} }),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => join(root, 'memory'),
    }),
  });
  closes.push(async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const db = attachOperationalModule(core.operationalDatabase, 'team');
  db.transaction((db) => {
    db.prepare('UPDATE team_settings SET enabled=?').run(Number(teamEnabled));
    db.prepare("INSERT INTO humans VALUES ('bob','Bob','active','now')").run();
    db.prepare("INSERT INTO human_roles VALUES ('bob','member')").run();
  });
  core.team.spaces.ensureAccount('bob');
  expect(core.registry.create({ slug: 'helper', displayName: 'Helper' }).ok).toBe(true);
  const dm = core.channels.getOrCreateDm(owner, 'helper')!;
  return { core, db, dm };
}
export const everyone = { kind: 'public', audience: { kind: 'everyone' } } as const;
export function publicBot(f: ReturnType<typeof fixture>, slug = 'alice-bot') {
  f.team.bots.setVisibility(owner, slug, everyone);
}
export function post(id: string, author: 'human' | 'bot' = 'human', slug = 'alice-bot') {
  return {
    id,
    at: '2026-11-15T00:00:00Z',
    author: author === 'human' ? { kind: 'human' as const } : { kind: 'bot' as const, slug },
    body: id,
  };
}
