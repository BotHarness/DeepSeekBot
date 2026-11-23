import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { BotNetworkDeliveryError } from '../src/runtime/bot-network.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry } from './registry-fixture.js';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { DirectBotToolError, type BotRuntime } from '../src/runtime/bot-runtime.js';
import { GenuiDiagramError } from '../src/runtime/genui-diagram.js';
import { GenuiPreviewError } from '../src/runtime/genui-preview.js';
import { createTestOwnership } from './helpers.js';
import { roots, modelOwners, setup } from './support/bridge-methods.js';

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('lists and runs direct Bot tools through the runtime and traces them as session direct', async () => {
    const run = vi.fn(async (_slug: string, tool: string) => {
      if (tool === 'genui_preview')
        throw new GenuiPreviewError('genui-preview-timeout', 'The isolated preview timed out.');
      if (tool === 'untrusted_error')
        throw Object.assign(new Error('Untrusted error'), {
          code: 'genui-preview-timeout',
        });
      if (tool === 'network_send') throw new BotNetworkDeliveryError('delivery-unknown');
      if (tool === 'create_assignment')
        throw new DirectBotToolError('tool-not-direct', 'create_assignment cannot run');
      if (tool === 'bot_send_message') throw new Error('bot_send_message: no Channel');
      if (tool === 'genui_diagram') throw new GenuiDiagramError('genui-diagram-invalid', 'Bad');
      return { tool, sessionId: 'direct' as const, result: { channels: [] } };
    });
    const runtime = {
      directBotTools: () => [{ name: 'channel_list', description: 'List', inputSchema: {} }],
      directBotToolCalls: () => [
        {
          callId: 'direct-1',
          tool: 'channel_list',
          args: {},
          at: '2026-10-14T00:00:00.000Z',
          durationMs: 3,
          outcome: 'ok' as const,
          result: '{"channels":[]}',
        },
      ],
      runDirectBotTool: run,
    } as unknown as BotRuntime;
    const { registry, methods } = setup([], ['ada'], () => runtime);
    registry.create({ slug: 'ada', displayName: 'Ada' });
    expect(methods.botTools({})).toEqual({
      ok: true,
      value: {
        sessionId: 'direct',
        tools: [{ name: 'channel_list', description: 'List', inputSchema: {} }],
      },
    });
    expect(
      await methods.botToolRun({
        slug: 'ada',
        tool: 'channel_list',
        args: { limit: 1 },
        humanId: 'untrusted-payload-human',
      }),
    ).toEqual({
      ok: true,
      value: {
        slug: 'ada',
        tool: 'channel_list',
        sessionId: 'direct',
        result: { channels: [] },
      },
    });
    expect(run).toHaveBeenCalledWith(
      'ada',
      'channel_list',
      { limit: 1 },
      expect.any(AbortSignal),
      undefined,
      undefined,
      OWNER_HUMAN_CONTEXT,
    );
    await methods.botToolRun({
      slug: 'ada',
      tool: 'bot_subagent',
      args: {},
      sessionId: ' assign-1 ',
    });
    expect(run).toHaveBeenLastCalledWith(
      'ada',
      'bot_subagent',
      {},
      expect.any(AbortSignal),
      'assign-1',
      undefined,
      OWNER_HUMAN_CONTEXT,
    );
    expect(
      await methods.botToolRun({
        slug: 'ada',
        tool: 'bot_subagent',
        sessionId: 7,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await methods.botToolRun({ slug: 'ada', tool: 'create_assignment' })).toEqual({
      ok: false,
      error: {
        code: 'tool-not-direct',
        message: 'create_assignment cannot run',
      },
    });
    expect(await methods.botToolRun({ slug: 'ada', tool: 'bot_send_message' })).toEqual({
      ok: false,
      error: { code: 'tool-failed', message: 'bot_send_message: no Channel' },
    });
    expect(await methods.botToolRun({ slug: 'ada', tool: 'genui_diagram' })).toMatchObject({
      ok: false,
      error: { code: 'genui-diagram-invalid' },
    });
    expect(await methods.botToolRun({ slug: 'ada', tool: 'network_send' })).toMatchObject({
      ok: false,
      error: { code: 'delivery-unknown' },
    });
    expect(await methods.botToolRun({ slug: 'ada', tool: 'genui_preview' })).toMatchObject({
      ok: false,
      error: { code: 'genui-preview-timeout' },
    });
    expect(await methods.botToolRun({ slug: 'ada', tool: 'untrusted_error' })).toMatchObject({
      ok: false,
      error: { code: 'tool-failed' },
    });
    expect((await methods.botToolRun({ slug: 'ada', tool: 'x', args: [] })).ok).toBe(false);
    expect((await methods.botToolRun({ slug: 'nobody', tool: 'channel_list' })).ok).toBe(false);
    expect(await methods.botToolTrace({ slug: 'ada', sessionId: 'direct' })).toMatchObject({
      ok: true,
      value: {
        sessionId: 'direct',
        turns: [
          {
            endReason: 'direct',
            calls: [{ name: 'channel_list', outcome: 'ok' }],
          },
        ],
      },
    });
  });

  it.each(['.', '..', ' . ', ' .. '])(
    'refuses reserved Browser profile %s before writing or resetting work',
    (profile) => {
      const h = setup();
      h.registry.create({ slug: 'ada', displayName: 'Ada' });
      h.registry.setBrowserProfile('ada', 'work.v2');
      const before = h.registry.get('ada');
      const write = vi.spyOn(h.registry, 'setBrowserProfile');
      const changed = vi.fn();
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
        registry: h.registry,
        states: h.states,
        channels: h.channels,
        ownership: createTestOwnership(),
        roster: createTestRosterStore(),
        browserProfile: { changed },
      });
      expect(methods.browserProfileSet({ slug: 'ada', profile })).toMatchObject({
        ok: false,
        error: {
          code: 'invalid-input',
          message: expect.stringMatching(/reserved/),
        },
      });
      expect(write).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
      expect(h.registry.get('ada')).toEqual(before);
      expect(createTestRegistry({ rootDir: h.root }).get('ada')).toEqual(before);
    },
  );

  it('keeps valid dotted Browser profile names and default aliases', () => {
    const h = setup();
    h.registry.create({ slug: 'ada', displayName: 'Ada' });
    for (const [profile, expected] of [
      [' work.v2 ', 'work.v2'],
      ['.work', '.work'],
      ['work..', 'work..'],
      [' default ', undefined],
      ['', undefined],
    ]) {
      expect(h.methods.browserProfileSet({ slug: 'ada', profile }).ok).toBe(true);
      expect(h.registry.get('ada')?.browserProfile).toBe(expected);
    }
  });

  it('drives the developer-mode skill gate from the bridge', () => {
    const seen: boolean[] = [];
    const { methods } = setup([], ['ada'], undefined, createTestOwnership(), undefined, {
      set: (enabled: boolean) => {
        seen.push(enabled);
      },
    });

    expect(methods.developerModeSet({ enabled: true })).toEqual({
      ok: true,
      value: { accepted: true },
    });
    expect(methods.developerModeSet({ enabled: false })).toEqual({
      ok: true,
      value: { accepted: true },
    });
    expect(seen).toEqual([true, false]);
    expect(methods.developerModeSet({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'enabled is required' },
    });
    expect(methods.developerModeSet({ enabled: 'yes' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'enabled is required' },
    });
  });

  it('reports unaccepted developer-mode sets without a gate', () => {
    const { methods } = setup();

    expect(methods.developerModeSet({ enabled: true })).toEqual({
      ok: true,
      value: { accepted: false },
    });
  });
});
