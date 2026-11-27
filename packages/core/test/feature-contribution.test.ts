import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { describe, expect, it, vi } from 'vitest';

import { GenuiError, initialGenuiView } from '../src/channels/genui.js';
import { createGenuiContribution } from '../src/features/genui/contribution.js';
import { createSchedulesContribution } from '../src/features/schedules/contribution.js';
import { humanContext } from '../src/humans/context.js';
import type { FeatureToolRegistrar } from '../src/kernel/feature-contribution.js';
import type { InboxWakeSource, RuntimeHost } from '../src/kernel/runtime-host.js';
import { FAKE_BOT } from './dsh-agent-host-fixture.js';

function toolRegistry() {
  const tools: ToolDefinition[] = [];
  const guards: Parameters<FeatureToolRegistrar['guard']>[0][] = [];
  const registrar: FeatureToolRegistrar = {
    register: (tool) => {
      tools.push(tool);
    },
    guard: (guard) => {
      guards.push(guard);
    },
  };
  return { tools, guards, registrar };
}

describe('Feature Contribution', () => {
  it('routes Schedule bridge and RPC calls, supplies Agent instructions and registers a wake source', () => {
    const registerInboxWakeSource = vi.fn<RuntimeHost['registerInboxWakeSource']>();
    const host: RuntimeHost = { registerInboxWakeSource };
    let wake: ((botSlug: string) => void) | undefined;
    const wakeSource: InboxWakeSource = {
      hasPending: (slug) => slug === 'ada',
      subscribe(listener) {
        wake = listener;
        return () => {
          wake = undefined;
        };
      },
    };
    const feature = createSchedulesContribution(wakeSource);
    feature.runtime?.(host);
    expect(registerInboxWakeSource).toHaveBeenCalledOnce();
    const [source] = registerInboxWakeSource.mock.calls[0]!;
    expect(source.hasPending('ada')).toBe(true);
    expect(source.hasPending('other')).toBe(false);
    const requestHarvest = vi.fn();
    const dispose = source.subscribe(requestHarvest);
    wake?.('ada');
    dispose();
    wake?.('ada');
    expect(requestHarvest).toHaveBeenCalledExactlyOnceWith('ada');

    const methods = feature.bridgeMethods({
      human: humanContext('caller'),
      deps: { registry: { get: (slug) => (slug === 'ada' ? FAKE_BOT : undefined) } },
    });
    expect(methods.scheduleList({ slug: 'missing' })).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
    const trigger = { kind: 'every', everySeconds: 60 } as const;
    const bridgeResult = methods.schedulePreview({ trigger });
    expect(bridgeResult).toMatchObject({ ok: true, value: { occurrences: expect.any(Array) } });
    const result = feature.rpc.schedulePreview.call({ methods }, trigger);
    expect(result.occurrences).toHaveLength(3);
    expect(() => feature.rpc.scheduleList.call({ methods }, 'ada')).toThrow(RemoteError);
    expect(() => feature.rpc.scheduleList.call({ methods }, 'ada')).toThrow(
      'Bot Schedules are unavailable',
    );

    const { tools, guards, registrar } = toolRegistry();
    let confirmation = 'first confirmation';
    const agent = { currentRun: () => undefined, promptText: () => () => confirmation };
    feature.tools(agent, registrar);
    expect(tools.map((tool) => tool.name)).toEqual([
      'bot_schedule_list',
      'bot_schedule_create',
      'bot_schedule_update',
      'bot_schedule_delete',
    ]);
    expect(guards[0]?.('schedule_create')).toContain('bot_schedule_create');
    expect(guards[0]?.('bot_send_message')).toBeUndefined();
    const [section] = feature.promptSections(agent);
    expect(section?.text()).toContain(confirmation);
    confirmation = 'updated confirmation';
    expect(section?.text()).toContain(confirmation);
  });

  it('routes GenUI calls with the invoking Human and contributes the authoring prompt and tools', () => {
    const human = humanContext('member');
    const state = initialGenuiView();
    const view = { version: 4, state };
    const getView = vi.fn(() => view);
    const saveView = vi.fn(() => view);
    const feature = createGenuiContribution();
    const methods = feature.bridgeMethods({
      human,
      deps: {
        channels: { genuiView: getView, saveGenuiView: saveView },
      },
    });
    expect(methods.channelGenuiView({ channelId: 'channel', messageId: 'message' })).toEqual({
      ok: true,
      value: view,
    });
    expect(getView).toHaveBeenCalledExactlyOnceWith(human, 'channel', 'message');
    expect(
      feature.rpc.channelGenuiViewSave.call(
        { methods },
        'channel',
        'message',
        'snapshot',
        3,
        state,
      ),
    ).toBe(view);
    expect(saveView).toHaveBeenCalledExactlyOnceWith(
      human,
      'channel',
      'message',
      'snapshot',
      3,
      state,
    );
    getView.mockImplementation(() => {
      throw new GenuiError('genui-unavailable', 'Private view missing');
    });
    expect(() => feature.rpc.channelGenuiView.call({ methods }, 'channel', 'message')).toThrow(
      expect.objectContaining({ name: 'RemoteError', code: 'genui-unavailable' }),
    );

    const { tools, guards, registrar } = toolRegistry();
    feature.tools({ getAttachments: () => undefined, botSlug: 'ada' }, registrar);
    expect(tools.map((tool) => tool.name)).toEqual(['genui_diagram', 'genui_preview']);
    expect(guards).toEqual([]);
    expect(feature.promptSections()).toEqual([
      {
        placement: 'system',
        name: 'botharness:genui-authoring',
        order: 10_451,
        text: expect.stringContaining('genui_preview'),
      },
    ]);
  });
});
