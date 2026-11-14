import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import {
  assertSupportedJsonSchema,
  type ToolDefinition,
  type ToolRunContext,
} from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

async function fixture(
  check: (
    tools: readonly ToolDefinition[],
    core: ReturnType<typeof createCore>,
    groupId: string,
  ) => Promise<void>,
) {
  const failures: unknown[] = [];
  let groupId = '';
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (_session, tools) => {
        try {
          await check(tools, core, groupId);
        } catch (error) {
          failures.push(error);
          throw error;
        }
      },
    },
  );
  const core = createCore({
    dshHome: createTempRoot('botharness-attention-contract-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bea', displayName: 'Bea' });
    groupId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Shared',
      members: ['ada', 'bea'],
    }).id;
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    await core.channels.appendMessageOnce(OWNER_HUMAN_CONTEXT, dm.id, {
      id: 'trigger',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Check attention',
    });
    core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: dm.id,
      messageId: 'trigger',
      body: 'Check attention',
    });
    await core.runtime.whenIdle();
    expect(failures).toEqual([]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

function tool(tools: readonly ToolDefinition[], name: string) {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error('Tool missing: ' + name);
  return found;
}
async function call(tools: readonly ToolDefinition[], name: string, args: unknown = {}) {
  return JSON.parse(String(await tool(tools, name).execute(args, {} as ToolRunContext)));
}

describe('attention Tool contracts through the owning Host', () => {
  it('searches only its own admitted history through the native Tool without observing or handling it', async () => {
    await fixture(async (tools, core) => {
      const t = tool(tools, 'inbox_history');
      expect(() => assertSupportedJsonSchema(t.parameters)).not.toThrow();
      const before = core.attention.list({ botSlug: 'ada' });
      const result = await call(tools, 'inbox_history', {
        query: 'attention',
        kind: 'dm',
        limit: 1,
      });
      expect(result.items).toEqual([
        expect.objectContaining({ kind: 'human-dm', snippet: 'Check attention' }),
      ]);
      expect(core.attention.list({ botSlug: 'ada' })).toEqual(before);
      expect(
        await call(tools, 'inbox_history', { query: 'attention', channel_id: 'missing' }),
      ).toEqual({ items: [] });
      await expect(call(tools, 'inbox_history', { query: '中文' })).rejects.toThrow('trigram');
    });
  });

  it('uses pinned supported integer schemas and exposes all five effective read/edit/reset contracts', async () => {
    await fixture(async (tools) => {
      const names = [
        'group_attention_get',
        'group_attention_set',
        'source_attention_get',
        'source_attention_set',
        'source_attention_reset',
      ];
      for (const name of names) {
        const t = tool(tools, name);
        expect(() => assertSupportedJsonSchema(t.parameters)).not.toThrow();
        expect(t.description).toContain('this PersonaBot');
      }
      expect(tool(tools, 'source_attention_set').parameters).toMatchObject({
        properties: {
          digestCount: { type: 'integer' },
          digestIntervalSeconds: { type: 'integer' },
        },
      });
      expect(tool(tools, 'group_attention_set').parameters).toMatchObject({
        properties: { count: { type: 'integer' }, interval_seconds: { type: 'integer' } },
      });
      const get = await call(tools, 'source_attention_get');
      expect(get.policies).toHaveLength(9);
      expect(get.policies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceClass: 'human-dm',
            recentWakeCount: 1,
            lastActor: { kind: 'built-in' },
            revision: 1,
            changedAt: expect.any(String),
          }),
        ]),
      );
    });
  });

  it('accepts the entire legal source matrix, defaults omitted class, preserves digest settings and resets', async () => {
    await fixture(async (tools, core) => {
      for (const wake of ['conditional', 'immediate']) {
        expect(await call(tools, 'source_attention_set', { wake })).toMatchObject({
          sourceClass: 'assignment-report',
          wake,
          lastActor: { kind: 'bot', botSlug: 'ada' },
        });
        expect(
          await call(tools, 'source_attention_set', { sourceClass: 'assignment-report', wake }),
        ).toMatchObject({ wake });
      }
      for (const wake of ['immediate', 'digest', 'mentions', 'silent']) {
        expect(
          await call(tools, 'source_attention_set', { sourceClass: 'group-ordinary', wake }),
        ).toMatchObject({ wake, digestCount: 5, digestIntervalSeconds: 30 });
      }
      expect(
        await call(tools, 'source_attention_set', {
          sourceClass: 'group-ordinary',
          wake: 'digest',
          digestCount: 100,
          digestIntervalSeconds: 3600,
        }),
      ).toMatchObject({ digestCount: 100, digestIntervalSeconds: 3600 });
      await call(tools, 'source_attention_set', { sourceClass: 'group-ordinary', wake: 'silent' });
      expect(
        await call(tools, 'source_attention_set', {
          sourceClass: 'group-ordinary',
          wake: 'digest',
        }),
      ).toMatchObject({ digestCount: 100, digestIntervalSeconds: 3600 });
      expect(
        await call(tools, 'source_attention_set', {
          sourceClass: 'group-ordinary',
          wake: 'digest',
          digestCount: 1,
          digestIntervalSeconds: 1,
        }),
      ).toMatchObject({ digestCount: 1, digestIntervalSeconds: 1 });
      expect(await call(tools, 'source_attention_reset')).toMatchObject({
        wake: 'conditional',
        overrideActive: false,
      });
      expect(
        await call(tools, 'source_attention_reset', { sourceClass: 'group-ordinary' }),
      ).toMatchObject({
        wake: 'digest',
        digestCount: 5,
        digestIntervalSeconds: 30,
        overrideActive: false,
      });
      expect(core.sourcePolicy.list('bea').every((p) => p.revision === 1)).toBe(true);
    });
  });

  it('edits and restores only its own immediate delivery with audited Bot revisions', async () => {
    await fixture(async (tools, core) => {
      const other = core.sourcePolicy.list('bea');
      for (const sourceClass of ['human-dm', 'bot-dm', 'group-mention']) {
        expect(
          await call(tools, 'source_attention_set', {
            sourceClass,
            wake: 'immediate',
            delivery: 'turn',
          }),
        ).toMatchObject({
          sourceClass,
          admission: 'admit',
          wake: 'immediate',
          delivery: 'turn',
          revision: 2,
          overrideActive: true,
          lastActor: { kind: 'bot', botSlug: 'ada' },
        });
        expect(
          await call(tools, 'source_attention_set', {
            sourceClass,
            wake: 'immediate',
            delivery: 'steer',
          }),
        ).toMatchObject({ delivery: 'steer', revision: 3, overrideActive: true });
        expect(await call(tools, 'source_attention_reset', { sourceClass })).toMatchObject({
          sourceClass,
          admission: 'admit',
          wake: 'immediate',
          delivery: 'steer',
          revision: 4,
          overrideActive: false,
          lastActor: { kind: 'bot', botSlug: 'ada' },
        });
      }
      expect(core.sourcePolicy.list('bea')).toEqual(other);
    });
  });

  it('rejects invalid source combinations and numeric bounds without changing effective rules or revisions', async () => {
    await fixture(async (tools, core) => {
      const baseline = core.sourcePolicy.list('ada');
      const invalid: unknown[] = [
        { wake: 'digest' },
        { sourceClass: 'assignment-report', wake: 'silent' },
        { wake: 'immediate', digestCount: 5 },
        { sourceClass: 'group-ordinary', wake: 'conditional' },
        ...['human-dm', 'bot-dm', 'group-mention'].flatMap((sourceClass) => [
          { sourceClass, wake: 'immediate' },
          { sourceClass, wake: 'silent', delivery: 'turn' },
          { sourceClass, wake: 'immediate', delivery: 'invalid' },
          { sourceClass, wake: 'immediate', delivery: 'turn', digestCount: 5 },
          { sourceClass, wake: 'immediate', delivery: 'turn', digestIntervalSeconds: 30 },
        ]),
        { wake: 'immediate', delivery: 'turn' },
        { sourceClass: 'group-ordinary', wake: 'immediate', delivery: 'turn' },
        { sourceClass: 'group-invite', wake: 'immediate', delivery: 'turn' },
        ...['immediate', 'mentions', 'silent'].flatMap((wake) => [
          { sourceClass: 'group-ordinary', wake, digestCount: 5 },
          { sourceClass: 'group-ordinary', wake, digestIntervalSeconds: 30 },
        ]),
        ...[0, 101, 1.5].map((digestCount) => ({
          sourceClass: 'group-ordinary',
          wake: 'digest',
          digestCount,
        })),
        ...[0, 3601, 1.5].map((digestIntervalSeconds) => ({
          sourceClass: 'group-ordinary',
          wake: 'digest',
          digestIntervalSeconds,
        })),
      ];
      for (const args of invalid) {
        await expect(call(tools, 'source_attention_set', args)).rejects.toThrow();
        expect(core.sourcePolicy.list('ada')).toEqual(baseline);
      }
      await expect(
        call(tools, 'source_attention_reset', { sourceClass: 'group-invite' }),
      ).rejects.toThrow();
      expect(core.sourcePolicy.list('ada')).toEqual(baseline);
    });
  });

  it('keeps joined Group settings bounded in every mode and preserves Human override, source priority and Bot isolation', async () => {
    await fixture(async (tools, core, groupId) => {
      const bea = core.channels.getGroupWakePolicy(groupId, 'bea');
      for (const mode of ['all', 'digest', 'mentions', 'silent']) {
        expect(
          await call(tools, 'group_attention_set', {
            channel_id: groupId,
            mode,
            count: 100,
            interval_seconds: 3600,
          }),
        ).toMatchObject({
          channelId: groupId,
          mode,
          count: 100,
          intervalSeconds: 3600,
          changedAt: expect.any(String),
          lastActor: { kind: 'bot', botSlug: 'ada' },
        });
        expect(
          await call(tools, 'group_attention_set', { channel_id: groupId, mode }),
        ).toMatchObject({ count: 100, intervalSeconds: 3600 });
        const baseline = core.channels.getGroupWakePolicy(groupId, 'ada');
        for (const args of [
          { count: 0 },
          { count: 101 },
          { count: 1.5 },
          { interval_seconds: 0 },
          { interval_seconds: 3601 },
          { interval_seconds: 1.5 },
        ]) {
          await expect(
            call(tools, 'group_attention_set', { channel_id: groupId, mode, ...args }),
          ).rejects.toThrow();
          expect(core.channels.getGroupWakePolicy(groupId, 'ada')).toEqual(baseline);
        }
      }
      const prior = core.channels.getGroupWakePolicy(groupId, 'ada');
      expect(
        createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }).channelGroupWakeSet({
          channelId: groupId,
          botSlug: 'ada',
          mode: 'mentions',
          count: 1,
          intervalSeconds: 1,
        }),
      ).toMatchObject({ ok: true });
      expect(await call(tools, 'group_attention_get', { channel_id: groupId })).toMatchObject({
        mode: 'mentions',
        count: 1,
        intervalSeconds: 1,
        revision: prior.revision + 1,
        lastActor: { kind: 'human' },
      });
      await call(tools, 'source_attention_reset', { sourceClass: 'group-ordinary' });
      expect(await call(tools, 'group_attention_get', { channel_id: groupId })).toMatchObject({
        mode: 'mentions',
        revision: prior.revision + 1,
      });
      expect(core.channels.getGroupWakePolicy(groupId, 'bea')).toEqual(bea);
      const privateGroup = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Private',
        members: ['bea'],
      });
      await expect(
        call(tools, 'group_attention_set', { channel_id: privateGroup.id, mode: 'silent' }),
      ).rejects.toThrow();
      await expect(
        call(tools, 'group_attention_get', { channel_id: privateGroup.id }),
      ).rejects.toThrow();
    });
  });
});
