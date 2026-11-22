import { afterEach, expect, it, vi } from 'vitest';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import { HostAnswerInvalid } from '../src/host-answer';
import { loadRoutingGroupEngines } from '../src/model-catalog';
import { DEFAULT_MODEL_PRESET_ID, type ModelPlan, type ModelPreset } from '../src/model-plans';
import {
  modelSettingsResource,
  modelSub,
  searchSubChoices,
  setModelSub,
  subEffortOptions,
  subInherited,
  type ModelSettingsState,
} from '../src/model-settings';
import { staleGroupEfforts, type SubChoices, type SubSelection } from '../src/preset-sub';
import { setFeatureSink } from '../src/telemetry/features';

const main = { provider: 'deepseek', model: 'pro', reasoningEffort: 'high' };
const fast = { provider: 'deepseek', model: 'flash' };
const fastSelection = { kind: 'model', ...fast } satisfies SubSelection;
const group = { kind: 'group', group: 'fallbacks' } satisfies SubSelection;
const engine = {
  kind: 'engine',
  engine: 'codex',
  accountId: 'work',
  model: 'gpt',
} satisfies SubSelection;
const empty: SubChoices = { choices: [], default: null };
const saved: SubChoices = { choices: [group], default: group };
const preset: ModelPreset = {
  id: DEFAULT_MODEL_PRESET_ID,
  name: 'Default',
  revision: 12,
  orchestrator: main,
  assignmentDefault: fast,
  sub: saved,
};
const plan: ModelPlan = {
  revision: 5,
  sourcePresetId: 'custom',
  sourcePresetName: 'Custom',
  orchestrator: main,
};
const catalog = [
  {
    provider: 'deepseek',
    providerName: 'DeepSeek',
    model: 'pro',
    modelName: 'Pro',
    efforts: [
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
    ],
    defaultEffort: 'high',
  },
  {
    provider: 'deepseek',
    providerName: 'DeepSeek',
    model: 'flash',
    modelName: 'Flash',
    efforts: [{ id: 'low', name: 'Low' }],
  },
] satisfies ModelSettingsState['models'];
const state: ModelSettingsState = {
  revision: 3,
  fallback: main,
  models: catalog,
  presets: [preset],
};
const bot = { kind: 'bot', slug: 'ada' } as const;
const availableGroup = {
  id: group.group,
  name: 'Fast fallbacks',
  revision: 1,
  routes: [main, fast],
};
const engines: RoutingGroupEngineOptions[] = [
  {
    engine: 'codex',
    accountId: 'work',
    accountName: 'Work team',
    available: true,
    models: [{ id: 'gpt', name: 'GPT', isDefault: true, efforts: [{ id: 'high', name: 'High' }] }],
  },
  {
    engine: 'codex',
    accountId: 'personal',
    accountName: 'Personal',
    available: true,
    models: [{ id: 'gpt', name: 'GPT', efforts: [{ id: 'low', name: 'Low' }] }],
  },
  { engine: 'claude', available: false, reason: 'signed-out' },
];

afterEach(() => setFeatureSink(undefined));

it('uses the open preset list or converts its legacy model and subscription engine', () => {
  const { sub: _sub, ...legacy } = preset;
  expect(modelSub({ ...state, preset: { ...preset, sub: empty } })).toEqual(empty);
  expect(subInherited({ ...state, preset })).toBe(false);
  expect(modelSub({ ...state, preset: { ...legacy, assignmentFollowsMain: true } })).toEqual(empty);
  expect(
    modelSub({
      ...state,
      preset: {
        ...legacy,
        assignmentEngine: { engine: 'codex', accountId: 'work', model: 'gpt', effort: 'high' },
      },
    }),
  ).toEqual({
    choices: [
      { ...fastSelection, allowedEfforts: [''], defaultEffort: '' },
      { ...engine, effort: 'high' },
    ],
    default: engine,
  });
});

it('uses explicit Bot choices including follows-main, then converts legacy assignment routes and groups', () => {
  expect(modelSub({ ...state, plan: { ...plan, sub: empty } })).toEqual(empty);
  expect(subInherited({ ...state, plan: { ...plan, sub: empty } })).toBe(false);
  const configured = { ...group, allowedEfforts: ['low'], defaultEffort: 'low', note: 'Steady' };
  const legacy: ModelSettingsState = {
    ...state,
    plan: {
      ...plan,
      assignmentDefault: { ...fast, reasoningEffort: 'low' },
      assignmentGroups: [group.group],
      assignmentDefaultGroupId: group.group,
      assignmentGroupOptions: [configured],
    },
  };
  expect(modelSub(legacy)).toEqual({
    choices: [{ ...fastSelection, allowedEfforts: ['low'], defaultEffort: 'low' }, configured],
    default: group,
  });
  expect(subInherited(legacy)).toBe(false);
});

it('reads the Default preset for a Bot without its own list, and its main route when that list is empty', () => {
  const other = { ...preset, id: 'other', name: 'Other', sub: empty };
  const inherited = { ...state, presets: [other, preset] };
  expect(modelSub(inherited)).toEqual(saved);
  expect(modelSub({ ...inherited, plan })).toEqual(saved);
  expect(subInherited(inherited)).toBe(true);
  expect(subInherited({ ...inherited, plan })).toBe(true);
  expect(modelSub({ ...state, plan, presets: [{ ...preset, sub: empty }] })).toEqual({
    choices: [
      {
        kind: 'model',
        provider: main.provider,
        model: main.model,
        allowedEfforts: ['high'],
        defaultEffort: 'high',
      },
    ],
    default: { kind: 'model', provider: main.provider, model: main.model },
  });
  expect(
    modelSub({
      ...state,
      presets: [
        { ...preset, orchestratorGroupId: 'fallbacks', orchestratorGroupEffort: 'low', sub: empty },
      ],
    }),
  ).toEqual({
    choices: [{ kind: 'group', group: 'fallbacks', allowedEfforts: ['low'], defaultEffort: 'low' }],
    default: group,
  });
  expect(modelSub({ ...state, preset: { ...preset, sub: empty } })).toEqual(empty);
  expect(modelSub({ ...state, presets: [other] })).toEqual(empty);
});

it('reads inherited choices from the existing Bot Settings calls', async () => {
  const host = {
    call: vi.fn(async (method: string) => {
      switch (method) {
        case 'modelPlan':
          return { revision: 3, plan };
        case 'modelCatalog':
          return { models: catalog, default: main };
        case 'modelPresets':
          return { presets: [preset] };
        default:
          throw new Error(`Unexpected call ${method}`);
      }
    }),
  };
  const loaded = await modelSettingsResource(host, bot).refresh();
  expect(modelSub(loaded)).toEqual(saved);
  expect(host.call.mock.calls).toEqual([
    ['modelPlan', { slug: 'ada' }],
    ['modelCatalog', {}],
    ['modelPresets', {}],
  ]);
});

it.each([DEFAULT_MODEL_PRESET_ID, 'custom'])(
  'saves a preset list to %s at its own revision',
  async (id) => {
    const host = { call: vi.fn().mockResolvedValue({ id, revision: 13, sub: saved }) };
    const edited = { ...preset, id };
    const draft: SubChoices = { choices: [{ ...group, note: '   ' }], default: group };
    await setModelSub(host, { kind: 'preset', id }, { ...state, preset: edited }, draft);
    expect(host.call.mock.calls).toEqual([
      ['modelPresetSubSet', { id, expectedRevision: 12, sub: saved }],
    ]);
    expect(draft.choices[0]?.note).toBe('   ');
  },
);

it.each([plan, { ...plan, sub: empty }])(
  'saves only the Task model list when the Bot has a plan',
  async (stored) => {
    const host = { call: vi.fn().mockResolvedValue({ slug: 'ada', revision: 6, sub: saved }) };
    await setModelSub(host, bot, { ...state, plan: stored }, saved);
    expect(host.call.mock.calls).toEqual([
      ['modelPlanSubSet', { slug: 'ada', expectedRevision: 5, sub: saved }],
    ]);
  },
);

it('creates a Bot plan with the current direct main model and cleaned Task model list', async () => {
  const draft: SubChoices = { choices: [{ ...group, note: '\t' }], default: group };
  const host = { call: vi.fn().mockResolvedValue({ plan: { ...plan, sub: saved } }) };
  const log = vi.fn();
  setFeatureSink(log);
  await setModelSub(host, bot, state, draft);
  expect(host.call.mock.calls).toEqual([
    ['modelPlanSet', { slug: 'ada', expectedRevision: 3, orchestrator: main, sub: saved }],
  ]);
  expect(log.mock.calls).toEqual([['model:plan_update', { via: 'sub' }]]);
});

it('creates a Bot plan with the current main Routing Group and effort', async () => {
  const host = { call: vi.fn().mockResolvedValue({ plan: { ...plan, sub: saved } }) };
  await setModelSub(
    host,
    bot,
    { ...state, defaultGroupId: 'daily', defaultGroupEffort: 'low' },
    saved,
  );
  expect(host.call.mock.calls).toEqual([
    [
      'modelPlanSet',
      {
        slug: 'ada',
        expectedRevision: 3,
        orchestratorGroupId: 'daily',
        orchestratorGroupEffort: 'low',
        sub: saved,
      },
    ],
  ]);
});

it('keeps the displayed direct main model when the Default preset has an unlisted Routing Group', async () => {
  const host = { call: vi.fn().mockResolvedValue({ plan: { ...plan, sub: saved } }) };
  const inherited = { ...state, presets: [{ ...preset, orchestratorGroupId: 'unlisted' }] };
  await setModelSub(host, bot, inherited, saved);
  expect(host.call.mock.calls).toEqual([
    ['modelPlanSet', { slug: 'ada', expectedRevision: 3, orchestrator: main, sub: saved }],
  ]);
});

it('refuses global writes, mismatched preset state and a missing main route without sending them', async () => {
  const host = { call: vi.fn() };
  await expect(setModelSub(host, { kind: 'global' }, state, saved)).rejects.toThrow(
    new HostAnswerInvalid('USE_DEFAULT_PRESET'),
  );
  await expect(
    setModelSub(host, { kind: 'preset', id: 'other' }, { ...state, preset }, saved),
  ).rejects.toThrow('MODEL_PRESET_REVISION_REQUIRED');
  await expect(
    setModelSub(host, bot, { revision: 3, presets: [], models: [] }, saved),
  ).rejects.toThrow('MODEL_REQUIRED');
  expect(host.call).not.toHaveBeenCalled();
});

it('propagates a refused write without logging a completed edit', async () => {
  const stale = new Error('stale-setting');
  const host = { call: vi.fn().mockRejectedValue(stale) };
  const log = vi.fn();
  setFeatureSink(log);
  await expect(setModelSub(host, bot, { ...state, plan }, saved)).rejects.toBe(stale);
  expect(log).not.toHaveBeenCalled();
});

it('searches available groups, models and per-account subscription models', () => {
  const otherGroup = { ...availableGroup, id: 'daily', name: 'Daily models' };
  const gated = {
    provider: main.provider,
    providerName: 'DeepSeek',
    model: 'gated',
    modelName: 'Gated',
    credential: 'missing',
  } satisfies ModelSettingsState['models'][number];
  const current = {
    ...state,
    models: [...catalog, gated],
    groups: [availableGroup, otherGroup],
    engines,
  };
  expect(searchSubChoices(current, '').map(({ choice }) => choice)).toEqual([
    { kind: 'group', group: 'daily' },
    {
      kind: 'model',
      provider: main.provider,
      model: main.model,
      allowedEfforts: ['', 'low', 'high'],
      defaultEffort: 'high',
    },
    { ...fastSelection, allowedEfforts: ['', 'low'], defaultEffort: '' },
    engine,
    { ...engine, accountId: 'personal' },
  ]);
  expect(searchSubChoices(current, '  TEAM gpt  ').map(({ choice }) => choice)).toEqual([engine]);
  expect(searchSubChoices(current, 'daily models').map(({ kind }) => kind)).toEqual(['group']);
  expect(searchSubChoices(current, 'deepseek flash').map(({ kind }) => kind)).toEqual(['model']);
  expect(searchSubChoices(current, 'claude')).toEqual([]);
});

it('accepts a picker catalog loaded on demand through the existing engine catalog method', async () => {
  const host = { call: vi.fn().mockResolvedValue({ routingGroupEngines: engines }) };
  expect(searchSubChoices(state, 'gpt')).toEqual([]);
  const loaded = await loadRoutingGroupEngines(host);
  expect(searchSubChoices(state, 'work gpt', loaded).map(({ choice }) => choice)).toEqual([engine]);
  expect(host.call.mock.calls).toEqual([['modelCatalog', { includeRoutingGroupEngines: true }]]);
});

it('returns the stored effort and matching catalog choices for each selected source', () => {
  const configured = { ...group, allowedEfforts: ['low', 'high'], defaultEffort: 'high' };
  const active: ModelSettingsState = {
    ...state,
    groups: [availableGroup],
    engines,
    plan: {
      ...plan,
      sub: {
        choices: [
          configured,
          { ...fastSelection, allowedEfforts: ['', 'low'], defaultEffort: 'low' },
          { ...engine, effort: 'high' },
          { kind: 'engine', engine: 'codex', accountId: 'work' },
        ],
        default: group,
      },
    },
  };
  expect(subEffortOptions(active, fastSelection)).toEqual({
    selection: fastSelection,
    effort: 'low',
    options: [{ id: 'low', name: 'Low' }],
  });
  const groupOptions = subEffortOptions(active, { kind: 'group', id: group.group });
  expect(groupOptions).toEqual({
    selection: group,
    effort: 'high',
    options: [{ id: 'low', name: 'Low' }],
  });
  expect(staleGroupEfforts(configured, groupOptions?.options.map(({ id }) => id) ?? [])).toBe(true);
  expect(subEffortOptions(active, engine)).toEqual({
    selection: engine,
    effort: 'high',
    options: [{ id: 'high', name: 'High' }],
  });
  const engineDefault = { kind: 'engine', engine: 'codex', accountId: 'work' } as const;
  expect(subEffortOptions(active, engineDefault)).toEqual({
    selection: engineDefault,
    effort: '',
    options: [{ id: 'high', name: 'High' }],
  });
  expect(subEffortOptions(active, { ...engine, accountId: 'personal' })).toBeUndefined();
});

it('runs writes for the same scope one after another, even after a failure', async () => {
  const host = { call: vi.fn(async () => ({})) };
  const resource = modelSettingsResource(host, { kind: 'bot', slug: 'serial' });
  const order: string[] = [];
  let finishFirst: () => void = () => undefined;
  const first = resource.write(
    () =>
      new Promise<void>((resolve) => {
        order.push('first start');
        finishFirst = () => {
          order.push('first end');
          resolve();
        };
      }),
  );
  const failing = resource.write(async () => {
    order.push('second');
    throw new Error('stale');
  });
  const third = modelSettingsResource(host, { kind: 'bot', slug: 'serial' }).write(async () => {
    order.push('third');
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(order).toEqual(['first start']);
  finishFirst();
  await first;
  await expect(failing).rejects.toThrow('stale');
  await third;
  expect(order).toEqual(['first start', 'first end', 'second', 'third']);
});
