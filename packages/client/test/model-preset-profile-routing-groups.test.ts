// @vitest-environment jsdom
import {
  addTask,
  button,
  catalog,
  choose,
  labelled,
  openEditor,
  picked,
  taskTiles,
  translate,
} from './model-preset-profile-fixtures.js';
import { type Root } from 'react-dom/client';
import type { ModelPlanView } from '../src/client/bridge.js';
import { dialog } from './primitive-mocks.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
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
  const mainOnly = { provider: 'deepseek', model: 'pro' };
  const proChoice = {
    kind: 'model' as const,
    ...mainOnly,
    allowedEfforts: [''],
    defaultEffort: '',
  };

  it('puts Routing Groups in every slot and saves them in a Bot plan (#4501)', async () => {
    const plan: ModelPlanView = {
      revision: 3,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: mainOnly,
      assignmentDefault: mainOnly,
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
    const setModelPlanSub = vi.fn(async () => plan);
    const host = await render({
      modelPlanState: vi.fn(async () => ({ plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog, groups })),
      setModelPlanSub,
    } as unknown as BridgeActions);
    await openEditor(host);
    await choose(translate('modelPreset.orchestrator'), 'Main', 'Main');
    await addTask('Side', 'Side');
    const side = () => taskTiles().find((tile) => tile.startsWith('Side'))!;
    expect(side()).toContain('Next available: Flash · DeepSeek');
    await act(async () => labelled('Edit Side').click());
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Side · Reasoning effort"] button:last-child',
        )!
        .click(),
    );
    const input = document.querySelector<HTMLInputElement>('input[aria-label="When to use Side"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Quick checks',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      [...document.querySelectorAll<HTMLElement>('section[aria-label="Task model"] li')]
        .find((tile) => tile.textContent?.startsWith('Side'))!
        .querySelector<HTMLButtonElement>('button:not([aria-label])')!
        .click(),
    );
    await act(async () => button('Save').click());
    expect(setModelPlanSub).toHaveBeenCalledExactlyOnceWith(
      'ada',
      3,
      { orchestratorGroupId: 'main', orchestratorGroupEffort: null },
      {
        choices: [
          proChoice,
          {
            kind: 'group',
            group: 'side',
            allowedEfforts: ['low', 'high'],
            defaultEffort: 'high',
            note: 'Quick checks',
          },
        ],
        default: { kind: 'group', group: 'side' },
      },
    );
  });

  it('offers a group the efforts of its reasoning members', async () => {
    const plan: ModelPlanView = {
      revision: 3,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: mainOnly,
      assignmentDefault: mainOnly,
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
    await addTask('Main', 'Main');
    await act(async () => labelled('Edit Main').click());
    expect(document.querySelector('[aria-label="Main · Reasoning effort"]')?.textContent).toContain(
      'High',
    );
  });

  it('opens a grouped plan as its list and keeps it on a main-only save (#4501)', async () => {
    const plan: ModelPlanView = {
      revision: 5,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: { provider: 'deepseek', model: 'flash' },
      orchestratorGroupId: 'main',
      assignmentDefault: mainOnly,
      assignmentModels: [{ ...mainOnly, allowedEfforts: [''], defaultEffort: '' }],
      assignmentGroups: ['side', 'main'],
      assignmentDefaultGroupId: 'side',
      assignmentGroupOptions: [{ group: 'main', note: 'Long work' }],
      appliedAt: '',
    };
    const groups = [
      { id: 'main', name: 'Main', revision: 1, routes: [{ provider: 'kimi', model: 'k2' }] },
      { id: 'side', name: 'Side', revision: 1, routes: [{ provider: 'deepseek', model: 'flash' }] },
    ];
    const setModelPlanSub = vi.fn();
    const customizeModelPlan = vi.fn(async () => ({ ...plan, revision: 6 }));
    const host = await render({
      modelPlanState: vi.fn(async () => ({ revision: 5, plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog, groups })),
      setModelPlanSub,
      customizeModelPlan,
    } as unknown as BridgeActions);
    await openEditor(host);
    expect(picked(translate('modelPreset.orchestrator'))).toContain('Main');
    expect(taskTiles()).toEqual([
      expect.stringContaining('Pro'),
      expect.stringMatching(/^Side.*Default/),
      expect.stringContaining('Main'),
    ]);
    await choose(translate('modelPreset.orchestrator'), 'Flash', 'Flash');
    await act(async () => button(translate('modelPreset.save')).click());
    expect(customizeModelPlan).toHaveBeenCalledExactlyOnceWith(
      'ada',
      { provider: 'deepseek', model: 'flash' },
      5,
    );
    expect(setModelPlanSub).not.toHaveBeenCalled();
  });

  it('clears a group effort limit its members no longer share (#4501)', async () => {
    const plan: ModelPlanView = {
      revision: 5,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: mainOnly,
      assignmentDefault: mainOnly,
      assignmentModels: [{ ...mainOnly, allowedEfforts: [''], defaultEffort: '' }],
      assignmentGroups: ['main'],
      assignmentGroupOptions: [{ group: 'main', allowedEfforts: ['high'], defaultEffort: 'high' }],
      appliedAt: '',
    };
    const groups = [
      { id: 'main', name: 'Main', revision: 1, routes: [{ provider: 'kimi', model: 'k2' }] },
    ];
    const setModelPlanSub = vi.fn(async () => ({ ...plan, revision: 6 }));
    const host = await render({
      modelPlanState: vi.fn(async () => ({ revision: 5, plan })),
      modelPresets: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: catalog, groups })),
      setModelPlanSub,
    } as unknown as BridgeActions);
    await openEditor(host);
    expect(dialog().textContent).toContain(translate('modelPreset.groupEffortsStale'));
    await act(async () => button(translate('modelPreset.groupEffortsClear')).click());
    expect(dialog().textContent).not.toContain(translate('modelPreset.groupEffortsStale'));
    await act(async () => button(translate('modelPreset.save')).click());
    expect(setModelPlanSub).toHaveBeenCalledExactlyOnceWith('ada', 5, expect.anything(), {
      choices: [proChoice, { kind: 'group', group: 'main' }],
      default: { kind: 'model', provider: 'deepseek', model: 'pro' },
    });
  });

  it('flags a group effort its members dropped (#4501)', async () => {
    const plan: ModelPlanView = {
      revision: 5,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: mainOnly,
      assignmentDefault: mainOnly,
      assignmentModels: [{ ...mainOnly, allowedEfforts: [''], defaultEffort: '' }],
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
    expect(taskTiles()[1]).toContain('High');
  });
});
