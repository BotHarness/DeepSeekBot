import { describe, expect, it } from 'vitest';

import { currentModel, loadBotModel, loadGlobalModel } from '@botharness/host-client/bot-settings';
import { createHostClient } from '@botharness/host-client/client';
import {
  inheritModel,
  modelSettingsResource,
  saveModelPreset,
  searchModels,
  setModelGroup,
  setModelRoute,
  toggleAssignmentGroup,
  toggleAssignmentModel,
  type ModelSettingsState,
} from '@botharness/host-client/model-settings';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';

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
  fake.methods.set('modelCatalog', () => ({ models, default: flash, defaultRevision: 5 }));
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
    const observed = await modelSettingsResource(client, { kind: 'global' }).refresh();
    await setModelRoute(client, { kind: 'global' }, observed, 'orchestrator', pro);
    expect(fake.calls.at(-1)).toMatchObject({
      method: 'onboardingModel',
      args: {
        expectedRevision: 0,
        expectedDefaultRevision: 5,
        globalDefault: true,
        route: pro,
      },
    });
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
      orchestratorGroupId: null,
      assignmentGroups: [],
      assignmentDefaultGroupId: null,
      assignmentGroupOptions: [],
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
      orchestratorGroupId: null,
      assignmentGroups: [],
      assignmentDefaultGroupId: null,
      assignmentGroupOptions: [],
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
      orchestratorGroupId: null,
      assignmentGroups: [],
      assignmentDefaultGroupId: null,
      assignmentGroupOptions: [],
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

  it('reads favorites with the catalog and stars a model for every cached scope', async () => {
    const { fake, client } = setup();
    const starred = [{ kind: 'model', ...flash }];
    fake.methods.set('modelCatalog', () => ({ models, default: flash, favorites: starred }));
    fake.methods.set('modelFavoriteSet', (args) => ({
      favorites: (args as { favorite: boolean }).favorite
        ? [...starred, { kind: 'model', ...pro }]
        : [],
    }));
    const bot = modelSettingsResource(client, { kind: 'bot', slug: 'qa' });
    const global = modelSettingsResource(client, { kind: 'global' });
    expect((await bot.refresh()).favorites).toEqual(starred);
    await global.refresh();
    const next = await global.favorite({ kind: 'model', ...pro }, true);
    expect(fake.calls.at(-1)).toMatchObject({
      method: 'modelFavoriteSet',
      args: { choice: { kind: 'model', ...pro }, favorite: true },
    });
    expect(next).toEqual([...starred, { kind: 'model', ...pro }]);
    expect(bot.peek()?.favorites).toEqual(next);
    expect(global.peek()?.favorites).toEqual(next);
    expect(await global.favorite({ kind: 'model', ...pro }, false)).toEqual([]);
    fake.methods.set('modelFavoriteSet', () => ({}));
    await expect(global.favorite({ kind: 'model', ...pro }, true)).rejects.toThrow();
  });

  it('reads Routing Groups and runs the Bot Orchestrator on one (#4421)', async () => {
    const { fake, client } = setup();
    const until = '2026-11-22T23:23:00.000Z';
    const daily = { id: 'daily', name: 'Daily', revision: 1, routes: [flash, pro] };
    fake.methods.set('modelCatalog', () => ({
      models: [{ ...models[0], restingUntil: until }, models[1]],
      groups: [daily, { id: 'tired', name: 'Tired', routes: [flash], restingUntil: until }],
    }));
    fake.methods.set('modelPlan', () => ({
      revision: 4,
      plan: { ...plan, orchestratorGroupId: 'daily' },
    }));
    const loaded = await loadBotModel(client, 'qa');
    expect(loaded.plan?.orchestratorGroupId).toBe('daily');
    expect(loaded.models[0]?.restingUntil).toBe(until);
    expect(loaded.groups?.map((group) => group.id)).toEqual(['daily', 'tired']);
    fake.methods.set('modelPlanCustomize', () => ({ plan }));
    await setModelGroup(client, { kind: 'bot', slug: 'qa' }, loaded, 'daily');
    expect(fake.calls.at(-1)?.args).toEqual({
      slug: 'qa',
      expectedRevision: 4,
      orchestratorGroupId: 'daily',
    });
    await expect(
      setModelGroup(client, { kind: 'bot', slug: 'qa' }, loaded, 'tired'),
    ).rejects.toThrow();
  });

  it('puts Routing Groups in every Preset slot and keeps them on later edits (#4501)', async () => {
    const { fake, client } = setup();
    const daily = { id: 'daily', name: 'Daily', revision: 1, routes: [flash, pro] };
    const side = { id: 'side', name: 'Side', revision: 1, routes: [pro] };
    const scope = { kind: 'preset' as const, id: 'fast' };
    let saved: Record<string, unknown> = { ...preset };
    fake.methods.set('modelPresetUpdate', (args) => {
      saved = { ...saved, ...args, revision: Number(args['expectedRevision']) + 1 };
      return { preset: saved };
    });
    const current = () => ({ ...state, groups: [daily, side], preset: saved as typeof preset });
    await setModelGroup(client, scope, current(), 'daily');
    expect(fake.calls.at(-1)?.args).toMatchObject({ orchestratorGroupId: 'daily' });
    expect(fake.calls.at(-1)?.args).not.toHaveProperty('orchestrator');
    await setModelGroup(client, scope, current(), 'side', 'assignment');
    expect(fake.calls.at(-1)?.args).toMatchObject({
      orchestratorGroupId: 'daily',
      assignmentGroups: ['side'],
      assignmentDefaultGroupId: 'side',
    });
    await toggleAssignmentGroup(client, scope, current(), 'daily');
    expect(fake.calls.at(-1)?.args).toMatchObject({ assignmentGroups: ['side', 'daily'] });
    await expect(toggleAssignmentGroup(client, scope, current(), 'side')).rejects.toThrow(
      'ASSIGNMENT_DEFAULT_REQUIRED',
    );
    await setModelRoute(client, scope, current(), 'assignment', flash);
    expect(fake.calls.at(-1)?.args).toMatchObject({
      orchestratorGroupId: 'daily',
      assignmentGroups: ['side', 'daily'],
      assignmentDefaultGroupId: null,
      assignmentDefault: flash,
    });
    await setModelRoute(client, scope, current(), 'orchestrator', pro);
    expect(fake.calls.at(-1)?.args).toMatchObject({ orchestrator: pro, orchestratorGroupId: null });
  });

  it('keeps open Assignments, starts a group on a ready model, and copies the default group into a new Preset (#4501)', async () => {
    const { fake, client } = setup();
    const daily = { id: 'daily', name: 'Daily', revision: 1, routes: [flash, pro] };
    const keyless = [{ ...models[0]!, credential: 'missing' as const }, models[1]!];
    const scope = { kind: 'bot' as const, slug: 'qa' };
    fake.methods.set('modelPlanSet', () => ({ plan }));
    const open = { ...plan, openAssignmentModels: true as const };
    await toggleAssignmentGroup(client, scope, { ...state, plan: open, groups: [daily] }, 'daily');
    expect(fake.calls.at(-1)?.args).toMatchObject({ openAssignmentModels: true });
    const { assignmentDefault: _default, assignmentModels: _models, ...bare } = plan;
    await setModelGroup(
      client,
      scope,
      { ...state, models: keyless, plan: bare, groups: [daily] },
      'daily',
      'assignment',
    );
    expect(fake.calls.at(-1)?.args).toMatchObject({
      assignmentDefault: pro,
      assignmentDefaultGroupId: 'daily',
    });
    fake.methods.set('modelPresetCreate', () => ({ preset }));
    await saveModelPreset(
      client,
      {
        revision: 0,
        models,
        presets: [],
        fallback: flash,
        groups: [daily],
        defaultGroupId: 'daily',
      },
      'Grouped',
    );
    expect(fake.calls.at(-1)?.args).toMatchObject({ orchestratorGroupId: 'daily' });
    expect(fake.calls.at(-1)?.args).not.toHaveProperty('orchestrator');
    const side = { id: 'side', name: 'Side', revision: 1, routes: [pro] };
    const { plan: _plan, ...following } = state;
    await setModelGroup(
      client,
      scope,
      { ...following, groups: [daily, side], defaultGroupId: 'daily' },
      'side',
      'assignment',
    );
    expect(fake.calls.at(-1)?.args).toMatchObject({
      orchestratorGroupId: 'daily',
      assignmentDefaultGroupId: 'side',
    });
  });

  it('sets the global default to a Routing Group and shows it for Bots that follow it (#4500)', async () => {
    const { fake, client } = setup();
    const daily = { id: 'daily', name: 'Daily', revision: 1, routes: [flash, pro] };
    fake.methods.set('modelCatalog', () => ({
      models,
      default: flash,
      defaultRevision: 3,
      defaultGroupId: 'daily',
      groups: [daily],
    }));
    fake.methods.set('modelPresets', () => ({ presets: [] }));
    const global = await loadGlobalModel(client);
    expect(global.defaultGroupId).toBe('daily');
    expect(currentModel(global).group).toBe('Daily');
    const { fallback: _fallback, ...withoutFallback } = global;
    expect(currentModel(withoutFallback)).toEqual({ group: 'Daily' });
    fake.methods.set('onboardingModel', () => ({ revision: 3, groupRevision: 2 }));
    await setModelGroup(client, { kind: 'global' }, global, 'daily');
    expect(fake.calls.at(-1)).toEqual({
      method: 'onboardingModel',
      args: {
        expectedRevision: 0,
        expectedDefaultRevision: 3,
        groupId: 'daily',
        globalDefault: true,
      },
    });
    fake.methods.set('modelPlan', () => ({ revision: 0 }));
    expect(currentModel(await loadBotModel(client, 'qa')).group).toBe('Daily');
  });
});
