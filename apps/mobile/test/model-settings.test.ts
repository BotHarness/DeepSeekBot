import { describe, expect, it } from 'vitest';

import { loadBotModel } from '../src/host/bot-settings';
import { createHostClient } from '../src/host/client';
import {
  inheritModel,
  modelSettingsResource,
  saveModelPreset,
  searchModels,
  setModelRoute,
  toggleAssignmentModel,
  type ModelSettingsState,
} from '../src/host/model-settings';
import { FakeHost } from './fake-host';

const flash = { provider: 'deepseek', model: 'flash' };
const pro = { provider: 'deepseek', model: 'pro' };
const allowed = [
  { ...flash, allowedEfforts: ['', 'high'], defaultEffort: '', note: 'Keep this note' },
];
const plan = {
  revision: 4,
  sourcePresetId: '',
  sourcePresetName: '',
  orchestrator: { ...pro, reasoningEffort: 'high' },
  assignmentDefault: flash,
  assignmentModels: allowed,
};
const preset = {
  id: 'fast',
  name: 'Fast',
  revision: 2,
  orchestrator: pro,
  assignmentDefault: flash,
  assignmentModels: allowed,
};
const models = [
  { ...flash, providerName: 'DeepSeek', modelName: 'Fast', efforts: [] },
  {
    ...pro,
    providerName: 'DeepSeek',
    modelName: 'Pro',
    efforts: [{ id: 'high', name: 'High' }],
    defaultEffort: 'high',
  },
];
const state: ModelSettingsState = { revision: 4, plan, models, presets: [preset], fallback: flash };
function setup() {
  const fake = new FakeHost();
  const client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
  });
  fake.methods.set('modelCatalog', () => ({ models, default: flash }));
  fake.methods.set('modelPresets', () => ({ presets: [preset] }));
  fake.methods.set('modelPlan', () => ({ revision: 4, plan }));
  return { fake, client };
}

describe('native Model Plans and Presets', () => {
  it('cancels an older cached read before saving, so it cannot overwrite the accepted plan', async () => {
    const { fake, client } = setup();
    let finish: (value: unknown) => void = () => {};
    fake.methods.set(
      'modelPlan',
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const resource = modelSettingsResource(client, { kind: 'bot', slug: 'qa' });
    const oldRead = resource.refresh().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await resource.write(async () => {
      fake.methods.set('modelPlan', () => ({ revision: 5, plan: { ...plan, revision: 5 } }));
    });
    await resource.refresh();
    finish({ revision: 4, plan });
    await oldRead;
    expect(resource.peek()?.revision).toBe(5);
  });

  it('reports a failed preset read while retaining the previous complete settings', async () => {
    const { fake, client } = setup();
    const resource = modelSettingsResource(client, { kind: 'bot', slug: 'qa' });
    await resource.refresh();
    fake.methods.set('modelPresets', () => {
      throw Error('offline');
    });
    await expect(resource.refresh()).rejects.toThrow();
    expect(resource.peek()?.presets).toEqual([preset]);
  });
  it('retains catalog efforts and the complete preset rather than discarding Assignment policy', async () => {
    const { client } = setup();
    const result = await loadBotModel(client, 'qa');
    expect(result.models).toEqual(models);
    expect(result.presets).toEqual([preset]);
  });

  it('searches display names, provider IDs and model IDs without changing the catalog', () => {
    expect(searchModels(models, ' DEEPSEEK Pro ')).toEqual([models[1]]);
    expect(searchModels(models, 'flash')).toEqual([models[0]]);
    expect(searchModels(models, 'no model')).toEqual([]);
    expect(models).toHaveLength(2);
  });

  it('writes the global default without a Bot slug or any Bot override mutation', async () => {
    const { fake, client } = setup();
    fake.methods.set('onboardingModel', () => ({ revision: 0 }));
    await setModelRoute(client, { kind: 'global' }, state, 'orchestrator', pro);
    expect(fake.calls.map(({ method, args }) => [method, args])).toEqual([
      ['onboardingModel', { expectedRevision: 0, globalDefault: true, route: pro }],
    ]);
  });

  it('customizes only the Bot Orchestrator and uses the observed revision', async () => {
    const { fake, client } = setup();
    fake.methods.set('modelPlanCustomize', () => ({ plan }));
    await setModelRoute(client, { kind: 'bot', slug: 'qa' }, state, 'orchestrator', flash);
    expect(fake.calls[0]?.args).toEqual({ slug: 'qa', expectedRevision: 4, orchestrator: flash });
  });

  it('changes the Assignment default while retaining other choices, efforts, notes and Orchestrator', async () => {
    const { fake, client } = setup();
    fake.methods.set('modelPlanSet', () => ({ plan }));
    await setModelRoute(client, { kind: 'bot', slug: 'qa' }, state, 'assignment', {
      ...pro,
      reasoningEffort: 'high',
    });
    expect(fake.calls[0]?.args).toEqual({
      slug: 'qa',
      expectedRevision: 4,
      orchestrator: plan.orchestrator,
      assignmentDefault: { ...pro, reasoningEffort: 'high' },
      assignmentModels: [...allowed, { ...pro, allowedEfforts: ['high'], defaultEffort: 'high' }],
    });
    expect(state.plan).toEqual(plan);
  });

  it('restores inheritance using the current revision and propagates stale-write refusals', async () => {
    const { fake, client } = setup();
    fake.methods.set('modelPlanInherit', () => ({ revision: 5 }));
    await inheritModel(client, 'qa', state);
    expect(fake.calls[0]?.args).toEqual({ slug: 'qa', expectedRevision: 4 });
    fake.methods.set('modelPlanSet', () => {
      throw Error('stale revision');
    });
    await expect(
      setModelRoute(client, { kind: 'bot', slug: 'qa' }, state, 'assignment', pro),
    ).rejects.toThrow();
    expect(state.plan).toEqual(plan);
  });

  it('updates only the shared preset at its own revision, with full Assignment policy', async () => {
    const { fake, client } = setup();
    fake.methods.set('modelPresetUpdate', () => ({ preset: { ...preset, revision: 3 } }));
    const current = { ...state, preset };
    await setModelRoute(client, { kind: 'preset', id: 'fast' }, current, 'orchestrator', flash);
    expect(fake.calls[0]?.args).toEqual({
      id: 'fast',
      expectedRevision: 2,
      name: 'Fast',
      orchestrator: flash,
      assignmentDefault: flash,
      assignmentModels: allowed,
    });
    fake.calls.length = 0;
    expect(await saveModelPreset(client, current, 'Renamed', true)).toBe('fast');
    expect(fake.calls[0]?.args).toMatchObject({
      name: 'Renamed',
      expectedRevision: 2,
      assignmentModels: allowed,
    });
  });

  it('adds or removes Assignment choices but refuses removal of the default and unavailable models', async () => {
    const { fake, client } = setup();
    fake.methods.set('modelPlanSet', () => ({ plan }));
    await toggleAssignmentModel(client, { kind: 'bot', slug: 'qa' }, state, models[1]!);
    expect(fake.calls[0]?.args['assignmentModels']).toEqual([
      ...allowed,
      { ...pro, allowedEfforts: ['high'], defaultEffort: 'high' },
    ]);
    await expect(
      toggleAssignmentModel(client, { kind: 'bot', slug: 'qa' }, state, models[0]!),
    ).rejects.toThrow('ASSIGNMENT_DEFAULT_REQUIRED');
    await expect(
      setModelRoute(
        client,
        { kind: 'bot', slug: 'qa' },
        { ...state, models: [] },
        'orchestrator',
        flash,
      ),
    ).rejects.toThrow('MODEL_UNAVAILABLE');
  });

  it('creates a complete preset from the inherited global default, without mutating the Bot', async () => {
    const { fake, client } = setup();
    fake.methods.set('modelPresetCreate', () => ({ preset }));
    await saveModelPreset(client, { revision: 0, models, presets: [], fallback: flash }, ' New ');
    expect(fake.calls[0]?.args).toEqual({
      name: 'New',
      orchestrator: flash,
      assignmentDefault: flash,
      assignmentModels: [{ ...flash, allowedEfforts: [''], defaultEffort: '' }],
    });
    expect(fake.calls).toHaveLength(1);
  });

  it('isolates cached scopes and Hosts, deduplicates reads, and keeps cached content on refresh failure', async () => {
    const { fake, client } = setup();
    const a = modelSettingsResource(client, { kind: 'bot', slug: 'qa' });
    const same = modelSettingsResource(client, { kind: 'bot', slug: 'qa' });
    await Promise.all([a.refresh(), same.refresh()]);
    expect(fake.calls.filter((call) => call.method === 'modelPlan')).toHaveLength(1);
    expect(same.peek()?.plan).toEqual(plan);
    expect(modelSettingsResource(client, { kind: 'bot', slug: 'other' }).peek()).toBeUndefined();
    expect(
      modelSettingsResource(setup().client, { kind: 'bot', slug: 'qa' }).peek(),
    ).toBeUndefined();
    fake.methods.set('modelPlan', () => {
      throw Error('offline');
    });
    await expect(a.refresh()).rejects.toThrow();
    expect(a.peek()?.plan).toEqual(plan);
  });
});
