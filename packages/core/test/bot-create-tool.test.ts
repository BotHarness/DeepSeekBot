import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dmChannelId } from '../src/channels/channel.js';
import { isChannelNotice } from '../src/channels/channel-notice.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { CORE_MEMORY_TEMPLATE } from '../src/memory/soul.js';
import { createBotRuntime, DirectBotToolError } from '../src/runtime/bot-runtime.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot, FIXED_NOW, trackTestOwner } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestWorkspaceGrants } from './workspace-grant-fixture.js';

const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from('tiny-avatar-body'),
]);

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
  channels.getOrCreateDm('ada', 'Ada');
  const agents = createDshBotAgentAdapter({
    agents: new FakeAgentHost({ kind: 'completed' }),
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => join(home, 'memory'),
    ensureWorkspace: () => undefined,
  });
  let next = 0;
  const runtime = createBotRuntime({
    database: owner,
    grants: createTestWorkspaceGrants(owner, work),
    registry,
    channels,
    agents,
    now: FIXED_NOW,
    createBotId: () => `bot-new${++next}`,
  });
  const create = async (args: Record<string, unknown>) =>
    (await runtime.runDirectBotTool!('ada', 'bot_create', args, new AbortController().signal))
      .result as Record<string, unknown>;
  const refusal = async (args: Record<string, unknown>) => {
    try {
      await create(args);
    } catch (error) {
      expect(error).toBeInstanceOf(DirectBotToolError);
      return (error as DirectBotToolError).code;
    }
    throw new Error('bot_create unexpectedly succeeded');
  };
  return { home, work, registry, channels, owner, create, refusal };
}

describe('bot_create Bot tool', () => {
  it('creates a PersonaBot with profile, Soul, Core Memory, Avatar and a DM', async () => {
    const { work, registry, channels, owner, create } = setup();
    const avatar = join(work, 'tim.png');
    writeFileSync(avatar, PNG);

    const result = await create({
      display_name: 'Tim',
      description: 'Translates release notes.',
      tags: ['translator', ' zh-en ', 'translator'],
      avatar_path: avatar,
      soul: '# Tim\nCalm and precise.',
      core_memory: '# Core Memory\n- The Human ships on Fridays.',
    });

    expect(result).toEqual({
      bot_id: 'bot-new1',
      display_name: 'Tim',
      dm_channel_id: dmChannelId('bot-new1'),
      memory_dir: registry.memoryDirFor('bot-new1'),
      model: 'host-default',
    });
    const record = registry.get('bot-new1')!;
    expect(record).toMatchObject({
      displayName: 'Tim',
      description: 'Translates release notes.',
      roles: ['translator', 'zh-en'],
      avatar: `data:image/png;base64,${PNG.toString('base64')}`,
    });
    expect(record.workspaces).toEqual([]);
    expect(record.modelPlan).toBeUndefined();
    const memory = registry.memoryDirFor('bot-new1')!;
    expect(readFileSync(join(memory, 'SOUL.md'), 'utf8')).toBe('# Tim\nCalm and precise.');
    expect(readFileSync(join(memory, 'MEMORY.md'), 'utf8')).toBe(
      '# Core Memory\n- The Human ships on Fridays.',
    );
    expect(channels.get(dmChannelId('bot-new1'))).toMatchObject({
      type: 'dm',
      botSlug: 'bot-new1',
    });

    const notices = channels
      .queryMessages(dmChannelId('ada'), {})
      .messages.filter((message) => isChannelNotice(message));
    expect(notices).toEqual([
      expect.objectContaining({
        author: { kind: 'bot', slug: 'ada' },
        body: '',
        botCreateAction: { botSlug: 'bot-new1', displayName: 'Tim' },
      }),
    ]);
    const admission = attachOperationalModule(owner, 'test-read').read((db) =>
      db
        .prepare(
          `SELECT a.reason, a.attempt_state FROM inbox_admissions a
             JOIN source_events e ON e.source_event_id = a.source_event_id
            WHERE e.message_id = ?`,
        )
        .get(notices[0]!.id),
    );
    expect(admission).toEqual({ reason: 'bot-action', attempt_state: 'handled' });
  });

  it('uses the default Avatar, Core Memory template and Memory location when only a name is given', async () => {
    const { home, registry, create } = setup();
    const result = await create({ display_name: 'Tim' });
    const record = registry.get('bot-new1')!;
    expect(record.avatar).toBeUndefined();
    expect(record.banner).toBeDefined();
    expect(result['memory_dir']).toBe(join(home, 'bots', 'bot-new1', 'memory'));
    expect(readFileSync(join(result['memory_dir'] as string, 'MEMORY.md'), 'utf8')).toBe(
      CORE_MEMORY_TEMPLATE,
    );
    expect(existsSync(join(result['memory_dir'] as string, 'SOUL.md'))).toBe(false);
  });

  it('allows a duplicate name and keeps each Bot independent', async () => {
    const { registry, create } = setup();
    await create({ display_name: 'Tim' });
    await create({ display_name: 'Tim' });
    expect(
      registry
        .list()
        .filter((bot) => bot.displayName === 'Tim')
        .map((bot) => bot.slug),
    ).toEqual(['bot-new1', 'bot-new2']);
  });

  it('creates the Memory Repository inside a chosen Memory location', async () => {
    const { home, create, refusal } = setup();
    const location = join(home, 'elsewhere');
    mkdirSync(location);
    const result = await create({ display_name: 'Tim', memory_location: location });
    expect(result['memory_dir']).toBe(join(location, 'bot-new1'));
    expect(existsSync(join(location, 'bot-new1', 'MEMORY.md'))).toBe(true);

    expect(await refusal({ display_name: 'Tim', memory_location: 'relative/dir' })).toBe(
      'invalid-memory-dir',
    );
    expect(await refusal({ display_name: 'Tim', memory_location: join(home, 'missing') })).toBe(
      'invalid-memory-dir',
    );
  });

  it('refuses a bad Avatar or input and creates nothing', async () => {
    const { home, work, registry, refusal } = setup();
    const outside = join(home, 'outside.png');
    writeFileSync(outside, PNG);
    const text = join(work, 'avatar.txt');
    writeFileSync(text, 'not an image');
    const large = join(work, 'large.png');
    writeFileSync(large, Buffer.concat([PNG, Buffer.alloc(200_000)]));

    expect(await refusal({ display_name: 'Tim', avatar_path: outside })).toBe('invalid-avatar');
    expect(await refusal({ display_name: 'Tim', avatar_path: text })).toBe('invalid-avatar');
    expect(await refusal({ display_name: 'Tim', avatar_path: large })).toBe('invalid-avatar');
    expect(await refusal({ display_name: 'Tim', avatar_path: 'tim.png' })).toBe('invalid-avatar');
    expect(await refusal({ display_name: 'Tim', description: 'x'.repeat(161) })).toBe(
      'invalid-input',
    );
    expect(await refusal({ display_name: '   ' })).toBe('invalid-input');
    expect(
      await refusal({ display_name: 'Tim', tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }),
    ).toBe('invalid-input');
    expect(registry.list().map((bot) => bot.slug)).toEqual(['ada']);
  });
});
