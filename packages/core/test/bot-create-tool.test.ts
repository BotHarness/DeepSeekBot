import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotRuntime, DirectBotToolError } from '../src/runtime/bot-runtime.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot, FIXED_NOW, trackTestOwner } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestWorkspaceGrants } from './workspace-grant-fixture.js';

function setup() {
  const home = createTempRoot('botharness-bot-create-');
  const work = join(home, 'work');
  mkdirSync(work);
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const registry = createTestRegistry({
    rootDir: join(home, 'bots'),
    database: owner,
    now: FIXED_NOW,
  });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createSqliteChannelStore({
    rootDir: join(home, 'channels'),
    database: attachOperationalModule(owner, 'channel'),
    databaseOwnerReady: true,
    now: FIXED_NOW,
  });
  channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  const agents = createDshBotAgentAdapter({
    agents: new FakeAgentHost({ kind: 'completed' }),
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => join(home, 'memory'),
    ensureWorkspace: () => undefined,
  });
  const runtime = createBotRuntime({
    database: owner,
    grants: createTestWorkspaceGrants(owner, work),
    registry,
    channels,
    agents,
    now: FIXED_NOW,
  });
  return { runtime, registry };
}

it('refuses direct Bot creation and leaves the registry unchanged', async () => {
  const { runtime, registry } = setup();
  try {
    expect(runtime.directBotTools?.()?.map((tool) => tool.name)).not.toContain('bot_create');
    await expect(
      runtime.runDirectBotTool!(
        'ada',
        'bot_create',
        { display_name: 'Tim' },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(DirectBotToolError);
    expect(registry.list().map((bot) => bot.slug)).toEqual(['ada']);
  } finally {
    await runtime.close();
  }
});
