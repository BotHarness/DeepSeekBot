// @vitest-environment jsdom
import {
  button,
  cards,
  catalog,
  choose,
  openEditor,
  openPicker,
  picked,
  translate,
} from './model-preset-profile-fixtures.js';
import { type Root } from 'react-dom/client';
import type { ModelPlanView } from '../src/client/bridge.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import type { ModelPresetView } from '../src/client/bridge.js';
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

function presetPlan(preset: ModelPresetView, revision: number): ModelPlanView {
  return {
    revision,
    sourcePresetId: preset.id,
    sourcePresetName: preset.name,
    orchestrator: preset.orchestrator,
    assignmentDefault: preset.assignmentDefault,
    ...(preset.assignmentModels === undefined ? {} : { assignmentModels: preset.assignmentModels }),
    appliedAt: '',
  };
}

describe('Model entry', () => {
  it('opens the composer editor directly and cancels without writing either model', async () => {
    const onClose = vi.fn();
    const setModelPlan = vi.fn();
    const applyModelPreset = vi.fn();
    await render(
      {
        modelPlanState: vi.fn(async () => ({})),
        modelCatalog: vi.fn(async () => ({ models: catalog })),
        modelPresets: vi.fn(async () => []),
        setModelPlan,
        applyModelPreset,
      } as unknown as BridgeActions,
      onClose,
    );
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector('.bh-model-entry > .bh-card-list')).toBeNull();
    expect(picked('Main model')).toBe('Flash');
    expect(picked('Task model')).toBe('Inherit global');
    await choose('Task model', 'pro', 'Pro');
    await act(async () => button('Cancel').click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(setModelPlan).not.toHaveBeenCalled();
    expect(applyModelPreset).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('explains an empty preset list and preserves the model draft when switching back', async () => {
    await render(
      {
        modelPlanState: vi.fn(async () => ({})),
        modelCatalog: vi.fn(async () => ({ models: catalog })),
        modelPresets: vi.fn(async () => []),
      } as unknown as BridgeActions,
      vi.fn(),
    );
    await choose('Task model', 'pro', 'Pro');
    await act(async () => button('Choose preset').click());
    expect(document.body.textContent).toContain('No Model Presets yet');
    expect(document.querySelector('input[aria-label="Main model"]')).toBeNull();
    expect(button('Save').disabled).toBe(true);
    await act(async () => button('Specific models').click());
    expect(picked('Main model')).toBe('Flash');
    expect(picked('Task model')).toBe('Pro');
    expect(button('Save').disabled).toBe(false);
  });

  it('does not materialize an inherited plan when the composer saves without edits', async () => {
    const customizeModelPlan = vi.fn();
    const setModelPlan = vi.fn();
    const applyModelPreset = vi.fn();
    await render(
      {
        modelPlanState: vi.fn(async () => ({ revision: 3 })),
        modelCatalog: vi.fn(async () => ({ models: catalog })),
        modelPresets: vi.fn(async () => []),
        customizeModelPlan,
        setModelPlan,
        applyModelPreset,
      } as unknown as BridgeActions,
      vi.fn(),
    );
    expect(picked('Main model')).toBe('Flash');
    expect(picked('Task model')).toBe('Inherit global');
    expect(button('Save').disabled).toBe(true);
    await act(async () => button('Save').click());
    expect(customizeModelPlan).not.toHaveBeenCalled();
    expect(setModelPlan).not.toHaveBeenCalled();
    expect(applyModelPreset).not.toHaveBeenCalled();
  });

  it('keeps tasks inherited after a composer main-only edit without a plan', async () => {
    const orchestrator = { provider: 'deepseek', model: 'pro' };
    const customizeModelPlan = vi.fn(async () => ({
      revision: 4,
      sourcePresetId: '',
      sourcePresetName: '',
      appliedAt: '',
      orchestrator,
    }));
    const setModelPlan = vi.fn();
    await render(
      {
        modelPlanState: vi.fn(async () => ({ revision: 3 })),
        modelCatalog: vi.fn(async () => ({ models: catalog })),
        modelPresets: vi.fn(async () => []),
        customizeModelPlan,
        setModelPlan,
      } as unknown as BridgeActions,
      vi.fn(),
    );
    await choose('Main model', 'pro', 'Pro');
    expect(picked('Task model')).toBe('Inherit global');
    await act(async () => button('Save').click());
    expect(customizeModelPlan).toHaveBeenCalledExactlyOnceWith('ada', orchestrator, 3);
    expect(setModelPlan).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('saves a task-only edit from the composer without changing the main model', async () => {
    const plan: ModelPlanView = {
      revision: 4,
      sourcePresetId: '',
      sourcePresetName: '',
      appliedAt: '',
      orchestrator: { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
      assignmentDefault: { provider: 'deepseek', model: 'flash' },
    };
    const onClose = vi.fn();
    const setModelPlan = vi.fn(async () => ({ ...plan, revision: 5 }));
    await render(
      {
        modelPlanState: vi.fn(async () => ({ plan })),
        modelCatalog: vi.fn(async () => ({ models: catalog })),
        modelPresets: vi.fn(async () => []),
        setModelPlan,
      } as unknown as BridgeActions,
      onClose,
    );
    await choose('Task model', 'pro', 'Pro');
    await act(async () => button('Save').click());
    expect(setModelPlan).toHaveBeenCalledExactlyOnceWith(
      'ada',
      4,
      plan.orchestrator,
      { provider: 'deepseek', model: 'pro' },
      [{ provider: 'deepseek', model: 'pro', allowedEfforts: [''], defaultEffort: '' }],
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens Assignments to any model with the switch and shows it on the card', async () => {
    const plan: ModelPlanView = {
      revision: 4,
      sourcePresetId: '',
      sourcePresetName: '',
      appliedAt: '',
      orchestrator: { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
      assignmentDefault: { provider: 'deepseek', model: 'flash' },
    };
    const onClose = vi.fn();
    const setModelPlan = vi.fn(async () => ({
      ...plan,
      revision: 5,
      openAssignmentModels: true as const,
    }));
    await render(
      {
        modelPlanState: vi.fn(async () => ({ plan })),
        modelCatalog: vi.fn(async () => ({ models: catalog })),
        modelPresets: vi.fn(async () => []),
        setModelPlan,
      } as unknown as BridgeActions,
      onClose,
    );
    const toggle = document.querySelector<HTMLButtonElement>(
      'button[role="switch"][aria-label="Allow any model"]',
    )!;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await act(async () => button('Save').click());
    expect(setModelPlan).toHaveBeenCalledExactlyOnceWith(
      'ada',
      4,
      plan.orchestrator,
      { provider: 'deepseek', model: 'flash' },
      [{ provider: 'deepseek', model: 'flash', allowedEfforts: [''], defaultEffort: '' }],
      true,
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the editor and draft open after a rejected save', async () => {
    const onClose = vi.fn();
    await render(
      {
        modelPlanState: vi.fn(async () => ({})),
        modelCatalog: vi.fn(async () => ({ models: catalog })),
        modelPresets: vi.fn(async () => []),
        setModelPlan: vi.fn(async () => {
          throw new Error('Revision conflict');
        }),
      } as unknown as BridgeActions,
      onClose,
    );
    await choose('Task model', 'pro', 'Pro');
    await act(async () => button('Save').click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Revision conflict');
    expect(picked('Task model')).toBe('Pro');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('explains an ambiguous legacy model before the editor opens', async () => {
    const host = await render({
      modelPlanState: vi.fn(async () => ({
        repair: {
          code: 'legacy-ambiguous',
          legacyModel: 'shared-model',
          message: 'Choose a provider',
        },
      })),
    } as unknown as BridgeActions);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(cards(host)).toContain('Select an available model');
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'shared-model matches multiple providers',
    );
  });

  it('sets the main and task models directly without any preset', async () => {
    let plan: ModelPlanView | undefined;
    const setModelPlan = vi.fn(
      async (
        _slug: string,
        _revision: number,
        orchestrator: ModelPlanView['orchestrator'],
        assignmentDefault: NonNullable<ModelPlanView['assignmentDefault']>,
        assignmentModels: NonNullable<ModelPlanView['assignmentModels']>,
      ) => {
        plan = {
          revision: 1,
          sourcePresetId: '',
          sourcePresetName: '',
          orchestrator,
          assignmentDefault,
          assignmentModels,
          appliedAt: '',
        };
        return plan;
      },
    );
    const host = await render({
      modelPlanState: vi.fn(async () => (plan === undefined ? {} : { plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog })),
      setModelPlan,
    } as unknown as BridgeActions);
    expect(cards(host)).toContain('Inherit global');
    await openEditor(host);
    expect(document.querySelector('[data-model-preset-source]')).toBeNull();

    await choose('Main model', 'flash', 'Flash');
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Main model · Reasoning effort"] button:last-child',
        )!
        .click(),
    );
    await choose('Task model', 'moon', 'Kimi K2');
    await act(async () => button('Save').click());

    expect(setModelPlan).toHaveBeenCalledExactlyOnceWith(
      'ada',
      0,
      { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
      { provider: 'kimi', model: 'k2' },
      [{ provider: 'kimi', model: 'k2', allowedEfforts: [''], defaultEffort: '' }],
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(cards(host)).toContain('Main model');
    expect(cards(host)).toContain('flash · high');
    expect(cards(host)).toContain('Task model');
    expect(cards(host)).toContain('k2 · Default');
    expect(document.body.querySelectorAll('.bh-model-entry button.bh-card-main')).toHaveLength(1);
  });

  it('preselects the DSH default model and offers keyless providers as unpickable', async () => {
    const k2 = { provider: 'kimi', model: 'k2' };
    const setModelPlan = vi.fn(async (): Promise<ModelPlanView> => ({
      revision: 1,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: k2,
      assignmentDefault: k2,
      appliedAt: '',
    }));
    await render({
      modelPlanState: vi.fn(async () => ({})),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({
        models: [
          { ...catalog[0]!, credential: 'missing' as const },
          { ...catalog[1]!, credential: 'missing' as const },
          catalog[2]!,
        ],
        default: { provider: 'kimi', model: 'k2' },
      })),
      setModelPlan,
    } as unknown as BridgeActions);
    await openEditor(document.body);

    expect(picked('Main model')).toBe('Kimi K2');
    expect(picked('Task model')).toBe('Inherit global');
    await openPicker('Main model');
    const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options.map((option) => [option.getAttribute('aria-label'), option.disabled])).toEqual([
      ['Kimi K2 · Moonshot', false],
      ['Flash · DeepSeek · needs an API key', true],
      ['Pro · DeepSeek · needs an API key', true],
    ]);
    await openPicker('Main model');

    expect(button('Save').disabled).toBe(true);
    await choose('Task model', 'k2', 'Kimi K2');
    await act(async () => button('Save').click());
    expect(setModelPlan).toHaveBeenCalledWith(
      'ada',
      0,
      { provider: 'kimi', model: 'k2' },
      { provider: 'kimi', model: 'k2' },
      [
        {
          provider: 'kimi',
          model: 'k2',
          allowedEfforts: [''],
          defaultEffort: '',
        },
      ],
    );
  });

  it('fills from a preset, applies it untouched, and unlinks it after an edit', async () => {
    const flash = { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' };
    const pro = { provider: 'deepseek', model: 'pro' };
    const presets: ModelPresetView[] = [
      {
        id: 'daily',
        name: 'Daily',
        revision: 1,
        orchestrator: flash,
        assignmentDefault: pro,
        createdAt: '',
      } as ModelPresetView,
      {
        id: 'deep',
        name: 'Deep',
        revision: 1,
        orchestrator: { ...flash, reasoningEffort: 'high' },
        assignmentDefault: pro,
        createdAt: '',
      } as ModelPresetView,
    ];
    let plan = presetPlan(presets[0]!, 1);
    const applyModelPreset = vi.fn(async (_slug: string, id: string) => {
      plan = presetPlan(
        presets.find((preset) => preset.id === id)!,
        plan.revision + 1,
      );
      return plan;
    });
    const setModelPlan = vi.fn(async () => {
      plan = { ...plan, revision: plan.revision + 1, sourcePresetId: '', sourcePresetName: '' };
      return plan;
    });
    const host = await render({
      modelPlanState: vi.fn(async () => ({ plan })),
      modelPresets: vi.fn(async () => presets),
      modelCatalog: vi.fn(async () => ({ models: catalog })),
      applyModelPreset,
      setModelPlan,
    } as unknown as BridgeActions);
    expect(cards(host)).toContain('Daily');

    await openEditor(host);
    expect(picked('Main model')).toBe('Flash');
    expect(picked('Task model')).toBe('Pro');
    expect(document.querySelector('[data-model-preset-source]')).toBeNull();
    await act(async () => button('Choose preset').click());
    expect(document.querySelector('[data-model-preset-source]')?.textContent).toContain(
      'Using preset “Daily”',
    );
    const deep = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-model-preset-source] button'),
    ].find((candidate) => candidate.querySelector('.bh-card-title')?.textContent === 'Deep')!;
    expect(deep.textContent).toContain('Main model · Flash · high');
    expect(deep.textContent).toContain('Task model · Pro');
    await act(async () => deep.click());
    expect(document.querySelector('[data-model-preset-source]')?.textContent).toContain(
      'Using preset “Deep”',
    );
    await act(async () => button('Save').click());
    expect(applyModelPreset).toHaveBeenCalledExactlyOnceWith('ada', 'deep');
    expect(setModelPlan).not.toHaveBeenCalled();
    expect(cards(host)).toContain('Deep');
    expect(cards(host)).toContain('flash · high');

    await openEditor(host);
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Main model · Reasoning effort"] button')!
        .click(),
    );
    await act(async () => button('Choose preset').click());
    expect(document.querySelector('[data-model-preset-source]')?.textContent).toContain(
      'No preset',
    );
    expect(button('Save').disabled).toBe(true);
    await act(async () => button('Specific models').click());
    await act(async () => button('Save').click());
    expect(setModelPlan).toHaveBeenCalledWith(
      'ada',
      2,
      { provider: 'deepseek', model: 'flash' },
      pro,
      [{ provider: 'deepseek', model: 'pro', allowedEfforts: [''], defaultEffort: '' }],
    );
    expect(cards(host)).not.toContain('Deep');
  });

  it('opens Model Presets in Bot Settings from the Bot model dialog', async () => {
    const openModelPresets = vi.fn();
    const host = await render({
      modelPlanState: vi.fn(async () => ({})),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog })),
      openModelPresets,
    } as unknown as BridgeActions);
    await openEditor(host);
    expect(button('Choose preset')).toBeTruthy();
    await act(async () => button('Open Model configuration').click());
    expect(openModelPresets).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('switches the task model to advanced cards with notes, efforts and a chosen default', async () => {
    const route = { provider: 'deepseek', model: 'pro' };
    const plan: ModelPlanView = {
      revision: 2,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: route,
      assignmentDefault: route,
      appliedAt: '',
    };
    const setModelPlan = vi.fn(async () => plan);
    const host = await render({
      modelPlanState: vi.fn(async () => ({ plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog })),
      setModelPlan,
    } as unknown as BridgeActions);
    await openEditor(host);
    const mode = (name: string) =>
      document.querySelector<HTMLButtonElement>(
        `[aria-label="Task model mode"] [role="tab"]:${name === 'Simple' ? 'first' : 'last'}-child`,
      )!;
    expect(mode('Simple').getAttribute('aria-selected')).toBe('true');
    expect(picked('Task model')).toBe('Pro');
    await act(async () => mode('Advanced').click());
    expect(mode('Advanced').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('input[role="combobox"][aria-label="Task model"]')).toBeNull();
    await openPicker('Add an allowed model');
    expect(document.querySelector('[data-picker-filter="all"]')).not.toBeNull();
    expect(document.querySelector('[data-picker-filter="deepseek"]')).not.toBeNull();
    await openPicker('Add an allowed model');

    await choose('Add an allowed model', 'kimi', 'Kimi K2');
    await choose('Add an allowed model', 'flash', 'Flash');
    const card = (name: string) =>
      [...document.querySelectorAll<HTMLElement>('li.bh-model-card')].find(
        (item) => item.querySelector('strong')?.textContent === name,
      )!;
    expect(
      [...document.querySelectorAll('li.bh-model-card strong')].map((item) => item.textContent),
    ).toEqual(['Flash', 'Kimi K2', 'Pro']);
    expect(card('Pro').textContent).toContain('Default');

    const type = async (label: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await type('When to use Pro', '  Hard debugging  ');
    await type('When to use Kimi K2', 'Quick lookups');
    await type('When to use Flash', '   ');
    const effortBoxes = [...card('Flash').querySelectorAll<HTMLInputElement>('label input')];
    expect(effortBoxes.map((input) => input.checked)).toEqual([true, true, true]);
    const low = [...card('Flash').querySelectorAll('label')].find(
      (label) => label.textContent === 'Low',
    )!;
    await act(async () => low.querySelector('input')!.click());
    await act(async () =>
      card('Flash')
        .querySelector<HTMLButtonElement>(
          '[aria-label="Flash · Default effort"] button:last-child',
        )!
        .click(),
    );
    await act(async () => card('Flash').querySelector<HTMLButtonElement>('button')!.click());
    expect(card('Flash').textContent).toContain('Default');
    expect(card('Pro').querySelector('[aria-label="Remove Pro"]')).not.toBeNull();

    await act(async () => button('Save').click());
    expect(setModelPlan).toHaveBeenCalledExactlyOnceWith(
      'ada',
      2,
      route,
      { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
      [
        {
          provider: 'deepseek',
          model: 'flash',
          allowedEfforts: ['', 'high'],
          defaultEffort: 'high',
        },
        {
          provider: 'kimi',
          model: 'k2',
          allowedEfforts: [''],
          defaultEffort: '',
          note: 'Quick lookups',
        },
        {
          provider: 'deepseek',
          model: 'pro',
          allowedEfforts: [''],
          defaultEffort: '',
          note: 'Hard debugging',
        },
      ],
    );
  });

  it('opens a saved model set in advanced mode and saves one model after switching back to simple', async () => {
    const pro = { provider: 'deepseek', model: 'pro' };
    const plan: ModelPlanView = {
      revision: 3,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: pro,
      assignmentDefault: { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
      assignmentModels: [
        {
          provider: 'deepseek',
          model: 'flash',
          allowedEfforts: ['low', 'high'],
          defaultEffort: 'low',
        },
        { provider: 'deepseek', model: 'pro', allowedEfforts: [''], defaultEffort: '' },
      ],
      appliedAt: '',
    };
    const setModelPlan = vi.fn(async () => plan);
    const host = await render({
      modelPlanState: vi.fn(async () => ({ plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog })),
      setModelPlan,
    } as unknown as BridgeActions);
    await openEditor(host);
    expect(button('Advanced').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelectorAll('li.bh-model-card')).toHaveLength(2);
    await act(async () => button('Simple').click());
    expect(document.querySelector('li.bh-model-card')).toBeNull();
    expect(picked('Task model')).toBe('Flash');
    await act(async () => button('Save').click());
    expect(setModelPlan).toHaveBeenCalledExactlyOnceWith(
      'ada',
      3,
      pro,
      { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
      [{ provider: 'deepseek', model: 'flash', allowedEfforts: ['low'], defaultEffort: 'low' }],
    );
  });

  it('keeps a saved plan when an older editor load finishes later', async () => {
    const route = { provider: 'deepseek', model: 'pro' };
    let plan: ModelPlanView = {
      revision: 1,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: route,
      assignmentDefault: route,
      appliedAt: '',
    };
    const original = plan;
    let finishStale!: (value: { plan: ModelPlanView }) => void;
    const stale = new Promise<{ plan: ModelPlanView }>((resolve) => {
      finishStale = resolve;
    });
    let reads = 0;
    const host = await render({
      modelPlanState: vi.fn(async () => (++reads === 3 ? stale : { plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog })),
      setModelPlan: vi.fn(async () => {
        plan = { ...plan, revision: 2, orchestrator: { provider: 'kimi', model: 'k2' } };
        return plan;
      }),
    } as unknown as BridgeActions);
    await openEditor(host);
    await choose('Main model', 'k2', 'Kimi K2');
    await act(async () => button('Save').click());
    expect(cards(host)).toContain('k2 · Default');
    await openEditor(host);
    await act(async () => button('Cancel').click());
    await act(async () => finishStale({ plan: original }));
    expect(cards(host)).toContain('k2 · Default');
  });
});

it('keeps inherited Assignment settings when editing an Orchestrator-only plan', async () => {
  const plan: ModelPlanView = {
    revision: 7,
    sourcePresetId: '',
    sourcePresetName: '',
    orchestrator: catalog[0]!,
    appliedAt: '',
  };
  const customizeModelPlan = vi.fn(async () => ({ ...plan, revision: 8 }));
  const setModelPlan = vi.fn();
  const host = await render({
    modelPlanState: async () => ({ revision: 7, plan }),
    modelCatalog: async () => ({ models: catalog }),
    modelPresets: async () => [],
    customizeModelPlan,
    setModelPlan,
  } as unknown as BridgeActions);
  expect(cards(host)).toContain(translate('onboarding.inherit'));
  await openEditor(host);
  expect(picked(translate('modelPreset.assignment'))).toBe(translate('onboarding.inherit'));
  await act(async () => button(translate('modelPreset.save')).click());
  expect(customizeModelPlan).toHaveBeenCalledExactlyOnceWith(
    'ada',
    expect.objectContaining({ provider: catalog[0]!.provider, model: catalog[0]!.model }),
    7,
  );
  expect(setModelPlan).not.toHaveBeenCalled();
});
