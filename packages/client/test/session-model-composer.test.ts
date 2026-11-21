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

const saved = { kind: 'engine', engine: 'claude', model: 'claude-opus-5-5' } as const;
const opus = [
  {
    engine: 'claude',
    available: true,
    models: [{ id: saved.model, name: 'Opus 5.5', efforts: [] }],
  },
] as unknown as RoutingGroupEngineOptions[];

it('keeps the display name when the engine catalog briefly drops the chosen model', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  const view = (engines: RoutingGroupEngineOptions[]) =>
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
  await act(async () => root.render(view(opus)));
  const trigger = () => host.querySelector('[data-session-model-control] button');
  expect(trigger()?.textContent).toContain('Opus 5.5');
  await act(async () => root.render(view([])));
  expect(trigger()?.textContent).toContain('Opus 5.5');
  expect(trigger()?.textContent).not.toContain('claude-opus-5-5');
});
