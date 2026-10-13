// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement, forwardRef } = await import('react');
  return {
    Button: ({
      children,
      onClick,
      disabled,
      'aria-label': label,
    }: {
      children: ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      'aria-label'?: string;
    }) => createElement('button', { onClick, disabled, 'aria-label': label }, children),
    Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
    Checkbox: ({
      label,
      checked,
      disabled,
      onChange,
    }: {
      label: string;
      checked: boolean;
      disabled?: boolean;
      onChange: (next: boolean) => void;
    }) =>
      createElement(
        'label',
        null,
        createElement('input', {
          type: 'checkbox',
          checked,
          disabled,
          onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
        }),
        label,
      ),
    SegmentedControl: ({
      value,
      options,
      onChange,
      label,
    }: {
      value: string;
      options: { value: string; label: string }[];
      onChange: (next: string) => void;
      label: string;
    }) =>
      createElement(
        'div',
        { role: 'tablist', 'aria-label': label },
        options.map((option) =>
          createElement(
            'button',
            {
              key: option.value,
              role: 'tab',
              'aria-selected': option.value === value,
              onClick: () => onChange(option.value),
            },
            option.label,
          ),
        ),
      ),
    Input: (props: import('react').InputHTMLAttributes<HTMLInputElement>) =>
      createElement('span', null, createElement('input', props)),
    IconChevronDownOutlineRegular: () => null,
    MenuSurface: forwardRef<
      HTMLDivElement,
      import('react').HTMLAttributes<HTMLDivElement> & { compact?: boolean }
    >(({ compact: _compact, ...props }, ref) => createElement('div', { ...props, ref })),
    useAnchoredPosition: () => ({ top: 0, left: 0 }),
    useDismissOnOutsidePointer: () => undefined,
    Modal: ({
      open,
      title,
      children,
      footer,
    }: {
      open: boolean;
      title: string;
      children?: ReactNode;
      footer?: ReactNode;
    }) =>
      open ? createElement('div', { role: 'dialog', 'aria-label': title }, children, footer) : null,
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import type { ModelPlanView, ModelPresetView } from '../src/client/bridge.js';
import { en } from '../src/client/locale.js';
import { invalidateModelPlan, modelPlanOf } from '../src/client/model-plan-store.js';
import { OnboardingController } from '../src/client/onboarding.js';
import { ModelPresetProfile } from '../src/client/model-preset-profile.js';
import { OnboardingModelDialog, OnboardingWelcome } from '../src/client/onboarding-view.js';

function translate(key: string, params?: Record<string, unknown>): string {
  let text = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}

const catalog = [
  {
    provider: 'deepseek',
    providerName: 'DeepSeek',
    model: 'flash',
    modelName: 'Flash',
    efforts: [
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
    ],
  },
  {
    provider: 'deepseek',
    providerName: 'DeepSeek',
    model: 'pro',
    modelName: 'Pro',
    efforts: [],
  },
  {
    provider: 'kimi',
    providerName: 'Moonshot',
    model: 'k2',
    modelName: 'Kimi K2',
    efforts: [],
  },
];

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  document.body.innerHTML = '';
});

async function render(actions: BridgeActions): Promise<HTMLDivElement> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(createElement(ModelPresetProfile, { slug: 'ada', actions, t: translate })),
  );
  return container;
}

const cards = (host: HTMLElement): string =>
  host.querySelector('.bh-model-entry .bh-card-list')?.textContent ?? '';

async function openEditor(host: HTMLElement): Promise<void> {
  await act(async () => {
    host.querySelector<HTMLButtonElement>('.bh-model-entry button.bh-card-main')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === text,
  );
  if (found === undefined) throw new Error(`No button ${text}`);
  return found;
}

function combobox(label: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(
    `input[role="combobox"][aria-label="${label}"]`,
  );
  if (found === null) throw new Error(`No combobox ${label}`);
  return found;
}

async function choose(label: string, query: string, option: string): Promise<void> {
  const input = combobox(label);
  await act(async () => input.focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const match = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (candidate) => candidate.textContent?.startsWith(option),
  );
  if (match === undefined) throw new Error(`No option ${option} for ${query}`);
  await act(async () => match.click());
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
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
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
        assignmentDefault: ModelPlanView['assignmentDefault'],
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
    expect(document.querySelector('.bh-model-preset-source')).toBeNull();

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

    expect(combobox('Main model').value).toBe('Kimi K2');
    expect(combobox('Task model').value).toBe('Kimi K2');
    await act(async () => combobox('Main model').focus());
    await act(async () => {
      const input = combobox('Main model');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options.map((option) => [option.textContent, option.disabled])).toEqual([
      ['Kimi K2Moonshot', false],
      ['FlashDeepSeek · needs an API key', true],
      ['ProDeepSeek · needs an API key', true],
    ]);

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
    expect(document.querySelector('.bh-model-preset-source')?.textContent).toContain(
      'Using preset “Daily”',
    );
    await choose('Fill from a preset', 'dee', 'Deep');
    expect(document.querySelector('.bh-model-preset-source')?.textContent).toContain(
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
    expect(document.querySelector('.bh-model-preset-source')?.textContent).toContain('No preset');
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

  it('saves the current settings as a new preset and links the Bot to it', async () => {
    const route = { provider: 'deepseek', model: 'pro' };
    let plan: ModelPlanView = {
      revision: 3,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: route,
      assignmentDefault: route,
      appliedAt: '',
    };
    const presets: ModelPresetView[] = [];
    const createModelPreset = vi.fn(
      async (
        name: string,
        orchestrator: ModelPlanView['orchestrator'],
        assignmentDefault: ModelPlanView['assignmentDefault'],
        assignmentModels: ModelPlanView['assignmentModels'],
      ) => {
        const preset = {
          id: 'mine',
          name,
          revision: 1,
          orchestrator,
          assignmentDefault,
          assignmentModels,
          createdAt: '',
        } as ModelPresetView;
        presets.push(preset);
        return preset;
      },
    );
    const applyModelPreset = vi.fn(async () => {
      plan = presetPlan(presets[0]!, 4);
      return plan;
    });
    const host = await render({
      modelPlanState: vi.fn(async () => ({ plan })),
      modelPresets: vi.fn(async () => [...presets]),
      modelCatalog: vi.fn(async () => ({ models: catalog })),
      createModelPreset,
      applyModelPreset,
    } as unknown as BridgeActions);
    await openEditor(host);
    await act(async () => button('Advanced').click());
    await choose('Add an allowed model', 'kimi', 'Kimi K2');
    expect(document.querySelector('.bh-model-cards')?.textContent).toContain('Kimi K2');
    await act(async () => button('Save as preset').click());
    const name = document.querySelector<HTMLInputElement>('input[aria-label="Preset name"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        name,
        'My setup',
      );
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Save preset').click());
    expect(createModelPreset).toHaveBeenCalledExactlyOnceWith('My setup', route, route, [
      { provider: 'kimi', model: 'k2', allowedEfforts: [''], defaultEffort: '' },
      { provider: 'deepseek', model: 'pro', allowedEfforts: [''], defaultEffort: '' },
    ]);
    expect(applyModelPreset).toHaveBeenCalledExactlyOnceWith('ada', 'mine');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(cards(host)).toContain('My setup');
    expect(cards(host)).toContain('+1 allowed');
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
    expect(combobox('Task model').value).toBe('Pro');
    await act(async () => mode('Advanced').click());
    expect(mode('Advanced').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('input[role="combobox"][aria-label="Task model"]')).toBeNull();

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
    const high = [...card('Flash').querySelectorAll('label')].find(
      (label) => label.textContent === 'High',
    )!;
    await act(async () => high.querySelector('input')!.click());
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
    expect(combobox('Task model').value).toBe('Flash');
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

it('uses the shared model picker for onboarding and waits for an explicit model save after route and effort changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onConfirm = vi.fn(async () => {});
  const actions = {
    modelCatalog: vi.fn(async () => ({
      models: catalog,
      default: { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
    })),
    modelPlanState: vi.fn(async () => ({ revision: 7 })),
  } as unknown as BridgeActions;
  await act(async () =>
    root!.render(
      createElement(OnboardingModelDialog, {
        actions,
        slug: 'ada',
        title: 'Choose a model',
        request: 'My own question',
        onClose: vi.fn(),
        onConfirm,
        t: translate,
      }),
    ),
  );
  expect(document.querySelector('.bh-onboarding-request')?.textContent).toContain(
    'My own question',
  );
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  await choose('Model', 'Moonshot', 'Kimi K2');
  expect(document.querySelector('[role="tablist"]')).toBeNull();
  await choose('Model', 'Flash', 'Flash');
  await act(async () => button('High').click());
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  expect(onConfirm).not.toHaveBeenCalled();
  await act(async () => button('Save model').click());
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
    { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
    false,
    7,
  );
});

it('offers general, daily check-in and timed-test requests through the normal welcome send path', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const send = vi.fn(async () => true);
  const actions = {
    modelCatalog: vi.fn(async () => ({ models: catalog })),
    openChannel: vi.fn(async () => {}),
    send,
  } as unknown as BridgeActions;
  await act(async () =>
    root!.render(createElement(OnboardingWelcome, { actions, channelId: 'dm-ada', t: translate })),
  );
  const prompts = [en['onboarding.firstRequest'], en['onboarding.exampleRequest']];
  for (const prompt of prompts) {
    await act(async () => button(prompt).click());
    expect(send).toHaveBeenLastCalledWith(prompt);
  }
  for (const [title, prefix] of [
    [en['onboarding.dailyRequest'], 'daily'],
    [en['onboarding.testRequest'], 'reminder'],
  ] as const) {
    const option = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.querySelector('.bh-card-title')?.textContent === title,
    );
    if (option === undefined) throw new Error('Missing scheduling card');
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(option.textContent).toContain(
      timeZone
        ? translate(`onboarding.${prefix}Hint`, { timeZone })
        : en['onboarding.reminderUnknownHint'],
    );
    await act(async () => option.click());
    expect(send).toHaveBeenLastCalledWith(
      timeZone
        ? translate(`onboarding.${prefix}Body`, { timeZone })
        : translate(`onboarding.${prefix}UnknownBody`),
    );
  }
  expect(send).toHaveBeenCalledTimes(4);
});

it('refreshes the already-open Bot model card after onboarding saves a fixed model or returns to inheritance', async () => {
  let state: { revision: number; plan?: ModelPlanView } = { revision: 0 };
  const route = { provider: 'deepseek', model: 'flash' };
  const actions = {
    modelPlanState: vi.fn(async () => state),
    onboardingModel: vi.fn(
      async (_slug: string, _revision: number, _route: typeof route, globalDefault: boolean) => {
        state = globalDefault
          ? { revision: state.revision + 1 }
          : {
              revision: state.revision + 1,
              plan: {
                revision: state.revision + 1,
                sourcePresetId: '',
                sourcePresetName: '',
                orchestrator: route,
                assignmentDefault: route,
                appliedAt: '',
              },
            };
      },
    ),
  } as unknown as BridgeActions;
  invalidateModelPlan('ada');
  const host = await render(actions);
  expect(cards(host)).toContain('Inherit global');
  const controller = new OnboardingController(actions);
  controller.chooseModel('dm-ada', 'ada');
  await act(async () => controller.saveModel(route, false, 0));
  expect(cards(host)).toContain('flash');
  expect(cards(host)).not.toContain('Inherit global');
  expect(modelPlanOf('ada')?.orchestrator).toEqual(route);
  controller.chooseModel('dm-ada', 'ada');
  await act(async () => controller.saveModel(route, true, 1));
  expect(cards(host)).toContain('Inherit global');
  expect(modelPlanOf('ada')).toBeNull();
});
