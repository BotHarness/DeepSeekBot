// @vitest-environment jsdom
import {
  addTask,
  button,
  catalog,
  choose,
  labelled,
  openPicker,
  picked,
  taskTiles,
  translate,
  trigger,
} from './model-preset-profile-fixtures.js';
import { type Root } from 'react-dom/client';
import type { ModelPlanView } from '../src/client/bridge.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import type { ModelPresetView } from '../src/client/bridge.js';
import { engineApi, type EngineSelectionView } from '../src/client/engine-choice.js';
import { markOriginActions } from '../src/client/origin-actions.js';
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

describe('Subscription models in the model dialog', () => {
  const route = { provider: 'deepseek', model: 'flash' };
  const plan: ModelPlanView = {
    revision: 7,
    orchestrator: route,
    assignmentDefault: route,
    sourcePresetId: '',
    sourcePresetName: '',
  };

  function fixture(selections: EngineSelectionView[] = [], presets: ModelPresetView[] = []) {
    const read = vi.spyOn(engineApi, 'read').mockImplementation(async () => ({
      engines: [{ engine: 'codex', available: true, installed: true }],
      selections,
    }));
    vi.spyOn(engineApi, 'models').mockResolvedValue([
      {
        id: 'gpt-6',
        name: 'GPT-6 Subscription',
        efforts: [
          { id: 'medium', name: 'Medium' },
          { id: 'high', name: 'High' },
        ],
        defaultEffort: 'medium',
        isDefault: true,
      },
    ]);
    const use = vi
      .spyOn(engineApi, 'use')
      .mockImplementation(async (botSlug, role, engine, options) => {
        selections = selections.filter((entry) => entry.botSlug !== botSlug || entry.role !== role);
        if (engine !== null) selections.push({ botSlug, role, engine, ...options });
      });
    const apply = vi.fn(async () => plan);
    const set = vi.fn(
      async (
        _slug: string,
        _revision: number,
        _main: unknown,
        sub: NonNullable<ModelPlanView['sub']>,
      ): Promise<ModelPlanView> => ({ ...plan, revision: 8, sub }),
    );
    const actions = {
      modelPlanState: async () => ({ plan }),
      modelCatalog: async () => ({ models: catalog }),
      modelPresets: async () => presets,
      setModelPlanSub: set,
      applyModelPreset: apply,
    } as unknown as BridgeActions;
    return { actions, read, use, apply, set };
  }

  afterEach(() => vi.restoreAllMocks());

  it('stages a model and a role-specific effort in each picker until Save', async () => {
    const { actions, use, set } = fixture();
    await render(markOriginActions(actions), vi.fn());
    await choose('Main model', 'gpt-6', 'GPT-6 Subscription');
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Main model · Reasoning effort"] button:last-child',
        )!
        .click(),
    );
    await act(async () => labelled('Remove Flash').click());
    await addTask('gpt-6', 'GPT-6 Subscription');
    expect(picked('Main model')).toBe('GPT-6 Subscription');
    expect(taskTiles()).toEqual([expect.stringMatching(/^GPT-6 Subscription.*Default/)]);
    expect(use).not.toHaveBeenCalled();
    await act(async () => button('Save').click());
    expect(set).toHaveBeenCalledExactlyOnceWith('ada', 7, expect.anything(), {
      choices: [{ kind: 'engine', engine: 'codex', model: 'gpt-6', effort: 'medium' }],
      default: { kind: 'engine', engine: 'codex', model: 'gpt-6' },
    });
    expect(use.mock.calls).toEqual([
      ['ada', 'orchestrator', 'codex', { model: 'gpt-6', effort: 'high' }],
    ]);
  });

  it('persists an explicit model for an engine configured before model selection was available', async () => {
    const { actions, use } = fixture([{ botSlug: 'ada', role: 'orchestrator', engine: 'codex' }]);
    await render(markOriginActions(actions), vi.fn());
    expect(picked('Main model')).toBe('GPT-6 Subscription');
    await choose('Main model', 'gpt-6', 'GPT-6 Subscription');
    await act(async () => button('Save').click());
    expect(use).toHaveBeenCalledExactlyOnceWith('ada', 'orchestrator', 'codex', {
      model: 'gpt-6',
      effort: 'medium',
    });
  });

  it('moves a live task engine into the saved list and clears the old role selection', async () => {
    const choice = { botSlug: 'ada', engine: 'codex' as const, model: 'gpt-6', effort: 'high' };
    const { actions, use, set } = fixture([
      { ...choice, role: 'orchestrator' },
      { ...choice, role: 'assignment' },
    ]);
    await render(markOriginActions(actions), vi.fn());
    expect(picked('Main model')).toBe('GPT-6 Subscription');
    expect(taskTiles()).toEqual([
      expect.stringContaining('Flash'),
      expect.stringMatching(/^GPT-6 Subscription.*Default/),
    ]);
    await choose('Main model', 'pro', 'Pro');
    await act(async () => button('Save').click());
    expect(set).toHaveBeenCalledExactlyOnceWith('ada', 7, expect.anything(), {
      choices: [
        expect.objectContaining({ kind: 'model', model: 'flash' }),
        { kind: 'engine', engine: 'codex', model: 'gpt-6', effort: 'high' },
      ],
      default: { kind: 'engine', engine: 'codex', model: 'gpt-6' },
    });
    expect(use.mock.calls).toEqual([
      ['ada', 'orchestrator', null, {}],
      ['ada', 'assignment', null, {}],
    ]);
    expect(set.mock.invocationCallOrder[0]).toBeLessThan(use.mock.invocationCallOrder[0]!);
  });

  it('previews both DSH models and enables Save when staging a DSH preset over live engines', async () => {
    const choice = { botSlug: 'ada', engine: 'codex' as const, model: 'gpt-6', effort: 'high' };
    const preset: ModelPresetView = {
      id: 'dsh-preset',
      name: 'DSH setup',
      revision: 1,
      orchestrator: route,
      assignmentDefault: { provider: 'deepseek', model: 'pro' },
    };
    const { actions, apply, use } = fixture(
      [
        { ...choice, role: 'orchestrator' },
        { ...choice, role: 'assignment' },
      ],
      [preset],
    );
    await render(markOriginActions(actions), vi.fn());
    expect(picked('Main model')).toBe('GPT-6 Subscription');
    expect(taskTiles()).toContainEqual(expect.stringContaining('GPT-6 Subscription'));

    await act(async () => button('Choose preset').click());
    const row = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-model-preset-source] button'),
    ].find((candidate) => candidate.querySelector('.bh-card-title')?.textContent === preset.name)!;
    await act(async () => row.click());
    await act(async () => button('Specific models').click());
    expect(picked('Main model')).toBe('Flash');
    expect(taskTiles()).toEqual([expect.stringContaining('Pro')]);
    expect(button('Save').disabled).toBe(false);
    expect(apply).not.toHaveBeenCalled();

    await act(async () => button('Save').click());
    expect(apply).toHaveBeenCalledExactlyOnceWith('ada', preset.id);
    expect(use).not.toHaveBeenCalled();
  });

  it('shows a live task engine on an inheriting plan and moves it into the list on save', async () => {
    const choice = { botSlug: 'ada', engine: 'codex' as const, model: 'gpt-6', effort: 'high' };
    const { actions, use, set } = fixture([{ ...choice, role: 'assignment' }]);
    const mainOnly: ModelPlanView = {
      revision: 7,
      orchestrator: route,
      sourcePresetId: '',
      sourcePresetName: '',
    };
    const customize = vi.fn();
    await render(
      markOriginActions({
        ...actions,
        modelPlanState: async () => ({ plan: mainOnly }),
        customizeModelPlan: customize,
      } as unknown as BridgeActions),
      vi.fn(),
    );
    expect(taskTiles()).toContainEqual(expect.stringMatching(/^GPT-6 Subscription.*Default/));
    await choose('Main model', 'pro', 'Pro');
    await act(async () => button('Save').click());
    expect(customize).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledExactlyOnceWith('ada', 7, expect.anything(), {
      choices: [{ kind: 'engine', engine: 'codex', model: 'gpt-6', effort: 'high' }],
      default: { kind: 'engine', engine: 'codex', model: 'gpt-6' },
    });
    expect(use.mock.calls).toEqual([['ada', 'assignment', null, {}]]);
  });

  it('waits for the engine read before saving a plan without a stored list', async () => {
    const { actions, read } = fixture([]);
    let finishRead: () => void = () => undefined;
    read.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = () =>
            resolve({
              engines: [{ engine: 'codex', available: true, installed: true }],
              selections: [],
            });
        }),
    );
    await render(markOriginActions(actions), vi.fn());
    await choose('Main model', 'pro', 'Pro');
    expect(button('Save').disabled).toBe(true);
    await act(async () => finishRead());
    expect(button('Save').disabled).toBe(false);
  });

  it('locks the Task list until the engine read returns an existing task engine', async () => {
    const choice = { botSlug: 'ada', engine: 'codex' as const, model: 'gpt-6', effort: 'high' };
    const { actions, read } = fixture([]);
    let finishRead: () => void = () => undefined;
    read.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = () =>
            resolve({
              engines: [{ engine: 'codex', available: true, installed: true }],
              selections: [{ ...choice, role: 'assignment' }],
            });
        }),
    );
    await render(markOriginActions(actions), vi.fn());
    expect(trigger('Add a task model')?.disabled).toBe(true);
    expect(labelled('Remove Flash').disabled).toBe(true);
    await act(async () => finishRead());
    expect(trigger('Add a task model')?.disabled).toBe(false);
    expect(taskTiles()).toContainEqual(expect.stringMatching(/^GPT-6 Subscription.*Default/));
  });

  it('warns before a task engine migration ends an open Assignment policy', async () => {
    const choice = { botSlug: 'ada', engine: 'codex' as const, model: 'gpt-6', effort: 'high' };
    const { actions, set } = fixture([{ ...choice, role: 'assignment' }]);
    await render(
      markOriginActions({
        ...actions,
        modelPlanState: async () => ({ plan: { ...plan, openAssignmentModels: true } }),
      } as unknown as BridgeActions),
      vi.fn(),
    );
    expect(document.body.textContent).toContain(translate('modelPreset.openDropped'));
    await choose('Main model', 'pro', 'Pro');
    await act(async () => button('Save').click());
    expect(set).toHaveBeenCalledOnce();
  });

  it('keeps a live task engine that differs from an engine already in the inherited list', async () => {
    const live = { botSlug: 'ada', engine: 'codex' as const, model: 'gpt-6', effort: 'high' };
    const { actions, use, set } = fixture([{ ...live, role: 'assignment' }]);
    const mainOnly: ModelPlanView = {
      revision: 7,
      orchestrator: route,
      sourcePresetId: '',
      sourcePresetName: '',
    };
    const inherited = {
      id: 'default',
      name: 'Default',
      revision: 1,
      orchestrator: route,
      assignmentDefault: route,
      sub: {
        choices: [{ kind: 'engine' as const, engine: 'codex' as const, model: 'gpt-5' }],
        default: { kind: 'engine' as const, engine: 'codex' as const, model: 'gpt-5' },
      },
    } as ModelPresetView;
    await render(
      markOriginActions({
        ...actions,
        modelPlanState: async () => ({ plan: mainOnly }),
        modelPresets: async () => [inherited],
      } as unknown as BridgeActions),
      vi.fn(),
    );
    await choose('Main model', 'pro', 'Pro');
    await act(async () => button('Save').click());
    expect(set).toHaveBeenCalledExactlyOnceWith('ada', 7, expect.anything(), {
      choices: [
        { kind: 'engine', engine: 'codex', model: 'gpt-5' },
        { kind: 'engine', engine: 'codex', model: 'gpt-6', effort: 'high' },
      ],
      default: { kind: 'engine', engine: 'codex', model: 'gpt-6' },
    });
    expect(use.mock.calls).toContainEqual(['ada', 'assignment', null, {}]);
  });

  it('migrates a live task engine even when only the main engine changes', async () => {
    const live = { botSlug: 'ada', engine: 'codex' as const, model: 'gpt-6', effort: 'high' };
    const { actions, use, set } = fixture([{ ...live, role: 'assignment' }]);
    await render(markOriginActions(actions), vi.fn());
    await choose('Main model', 'gpt-6', 'GPT-6 Subscription');
    await act(async () => button('Save').click());
    expect(set).toHaveBeenCalledOnce();
    expect(use.mock.calls).toEqual([
      ['ada', 'orchestrator', 'codex', { model: 'gpt-6', effort: 'medium' }],
      ['ada', 'assignment', null, {}],
    ]);
  });

  it('retries a failed task-role clear without writing the plan again', async () => {
    const choice = { botSlug: 'ada', engine: 'codex' as const, model: 'gpt-6', effort: 'high' };
    const { actions, use, set } = fixture([{ ...choice, role: 'assignment' }]);
    let failClear = true;
    use.mockImplementation(async (_slug, role, engine) => {
      if (role === 'assignment' && engine === null && failClear) {
        failClear = false;
        throw new Error('clear failed');
      }
    });
    let current: ModelPlanView = plan;
    set.mockImplementation(async (_slug, _revision, _main, sub) => {
      current = { ...plan, revision: 8, sub };
      return current;
    });
    await render(
      markOriginActions({
        ...actions,
        modelPlanState: async () => ({ plan: current }),
      } as unknown as BridgeActions),
      vi.fn(),
    );
    await choose('Main model', 'pro', 'Pro');
    await act(async () => button('Save').click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('clear failed');
    expect(set).toHaveBeenCalledOnce();
    await act(async () => button('Save').click());
    expect(set).toHaveBeenCalledOnce();
    expect(use.mock.calls.filter(([, role]) => role === 'assignment')).toHaveLength(2);
  });

  it('keeps the remote picker on the remote DSH catalog', async () => {
    const { actions, read } = fixture();
    await render(actions, vi.fn());
    await openPicker('Main model');
    expect(document.querySelector('[data-picker-filter="engine:codex"]')).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
