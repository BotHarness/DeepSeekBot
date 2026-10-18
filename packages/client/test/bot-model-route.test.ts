import { describe, expect, it, vi } from 'vitest';
import {
  applyBotModelRoute,
  botEffortChoices,
  botModelChoices,
} from '../src/client/bot-model-route.js';
import type { ModelPlanView } from '../src/client/bridge.js';

const route = { provider: 'p', model: 'a', reasoningEffort: 'high' };
const catalog = {
  models: [
    {
      provider: 'p',
      providerName: 'P',
      model: 'a',
      modelName: 'A',
      efforts: [{ id: 'high', name: 'High' }],
    },
    { provider: 'p', providerName: 'P', model: 'b', modelName: 'B', efforts: [] },
    {
      provider: 'p',
      providerName: 'P',
      model: 'c',
      modelName: 'C',
      efforts: [{ id: 'high', name: 'High' }],
    },
  ],
};
const plan: ModelPlanView = {
  revision: 4,
  orchestrator: route,
  sourcePresetId: '',
  sourcePresetName: '',
  appliedAt: '',
};

describe('Orchestrator quick model selection', () => {
  it.each([
    undefined,
    {
      ...plan,
      assignmentDefault: { provider: 'tasks', model: 'fixed' },
      assignmentModels: [
        {
          provider: 'tasks',
          model: 'fixed',
          allowedEfforts: ['low', 'high'],
          defaultEffort: 'low',
        },
      ],
    },
  ])(
    'sends only an Orchestrator route and expected revision, preserving the Host-owned Assignment configuration: %j',
    async (current) => {
      const customizeModelPlan = vi.fn(async () => plan);
      await applyBotModelRoute(
        { customizeModelPlan },
        'route-qa',
        { revision: 3, ...(current === undefined ? {} : { plan: current }) },
        route,
      );
      expect(customizeModelPlan).toHaveBeenCalledExactlyOnceWith(
        'route-qa',
        route,
        current?.revision ?? 3,
      );
    },
  );
  it('keeps a supported effort and resets an unsupported effort to provider default', () => {
    expect(botModelChoices(route, catalog, 'Default', 'c')[0]?.route.reasoningEffort).toBe('high');
    expect(botModelChoices(route, catalog, 'Default', 'b')[0]?.route).toEqual({
      provider: 'p',
      model: 'b',
    });
    expect(botEffortChoices(route, catalog, 'Default', '')).toMatchObject([
      { label: 'Default', current: false },
      { label: 'High', current: true },
    ]);
  });
});
