import { expect, it } from 'vitest';

import { loadRoutingGroupEngines } from '../src/model-catalog';
import { sessionHeaderTargetLabel, turnTargetLabel } from '../src/turn-target';

it('uses the engine catalog display name for recorded ids and aliases', async () => {
  const engines = await loadRoutingGroupEngines({
    async call(method, payload) {
      expect(method).toBe('modelCatalog');
      expect(payload).toEqual({ includeRoutingGroupEngines: true });
      return {
        routingGroupEngines: [
          {
            engine: 'claude',
            available: true,
            models: [{ id: 'claude-opus-5-5', name: 'Opus 5.5', aliases: ['opus'] }],
          },
          {
            engine: 'codex',
            available: true,
            models: [{ id: 'gpt-6.2-sol', name: 'GPT-6.2-Sol' }],
          },
        ],
      };
    },
  });
  const catalog = { engines };
  for (const model of ['claude-opus-5-5', 'opus 5 5', 'opus']) {
    const target = { kind: 'engine', engine: 'claude', model, account: 'Claude Pro' } as const;
    expect(turnTargetLabel(target, catalog).short).toBe('Opus 5.5');
    expect(sessionHeaderTargetLabel(target, catalog)).toMatchObject({
      short: 'Claude Code · Pro',
      name: 'Claude Code · Pro · Opus 5.5',
    });
  }
  expect(
    turnTargetLabel({ kind: 'engine', engine: 'codex', model: 'gpt-6.2-sol' }, catalog).short,
  ).toBe('GPT-6.2-Sol');
  expect(
    turnTargetLabel({ kind: 'engine', engine: 'claude', model: 'claude-custom-1' }, catalog).short,
  ).toBe('claude-custom-1');
  expect(
    turnTargetLabel({ kind: 'engine', engine: 'codex', model: 'claude-opus-5-5' }, catalog).short,
  ).toBe('claude-opus-5-5');
});
