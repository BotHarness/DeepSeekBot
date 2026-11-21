// @vitest-environment jsdom
import {
  button,
  catalog,
  choose,
  openEditor,
  picked,
  translate,
} from './model-preset-profile-fixtures.js';
import { type Root } from 'react-dom/client';
import type { ModelPlanView } from '../src/client/bridge.js';
import { dialog } from './primitive-mocks.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { draftOf, planParts, withAdvanced } from '../src/client/model-preset-draft.js';
import { ModelPresetProfile } from '../src/client/model-preset-profile.js';
import { createCore } from '../../core/src/plugin.js';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const remoteCores: ReturnType<typeof createCore>[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  if (root !== undefined) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  document.body.innerHTML = '';
  for (const core of remoteCores.splice(0)) {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function render(actions: BridgeActions, onClose?: () => void): Promise<HTMLDivElement> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      createElement(ModelPresetProfile, { slug: 'ada', actions, t: translate, onClose }),
    ),
  );
  return container;
}

describe('Model entry', () => {
  it('puts Routing Groups in every slot and saves them in a Bot plan (#4501)', async () => {
    const route = { provider: 'deepseek', model: 'pro' };
    const plan: ModelPlanView = {
      revision: 3,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: route,
      assignmentDefault: route,
      appliedAt: '',
    };
    const groups = [
      {
        id: 'main',
        name: 'Main',
        revision: 1,
        routes: [
          { provider: 'deepseek', model: 'flash' },
          { provider: 'kimi', model: 'k2' },
        ],
      },
      { id: 'side', name: 'Side', revision: 1, routes: [{ provider: 'deepseek', model: 'flash' }] },
    ];
    const setModelPlan = vi.fn(async () => plan);
    const host = await render({
      modelPlanState: vi.fn(async () => ({ plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog, groups })),
      setModelPlan,
    } as unknown as BridgeActions);
    await openEditor(host);
    await choose(translate('modelPreset.orchestrator'), 'Main', 'Main');
    await act(async () => button('Advanced').click());
    await choose('Add an allowed model', 'Side', 'Side');
    const card = document.querySelector<HTMLElement>('li[data-model-group]')!;
    expect(card.textContent).toContain('Side');
    expect(card.textContent).toContain('1 models');
    expect(card.textContent).toContain('Next available: Flash · DeepSeek');
    const high = [...card.querySelectorAll('label')].find((item) => item.textContent === 'High')!;
    await act(async () => high.querySelector('input')!.click());
    const input = card.querySelector<HTMLInputElement>('input[aria-label="When to use Side"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        ' Quick checks ',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      [...card.querySelectorAll('button')]
        .find((item) => item.textContent === 'Make default')!
        .click(),
    );
    await act(async () => button('Save').click());
    expect(setModelPlan).toHaveBeenCalledExactlyOnceWith(
      'ada',
      3,
      { provider: 'deepseek', model: 'flash' },
      route,
      [{ ...route, allowedEfforts: [''], defaultEffort: '' }],
      undefined,
      {
        orchestratorGroupId: 'main',
        assignmentGroups: ['side'],
        assignmentDefaultGroupId: 'side',
        assignmentGroupOptions: [
          { group: 'side', allowedEfforts: ['high'], defaultEffort: 'high', note: 'Quick checks' },
        ],
      },
    );
  });

  it('offers a group the efforts of its reasoning members in advanced mode', async () => {
    const route = { provider: 'deepseek', model: 'pro' };
    const plan: ModelPlanView = {
      revision: 3,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: route,
      assignmentDefault: route,
      appliedAt: '',
    };
    const groups = [
      {
        id: 'main',
        name: 'Main',
        revision: 1,
        routes: [
          { provider: 'deepseek', model: 'flash' },
          { provider: 'kimi', model: 'k2' },
        ],
      },
    ];
    const host = await render({
      modelPlanState: vi.fn(async () => ({ plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog, groups })),
    } as unknown as BridgeActions);
    await openEditor(host);
    await act(async () => button('Advanced').click());
    await choose('Add an allowed model', 'Main', 'Main');
    const card = document.querySelector<HTMLElement>('li[data-model-group]')!;
    expect([...card.querySelectorAll('label')].map((item) => item.textContent)).toContain('High');
  });

  it('opens a grouped plan and saves it back with its groups (#4501)', async () => {
    const route = { provider: 'deepseek', model: 'pro' };
    const plan: ModelPlanView = {
      revision: 5,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: { provider: 'deepseek', model: 'flash' },
      orchestratorGroupId: 'main',
      assignmentDefault: route,
      assignmentModels: [{ ...route, allowedEfforts: [''], defaultEffort: '' }],
      assignmentGroups: ['side', 'main'],
      assignmentDefaultGroupId: 'side',
      assignmentGroupOptions: [{ group: 'main', note: 'Long work' }],
      appliedAt: '',
    };
    const groups = [
      { id: 'main', name: 'Main', revision: 1, routes: [{ provider: 'kimi', model: 'k2' }] },
      { id: 'side', name: 'Side', revision: 1, routes: [{ provider: 'deepseek', model: 'flash' }] },
    ];
    const setModelPlan = vi.fn(async () => ({ ...plan, revision: 6 }));
    const host = await render({
      modelPlanState: vi.fn(async () => ({ revision: 5, plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog, groups })),
      setModelPlan,
    } as unknown as BridgeActions);
    await openEditor(host);
    expect(picked(translate('modelPreset.orchestrator'))).toContain('Main');
    expect(
      [...document.querySelectorAll('li[data-model-group] strong')].map((item) => item.textContent),
    ).toEqual(['Side', 'Main']);
    await choose(translate('modelPreset.orchestrator'), 'Flash', 'Flash');
    await act(async () => button(translate('modelPreset.save')).click());
    expect(setModelPlan).toHaveBeenCalledExactlyOnceWith(
      'ada',
      5,
      { provider: 'deepseek', model: 'flash' },
      route,
      [{ ...route, allowedEfforts: [''], defaultEffort: '' }],
      undefined,
      {
        assignmentGroups: ['side', 'main'],
        assignmentDefaultGroupId: 'side',
        assignmentGroupOptions: [{ group: 'main', note: 'Long work' }],
      },
    );
  });

  it('clears a group effort limit its members no longer share (#4501)', async () => {
    const route = { provider: 'deepseek', model: 'pro' };
    const plan: ModelPlanView = {
      revision: 5,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels: [{ ...route, allowedEfforts: [''], defaultEffort: '' }],
      assignmentGroups: ['main'],
      assignmentGroupOptions: [{ group: 'main', allowedEfforts: ['high'], defaultEffort: 'high' }],
      appliedAt: '',
    };
    const groups = [
      { id: 'main', name: 'Main', revision: 1, routes: [{ provider: 'kimi', model: 'k2' }] },
    ];
    const setModelPlan = vi.fn(async () => ({ ...plan, revision: 6 }));
    const host = await render({
      modelPlanState: vi.fn(async () => ({ revision: 5, plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog, groups })),
      setModelPlan,
    } as unknown as BridgeActions);
    await openEditor(host);
    expect(dialog().textContent).toContain(translate('modelPreset.groupEffortsStale'));
    await act(async () => button(translate('modelPreset.groupEffortsClear')).click());
    await act(async () => button(translate('modelPreset.save')).click());
    expect(setModelPlan).toHaveBeenCalledExactlyOnceWith(
      'ada',
      5,
      route,
      route,
      [{ ...route, allowedEfforts: [''], defaultEffort: '' }],
      undefined,
      { assignmentGroups: ['main'], assignmentGroupOptions: [] },
    );
  });

  it('flags a group effort its members dropped while keeping the shared ones (#4501)', async () => {
    const route = { provider: 'deepseek', model: 'pro' };
    const plan: ModelPlanView = {
      revision: 5,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels: [{ ...route, allowedEfforts: [''], defaultEffort: '' }],
      assignmentGroups: ['main'],
      assignmentGroupOptions: [
        { group: 'main', allowedEfforts: ['high', 'max'], defaultEffort: 'high' },
      ],
      appliedAt: '',
    };
    const groups = [
      { id: 'main', name: 'Main', revision: 1, routes: [{ provider: 'deepseek', model: 'flash' }] },
    ];
    const host = await render({
      modelPlanState: vi.fn(async () => ({ revision: 5, plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog, groups })),
    } as unknown as BridgeActions);
    await openEditor(host);
    expect(dialog().textContent).toContain(translate('modelPreset.groupEffortsStale'));
    expect(dialog().textContent).toContain(translate('modelPreset.allowedEfforts'));
  });
});

const draftA = { provider: 'p', model: 'a' };
const draftB = { provider: 'p', model: 'b' };
const draftDaily = { id: 'daily', name: 'Daily', revision: 1, routes: [draftA, draftB] };

describe('planParts under an Assignment Routing Group', () => {
  it('keeps the stored Assignment default and allowed models under a Routing Group', () => {
    const draft = draftOf(
      {
        orchestrator: draftA,
        assignmentDefault: { ...draftB, reasoningEffort: 'high' },
        assignmentModels: [draftB].map((route) => ({
          ...route,
          allowedEfforts: ['high'],
          defaultEffort: 'high',
        })),
        assignmentGroups: ['daily'],
        assignmentDefaultGroupId: 'daily',
      },
      '',
    );
    expect(draft.advanced).toBe(false);
    const parts = planParts(draft, [draftDaily]);
    expect(parts?.assignmentDefault).toEqual({ ...draftB, reasoningEffort: 'high' });
    expect(parts?.assignmentModels).toEqual([
      { ...draftB, allowedEfforts: ['high'], defaultEffort: 'high' },
    ]);
    expect(parts?.groups?.assignmentDefaultGroupId).toBe('daily');
  });

  it('keeps a later stored default in advanced mode', () => {
    const options = [draftA, draftB].map((route) => ({
      ...route,
      allowedEfforts: [''],
      defaultEffort: '',
    }));
    const draft = draftOf(
      {
        orchestrator: draftA,
        assignmentDefault: draftB,
        assignmentModels: options,
        assignmentGroups: ['daily'],
        assignmentDefaultGroupId: 'daily',
      },
      '',
    );
    expect(draft.advanced).toBe(true);
    expect(planParts(draft, [draftDaily])?.assignmentDefault).toEqual(draftB);
  });

  it('starts an Assignment group with no listed models on a route that has a key', () => {
    const draft = {
      ...draftOf(
        {
          orchestrator: draftA,
          assignmentDefault: draftA,
          assignmentModels: [],
          assignmentGroups: ['daily'],
          assignmentDefaultGroupId: 'daily',
        },
        '',
      ),
      allowed: [],
    };
    const catalog = [
      { ...draftA, providerName: 'P', modelName: 'A', efforts: [], credential: 'missing' as const },
      { ...draftB, providerName: 'P', modelName: 'B', efforts: [] },
    ];
    const parts = planParts(draft, [draftDaily], catalog);
    expect(parts?.assignmentDefault).toEqual(draftB);
    expect(parts?.assignmentModels).toEqual([
      { ...draftB, allowedEfforts: [''], defaultEffort: '' },
    ]);
  });
});

describe('one reasoning effort for a Routing Group (#4497)', () => {
  it('reads and saves the group effort in both slots without opening advanced mode', () => {
    const draft = draftOf(
      {
        orchestrator: draftA,
        orchestratorGroupId: 'daily',
        orchestratorGroupEffort: 'high',
        assignmentDefault: draftB,
        assignmentModels: [{ ...draftB, allowedEfforts: [''], defaultEffort: '' }],
        assignmentGroups: ['daily'],
        assignmentDefaultGroupId: 'daily',
        assignmentGroupOptions: [{ group: 'daily', allowedEfforts: ['max'], defaultEffort: 'max' }],
      },
      '',
    );
    expect(draft.advanced).toBe(false);
    expect(draft.orchestrator.effort).toBe('high');
    expect(draft.assignment.effort).toBe('max');
    expect(planParts(draft, [draftDaily])?.groups).toEqual({
      orchestratorGroupId: 'daily',
      orchestratorGroupEffort: 'high',
      assignmentGroups: ['daily'],
      assignmentDefaultGroupId: 'daily',
      assignmentGroupOptions: [{ group: 'daily', allowedEfforts: ['max'], defaultEffort: 'max' }],
    });
    const plain = {
      ...draft,
      orchestrator: { ...draft.orchestrator, effort: '' },
      assignment: { ...draft.assignment, effort: '' },
    };
    expect(planParts(plain, [draftDaily])?.groups).toEqual({
      orchestratorGroupId: 'daily',
      assignmentGroups: ['daily'],
      assignmentDefaultGroupId: 'daily',
      assignmentGroupOptions: [],
    });
  });

  it('carries the group effort into advanced mode and back', () => {
    const simple = draftOf(
      {
        orchestrator: draftA,
        assignmentDefault: draftB,
        assignmentGroups: ['daily'],
        assignmentDefaultGroupId: 'daily',
      },
      '',
    );
    const advanced = withAdvanced(
      { ...simple, assignment: { ...simple.assignment, effort: 'high' } },
      true,
    );
    expect(advanced.groups).toEqual([
      { group: 'daily', allowedEfforts: ['high'], defaultEffort: 'high' },
    ]);
    expect(withAdvanced(advanced, false).assignment.effort).toBe('high');
    const cleared = withAdvanced(
      {
        ...advanced,
        groups: [{ ...advanced.groups[0]!, note: 'Daily work' }],
        advanced: false,
        assignment: { ...advanced.assignment, effort: '' },
      },
      true,
    );
    expect(cleared.groups).toEqual([{ group: 'daily', note: 'Daily work' }]);
    expect(withAdvanced(cleared, false).assignment.effort).toBe('');
  });
});
