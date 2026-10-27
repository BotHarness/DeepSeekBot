import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { createCore, type BotHarnessCore } from '../src/plugin.js';
import type { ModelCatalog } from '../src/models/catalog.js';
import { exportProfileBackup, restoreProfileBackup } from '../src/portability/package.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const route = { provider: 'deepseek', model: 'deepseek-v4-pro' };
const choice = { ...route, allowedEfforts: [''], defaultEffort: '' };
const catalog: ModelCatalog = { list: async () => [], validate: async () => undefined };
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
});

async function restoredHome() {
  const core = createCore({ dshHome: createTempRoot('bh-restore-model-source-') });
  cores.push(core);
  core.registry.create({ slug: 'keeper', displayName: 'Keeper' });
  const preset = core.modelPresets.create({
    name: 'Restored preset',
    orchestrator: route,
    assignmentDefault: route,
    assignmentModels: [choice],
  });
  expect(core.registry.applyModelPreset('keeper', preset).ok).toBe(true);
  const path = join(createTempRoot('bh-restore-model-archive-'), 'keeper.botharness-backup');
  await exportProfileBackup(
    {
      database: core.operationalDatabase,
      registry: core.registry,
      deletions: core.deletions,
      attachments: core.attachments,
      purge: core.contentPurge,
      version: 'test',
      runtimeVersions: async () => ({ host: '0.2.0-rc.1', tools: '0.2.0-rc.1' }),
      sessionCount: () => core.ownership.list().length,
    },
    path,
  );
  const destination = join(createTempRoot('bh-restore-model-target-'), 'restored');
  await restoreProfileBackup(readFileSync(path), destination);
  return destination;
}

it('keeps a restored and activated Bot replying after the Human changes its model', async () => {
  const home = await restoredHome();
  const runs: OrchestratorAgentRun[] = [];
  let ran!: () => void;
  const turned = new Promise<void>((resolve) => {
    ran = resolve;
  });
  const core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator(run) {
        runs.push(run);
        await run.channels.send({ body: 'Still here' });
        ran();
      },
      steerOrchestrator: () => false,
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    },
  });
  cores.push(core);
  await core.profileRecovery.authorizeModel('keeper', catalog);
  core.profileRecovery.activate('keeper', true);
  const plan = core.registry.get('keeper')!.modelPlan!;
  const changed = core.modelPresets.create({
    name: 'Changed after activation',
    orchestrator: { ...route, model: 'deepseek-v4-flash' },
    assignmentDefault: route,
    assignmentModels: [choice],
  });
  expect(core.registry.applyModelPreset('keeper', changed).ok).toBe(true);
  expect(core.registry.get('keeper')!.modelPlan!.revision).toBeGreaterThan(plan.revision);

  const dm = core.channels.getOrCreateDm('keeper', 'Keeper')!;
  await core.channels.appendMessage(dm.id, {
    id: 'after-model-change',
    at: '2026-10-27T00:00:00.000Z',
    author: { kind: 'human' },
    body: 'Are you there?',
  });
  expect(
    core.runtime.admitDmMessage({
      channelId: dm.id,
      messageId: 'after-model-change',
      body: 'Are you there?',
    }).admitted,
  ).toBe(true);
  const outcome = await Promise.race([
    turned.then(() => 'replied'),
    new Promise((resolve) => setTimeout(() => resolve('no Turn ran'), 3_000)),
  ]);
  expect(outcome).toBe('replied');
  expect(runs).toHaveLength(1);
  expect(core.channels.readMessages(dm.id).map((message) => message.body)).toContain('Still here');
  expect(() => core.profileRecovery.requireExecution('keeper')).not.toThrow();
  expect((await core.profileRecovery.status(catalog)).bots).toMatchObject([
    { slug: 'keeper', activated: true, reason: undefined },
  ]);
  expect(core.profileRecovery.activate('keeper', true)).toBe(
    (await core.profileRecovery.status(catalog)).bots[0]!.sessionId,
  );
});

it('names where to authorize while a restored Bot is not activated', async () => {
  const core = createCore({ dshHome: await restoredHome() });
  cores.push(core);
  expect(() => core.profileRecovery.requireExecution('keeper')).toThrow(
    'Settings → Environment backup',
  );
  expect(() => core.profileRecovery.activate('keeper', true)).toThrow(
    'Settings → Environment backup',
  );
});
