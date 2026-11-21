// @vitest-environment jsdom
import {
  button,
  cards,
  catalog,
  choose,
  translate,
  trigger,
} from './model-preset-profile-fixtures.js';
import { type Root } from 'react-dom/client';
import type { ModelPlanView } from '../src/client/bridge.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { en } from '../src/client/locale.js';
import { invalidateModelPlan, modelPlanOf } from '../src/client/model-plan-store.js';
import { OnboardingController } from '../src/client/onboarding.js';
import { ModelPresetProfile } from '../src/client/model-preset-profile.js';
import { OnboardingModelDialog, OnboardingWelcome } from '../src/client/onboarding-view.js';
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

it.each([400, 1280])('saves the selected model and effort at %i px', async (width) => {
  vi.stubGlobal('innerWidth', width);
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
  expect(document.querySelector('[data-onboarding-request]')?.textContent).toContain(
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

it('offers Routing Groups in the onboarding picker and saves one with its shared effort (#4500, #4497)', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onConfirm = vi.fn(async () => {});
  const actions = {
    modelCatalog: vi.fn(async () => ({
      models: catalog,
      default: { provider: 'deepseek', model: 'flash' },
      defaultGroupId: 'main',
      defaultGroupEffort: 'high',
      groups: [
        {
          id: 'main',
          name: 'Main',
          revision: 1,
          routes: [
            { provider: 'kimi', model: 'k2' },
            { provider: 'deepseek', model: 'flash' },
          ],
        },
      ],
    })),
  } as unknown as BridgeActions;
  await act(async () =>
    root!.render(
      createElement(OnboardingModelDialog, {
        actions,
        title: 'Default model',
        globalOnly: true,
        onClose: vi.fn(),
        onConfirm,
        t: translate,
      }),
    ),
  );
  expect(trigger('Model')?.textContent).toContain('Main');
  const tabs = () => document.querySelector('[aria-label="Model · Reasoning effort"]')!;
  expect(tabs().querySelector('[aria-selected="true"]')?.textContent).toBe('High');
  await choose('Model', 'Flash', 'Flash');
  await choose('Model', 'Main', 'Main');
  await act(async () =>
    [...tabs().querySelectorAll('button')].find((item) => item.textContent === 'Low')!.click(),
  );
  await act(async () => button('Save global default model').click());
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ groupId: 'main', effort: 'low' }, true, 0);
});

it('keeps a chosen model over the default Routing Group on refresh, and blocks Save for a missing group', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onConfirm = vi.fn(async () => {});
  const main = {
    id: 'main',
    name: 'Main',
    revision: 1,
    routes: [
      { provider: 'kimi', model: 'k2' },
      { provider: 'deepseek', model: 'flash' },
    ],
  };
  let groups = [main];
  const actions = {
    modelCatalog: vi.fn(async () => ({
      models: catalog,
      default: { provider: 'deepseek', model: 'flash' },
      defaultGroupId: 'main',
      groups,
    })),
  } as unknown as BridgeActions;
  const render = async () =>
    act(async () =>
      root!.render(
        createElement(OnboardingModelDialog, {
          actions,
          title: 'Default model',
          globalOnly: true,
          onClose: vi.fn(),
          onConfirm,
          t: translate,
        }),
      ),
    );
  await render();
  await choose('Model', 'Flash', 'Flash');
  await act(async () => button(en['onboarding.refreshModels']).click());
  expect(trigger('Model')?.textContent).toContain('Flash');
  await act(async () => button('Save global default model').click());
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ provider: 'deepseek', model: 'flash' }),
    true,
    0,
  );
  await act(async () => root!.unmount());
  root = createRoot(container);
  groups = [];
  await render();
  expect(button('Save global default model').disabled).toBe(true);
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
    const option = [
      ...document.querySelectorAll<HTMLButtonElement>('button, [role="menuitem"]'),
    ].find((candidate) => candidate.querySelector('.bh-card-title')?.textContent === title);
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
  invalidateModelPlan('ada', actions);
  const host = await render(actions);
  expect(cards(host)).toContain('Inherit global');
  const controller = new OnboardingController(actions);
  controller.chooseModel('dm-ada', 'ada');
  await act(async () => controller.saveModel(route, false, 0));
  expect(cards(host)).toContain('flash');
  expect(cards(host)).not.toContain('Inherit global');
  expect(modelPlanOf('ada', actions)?.orchestrator).toEqual(route);
  controller.chooseModel('dm-ada', 'ada');
  await act(async () => controller.saveModel(route, true, 1));
  expect(cards(host)).toContain('Inherit global');
  expect(modelPlanOf('ada', actions)).toBeNull();
});
