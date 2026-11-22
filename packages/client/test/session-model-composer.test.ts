// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import { zhTranslate } from '../src/client/locale.js';
import { SessionModelComposer } from '../src/client/session-model-composer.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

const saved = {
  kind: 'engine',
  engine: 'claude',
  model: 'claude-opus-5-5',
  effort: 'high',
} as const;
const opus = [
  {
    engine: 'claude',
    available: true,
    models: [
      {
        id: saved.model,
        name: 'Opus 5.5',
        efforts: [{ id: 'high', name: 'High' }],
        defaultEffort: 'high',
      },
    ],
  },
] as unknown as RoutingGroupEngineOptions[];

it('never shows the raw model id while the engine catalog loads or briefly drops the model', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  const view = (engines: RoutingGroupEngineOptions[] | undefined) =>
    createElement(SessionModelComposer, {
      action: vi.fn(async () => ({ override: saved, default: saved, active: null })),
      botSlug: 'tobs',
      sessionId: 'session-1',
      catalog: { models: [], engines },
      groups: [],
      target: undefined,
      running: false,
      onSaving: () => undefined,
      onError: () => undefined,
      t: zhTranslate,
    });
  const trigger = () => host.querySelector('[data-session-model-control] button');
  await act(async () => root.render(view(undefined)));
  expect(trigger()?.textContent).toBe('');
  await act(async () => root.render(view(opus)));
  expect(trigger()?.textContent).toContain('Opus 5.5');
  expect(trigger()?.textContent).toContain('高');
  await act(async () => root.render(view([])));
  expect(trigger()?.textContent).toContain('Opus 5.5');
  expect(trigger()?.textContent).not.toContain('claude-opus-5-5');
});
