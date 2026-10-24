import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createChannelStore } from '../src/channels/store.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { directToolTrace } from '../src/bots/tool-trace.js';
import { createBotRuntime } from '../src/runtime/bot-runtime.js';
import {
  createDshBotAgentAdapter,
  TURN_ONLY_BOT_TOOLS,
} from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot, FIXED_NOW, trackTestOwner } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestWorkspaceGrants } from './workspace-grant-fixture.js';

const repo = join(import.meta.dirname, '../../..');

function botToolNamesFrom(source: string): string[] {
  const block = /const BOT_TOOL_NAMES = new Set\(\[([\s\S]*?)\]\)/.exec(source);
  return block === null ? [] : [...block[1]!.matchAll(/'([a-z_]+)'/g)].map((name) => name[1]!);
}

function setup() {
  const home = createTempRoot('botharness-direct-tools-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const host = new FakeAgentHost({ kind: 'completed' });
  const agents = createDshBotAgentAdapter({
    agents: host,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => join(home, 'memory'),
    ensureWorkspace: () => undefined,
  });
  const runtime = createBotRuntime({
    database: owner,
    grants: createTestWorkspaceGrants(owner, home),
    registry,
    channels,
    agents,
    now: FIXED_NOW,
  });
  return { runtime, channels, dm, host, registry };
}

describe('direct Bot tool runner', () => {
  it('removes obsolete delivery tools from the catalog and refuses direct execution', async () => {
    const { runtime } = setup();
    try {
      const names = runtime.directBotTools!().map((tool) => tool.name);
      for (const name of [
        'channel_send',
        'bridge_reply',
        'bridge_reply_file',
        'bridge_post',
        'bot_dm_send',
      ]) {
        expect(names).not.toContain(name);
        await expect(
          runtime.runDirectBotTool!('ada', name, {}, new AbortController().signal),
        ).rejects.toMatchObject({ code: 'tool-not-direct' });
      }
    } finally {
      await runtime.close();
    }
  });
  it('delivers an explicit local message through the same tool without a model turn', async () => {
    const { runtime, channels, dm, host } = setup();
    try {
      const sent = await runtime.runDirectBotTool!(
        'ada',
        'bot_send_message',
        { channel_id: dm.id, body: 'The checks passed.', end_turn: true },
        new AbortController().signal,
      );
      expect(sent.result).toMatchObject({
        channelId: dm.id,
        status: 'committed',
        inboxResolution: { outcome: 'not-requested' },
      });
      expect(channels.readMessages(dm.id)).toContainEqual(
        expect.objectContaining({
          body: 'The checks passed.',
          author: { kind: 'bot', slug: 'ada' },
        }),
      );
      expect(host.sessions).toHaveLength(0);
    } finally {
      await runtime.close();
    }
  });

  it('requests a workspace through the same production tool without the model', async () => {
    const { runtime, channels, dm } = setup();
    try {
      await runtime.runDirectBotTool!(
        'ada',
        'request_workspace_grant',
        { reason: 'Write the selected project', channel_id: dm.id },
        new AbortController().signal,
      );
      expect(channels.readMessages(dm.id)).toContainEqual(
        expect.objectContaining({ grantRequest: true, body: 'Write the selected project' }),
      );
    } finally {
      await runtime.close();
    }
  });

  it('lists runtime Bot tools while cloud_work has its dedicated direct CLI', () => {
    const { runtime } = setup();
    const listed = runtime.directBotTools!().map((tool) => tool.name);
    expect(listed).toContain('channel_list');
    expect(listed).toContain('bot_schedule_create');
    expect(listed).toContain('bridge_targets');
    for (const name of TURN_ONLY_BOT_TOOLS) expect(listed).not.toContain(name);
    const channelList = runtime.directBotTools!().find((tool) => tool.name === 'channel_list');
    expect(channelList?.inputSchema).toMatchObject({
      type: 'object',
      properties: { channel_id: { type: 'string' } },
    });

    const botTools = botToolNamesFrom(
      readFileSync(join(repo, 'packages/core/src/workspaces/grant-execution.ts'), 'utf8'),
    );
    const exempt = Object.keys(
      JSON.parse(readFileSync(join(repo, 'scripts/cli-parity-baseline.json'), 'utf8')).tools,
    );
    expect(listed.filter((name) => botTools.includes(name)).sort()).toEqual(
      botTools.filter((name) => !exempt.includes(name) && name !== 'cloud_work').sort(),
    );
    expect(listed.every((name) => botTools.includes(name))).toBe(true);
    expect(botTools).toContain('cloud_work');
    expect(exempt).not.toContain('cloud_work');
    expect(readFileSync(join(repo, 'packages/core/src/bots/cli-live.ts'), 'utf8')).toContain(
      "command: 'cloud-work'",
    );
  });

  it('runs a Bot tool as that Bot without a model turn and records it as session direct', async () => {
    const { runtime, channels, dm, host } = setup();
    const signal = new AbortController().signal;
    const listed = await runtime.runDirectBotTool!('ada', 'channel_list', {}, signal);
    expect(listed).toMatchObject({
      tool: 'channel_list',
      sessionId: 'direct',
      result: { channels: [{ id: dm.id, kind: 'human-dm' }] },
    });

    const sent = await runtime.runDirectBotTool!(
      'ada',
      'bot_send_message',
      { body: 'direct hello', channel_id: dm.id },
      signal,
    );
    const messageId = (sent.result as { messageId: string }).messageId;
    expect(channels.message(dm.id, messageId)).toMatchObject({
      body: 'direct hello',
      author: { kind: 'bot', slug: 'ada' },
    });
    expect(host.sessions).toHaveLength(0);

    const calls = runtime.directBotToolCalls!('ada');
    expect(calls.map((call) => [call.tool, call.outcome])).toEqual([
      ['channel_list', 'ok'],
      ['bot_send_message', 'ok'],
    ]);
    expect(directToolTrace(calls, { turns: 1 })).toEqual([
      {
        turn: 2,
        startedAt: calls[1]!.at,
        endReason: 'direct',
        noToolCalls: false,
        calls: [
          {
            name: 'bot_send_message',
            callId: calls[1]!.callId,
            args: { body: 'direct hello', channel_id: dm.id },
            outcome: 'ok',
            result: expect.stringContaining(messageId),
          },
        ],
      },
    ]);
  });

  it('keeps the tool checks and refuses what cannot run outside a Bot turn with codes', async () => {
    const { runtime, registry } = setup();
    const signal = new AbortController().signal;
    await expect(
      runtime.runDirectBotTool!('ada', 'bot_send_message', { body: 'no channel' }, signal),
    ).rejects.toThrow(/exactly one trusted reply source/);
    await expect(
      runtime.runDirectBotTool!('ada', 'channel_list', { limit: 'many' }, signal),
    ).rejects.toMatchObject({ code: 'invalid-args' });
    await expect(
      runtime.runDirectBotTool!('ada', 'create_assignment', {}, signal),
    ).rejects.toMatchObject({ code: 'tool-not-direct' });
    await expect(
      runtime.runDirectBotTool!('ada', 'ask_user_question', {}, signal),
    ).rejects.toMatchObject({ code: 'tool-not-direct' });
    await expect(
      runtime.runDirectBotTool!('nobody', 'channel_list', {}, signal),
    ).rejects.toMatchObject({ code: 'unknown-bot' });
    expect(runtime.directBotToolCalls!('ada').map((call) => call.outcome)).toEqual([
      'error',
      'error',
    ]);
    expect(registry.setPaused('ada', true).ok).toBe(true);
    await expect(
      runtime.runDirectBotTool!('ada', 'channel_list', {}, signal),
    ).rejects.toMatchObject({ code: 'bot-paused' });
  });
});
