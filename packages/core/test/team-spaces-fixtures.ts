import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { afterEach } from 'vitest';
import { realpathSync } from 'node:fs';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { humanContext } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';

export const alice = humanContext('alice');
export const bob = humanContext('bob');
export const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.contentPurge.memberSettled().catch(() => {});
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
export function fixture(home = realpathSync(createTempRoot('m6-spaces-'))) {
  const extra: { id: string; path: string; title: string; status(): Promise<'ok'> }[] = [];
  const core = createCore({
    dshHome: home,
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
    }),
    workspaces: () => ({ get: (id) => extra.find((entry) => entry.id === id), list: () => extra }),
  });
  cores.push(core);
  const db = attachOperationalModule(core.operationalDatabase, 'm6-test');
  db.transaction((connection) => {
    for (const human of [alice, bob]) {
      connection
        .prepare("INSERT OR IGNORE INTO humans VALUES (?, ?, 'active', '2026-11-14')")
        .run(human.humanId, human.humanId);
      connection
        .prepare("INSERT OR IGNORE INTO human_roles VALUES (?, 'member')")
        .run(human.humanId);
    }
    connection.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  for (const human of [alice, bob]) core.spaces.ensureAccount(human.humanId);
  const bridge = createBridgeMethodsForHumans(core);
  const workspace = (path: string, id = path) => {
    const entry = { id, path, title: id, status: async () => 'ok' as const };
    extra.push(entry);
    return id;
  };
  const createBot = (human = alice, slug = human.humanId + '-bot') => {
    const created = core.registry.create({ slug, displayName: slug, ownerHumanId: human.humanId });
    if (!created.ok) throw new Error(created.reason);
    return created.record;
  };
  return { core, home, db, bridge, workspace, createBot };
}
