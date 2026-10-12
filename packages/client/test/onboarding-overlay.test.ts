// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const tour = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => () => {}),
);
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
    createElement('button', props),
  Checkbox: () => null,
  Tag: ({ children, ...props }: Record<string, unknown> & { children?: unknown }) =>
    createElement('span', props, children as never),
}));
vi.mock('../src/client/model-picker.js', () => ({ ModelPicker: () => null }));
vi.mock('../src/client/onboarding-memory.js', () => ({ OnboardingMemory: () => null }));
vi.mock('../src/client/onboarding-binding.js', () => ({ OnboardingAppBinding: () => null }));
vi.mock('../src/client/modal.js', () => ({ Modal: () => null }));
vi.mock('../src/client/bot-settings-open.js', () => ({ openModelsSettings: vi.fn() }));
vi.mock('../src/client/internal-tour.js', () => ({ startInternalTour: tour }));

import type { OnboardingSnapshot, TutorialAction } from '../../core/src/onboarding/types.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { ModelCatalogEntryView } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { OnboardingOverlay } from '../src/client/onboarding-view.js';
import { store } from '../src/client/store.js';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  tour.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store.setMode('bot');
  store.setConversation({ sending: false });
  const nav = document.createElement('nav');
  const row = document.createElement('span');
  row.dataset['bhOnboardingLauncher'] = 'row';
  row.getBoundingClientRect = () => ({ width: 18, right: 240, top: 80 }) as DOMRect;
  nav.append(row);
  document.body.append(nav);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.querySelector('nav')?.remove();
});
function harness(tutorial: OnboardingSnapshot['tutorial'], completed = false) {
  const shared: OnboardingSnapshot = {
    profileId: 'overlay',
    completed,
    preparation: 'ready',
    tutorial,
    channelId: 'dm-ada',
    defaultBotSlug: 'ada',
  };
  const actions = {
    onboarding: vi.fn(async (_slug?: string, action?: TutorialAction) => {
      if (action === 'start') shared.tutorial = 'active';
      if (action === 'pause') shared.tutorial = 'paused';
      if (action === 'skip') shared.tutorial = 'skipped';
      if (action === 'continue' || action === 'restart') shared.tutorial = 'active';
      return { ...shared };
    }),
    load: vi.fn(async () => {}),
    openChannel: vi.fn(async () => {}),
    modelCatalog: vi.fn(
      async (): Promise<{
        default: { provider: string; model: string };
        models: ModelCatalogEntryView[];
      }> => ({
        default: { provider: 'deepseek', model: 'chat' },
        models: [
          {
            provider: 'deepseek',
            model: 'chat',
            providerName: 'DeepSeek',
            modelName: 'Chat',
            efforts: [],
          },
        ],
      }),
    ),
    modelPlanState: vi.fn(async () => ({ revision: 0 })),
    onboardingModel: vi.fn(async () => {}),
    send: vi.fn(async () => true),
    memoryHistory: vi.fn(async () => [] as { causeKind: string; sha: string }[]),
    memoryWorkingChanges: vi.fn(async () => [] as { path: string }[]),
    memoryGitCommitDiff: vi.fn(async (_channelId: string, sha: string) => ({
      sha,
      files:
        sha === 'profile'
          ? [{ path: '.botharness/bot.json', status: 'M' }]
          : [{ path: 'MEMORY.md', status: 'M' }],
      diff: '',
    })),
    messagingSnapshot: vi.fn(async () => ({ accounts: [], grants: [], intents: [] })),
    botSchedules: vi.fn(async () => [] as unknown[]),
  };
  const bridge = actions as unknown as BridgeActions;
  const render = async () => {
    await act(async () => {
      root.render(createElement(OnboardingOverlay, { actions: bridge, t: zhTranslate }));
      await Promise.resolve();
    });
  };
  return { actions, bridge, render, controller: onboardingFor(bridge) };
}
function checklist(): HTMLElement | null {
  return document.querySelector('.bh-onboarding-checklist');
}
function itemState(item: string): string | undefined {
  return (
    checklist()?.querySelector<HTMLElement>(`[data-item="${item}"]`)?.dataset['state'] ?? undefined
  );
}
async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });
}
it('opens the getting-started checklist on the first Bot-mode entry instead of a full-screen tour', async () => {
  const { actions, render, controller } = harness('not-started');
  await render();
  await flush();
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'start');
  expect(actions.openChannel).toHaveBeenCalledWith('dm-ada');
  expect(controller.getSnapshot()).toMatchObject({
    checklistOpen: true,
    guideOpen: false,
    receipt: { tutorial: 'active' },
  });
  expect(tour).not.toHaveBeenCalled();
  expect(checklist()?.getAttribute('aria-label')).toBe(zhTranslate('onboarding.checklist.title'));
  expect(
    [...checklist()!.querySelectorAll<HTMLElement>('[data-item]')].map(
      (node) => node.dataset['item'],
    ),
  ).toEqual(['model', 'conversation', 'memory', 'im', 'schedule', 'companion']);
  expect(itemState('model')).toBe('done');
  expect(itemState('conversation')).toBe('todo');
  expect(itemState('memory')).toBe('locked');
  expect(itemState('im')).toBe('locked');
  expect(itemState('schedule')).toBe('locked');
  expect(itemState('companion')).toBe('todo');
});
it.each(['paused', 'skipped'] as const)(
  'stays quiet when the shared tutorial is %s',
  async (tutorial) => {
    const { actions, render, controller } = harness(tutorial);
    await render();
    await flush();
    expect(actions.onboarding).not.toHaveBeenCalledWith(undefined, 'start');
    expect(controller.getSnapshot().checklistOpen).toBe(false);
    expect(checklist()).toBeNull();
  },
);
it('reads each experience from its own authority after the first reply', async () => {
  const { actions, render, controller } = harness('paused', true);
  actions.memoryHistory.mockResolvedValue([
    { causeKind: 'source-event', sha: 'profile' },
    { causeKind: 'source-event', sha: 'note' },
    { causeKind: 'repository-init', sha: 'init' },
  ]);
  actions.botSchedules.mockResolvedValue([{ id: 'daily' }]);
  await render();
  await flush();
  await act(async () => controller.openChecklist());
  await flush();
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'continue');
  expect(actions.memoryHistory).toHaveBeenCalledWith('dm-ada');
  expect(actions.messagingSnapshot).toHaveBeenCalledWith('ada');
  expect(actions.botSchedules).toHaveBeenCalledWith('ada');
  expect(itemState('conversation')).toBe('done');
  expect(itemState('memory')).toBe('done');
  expect(itemState('im')).toBe('todo');
  expect(itemState('schedule')).toBe('done');
});
it('starts the interface walkthrough from the checklist and ends it on the Bot-mode entry', async () => {
  const { render, controller } = harness('not-started');
  await render();
  await flush();
  await act(async () => controller.startTour());
  await flush();
  expect(controller.getSnapshot()).toMatchObject({ guideOpen: true, checklistOpen: false });
  expect(tour).toHaveBeenCalledOnce();
  const specs = tour.mock.calls[0]![0] as { selector: string }[];
  expect(specs.map((spec) => spec.selector)).toEqual([
    '[data-onboarding-welcome]',
    '[data-bh-tour="roster"]',
    '[data-bh-tour="inbox"]',
    '[data-bh-tour="bot-settings"]',
    '[data-bh-tour="topbar"]',
    '[data-bh-tour="composer"]',
    '[data-bh-tour="channel-sidebar"]',
    '[data-bh-tour="companion"]',
    '[data-bh-tour="bot-mode"]',
  ]);
  const options = tour.mock.calls[0]![1] as { onFinished(): void };
  await act(async () => {
    options.onFinished();
  });
  expect(controller.getSnapshot()).toMatchObject({ guideOpen: false, checklistOpen: true });
});
it('pauses the shared receipt when the checklist is closed and skips from its footer', async () => {
  const { actions, render, controller } = harness('not-started');
  await render();
  await flush();
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  await flush();
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'pause');
  expect(controller.getSnapshot().checklistOpen).toBe(false);
  await act(async () => controller.openChecklist());
  await flush();
  const skip = [...checklist()!.querySelectorAll('button')].find(
    (button) => button.textContent === zhTranslate('onboarding.checklist.skip'),
  );
  await act(async () => skip!.click());
  await flush();
  expect(actions.onboarding).toHaveBeenLastCalledWith(undefined, 'skip');
  expect(checklist()).toBeNull();
});
it('does not count a profile-only Memory commit as the Bot remembering something', async () => {
  const { actions, render, controller } = harness('paused', true);
  actions.memoryHistory.mockResolvedValue([
    { causeKind: 'source-event', sha: 'profile' },
    { causeKind: 'repository-init', sha: 'init' },
  ]);
  await render();
  await flush();
  await act(async () => controller.openChecklist());
  await flush();
  expect(actions.memoryGitCommitDiff).toHaveBeenCalledWith('dm-ada', 'profile');
  expect(actions.memoryGitCommitDiff).not.toHaveBeenCalledWith('dm-ada', 'init');
  expect(itemState('memory')).toBe('todo');
  actions.memoryWorkingChanges.mockResolvedValue([{ path: 'notes/preferences.md' }]);
  await act(async () => controller.refreshEvidence());
  await flush();
  expect(itemState('memory')).toBe('done');
});
it('shows one task per page in the mobile sheet and starts on the next open task', async () => {
  document.querySelector('nav')?.remove();
  const { render } = harness('not-started');
  await render();
  await flush();
  expect(checklist()?.dataset['placement']).toBe('sheet');
  expect(
    [...checklist()!.querySelectorAll<HTMLElement>('[data-item]')].map(
      (node) => node.dataset['item'],
    ),
  ).toEqual(['conversation']);
  const next = checklist()!.querySelector<HTMLButtonElement>(
    `[aria-label="${zhTranslate('onboarding.checklist.next')}"]`,
  )!;
  await act(async () => next.click());
  expect(itemState('memory')).toBe('locked');
  expect(checklist()!.querySelectorAll('[data-item]')).toHaveLength(1);
});
