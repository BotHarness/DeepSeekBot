// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  Button: ({
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
    createElement('button', props),
  Checkbox: () => null,
}));
vi.mock('../src/client/model-picker.js', () => ({ ModelPicker: () => null }));
vi.mock('../src/client/onboarding-memory.js', () => ({ OnboardingMemory: () => null }));
vi.mock('../src/client/onboarding-binding.js', () => ({ OnboardingAppBinding: () => null }));
vi.mock('../src/client/modal.js', () => ({ Modal: () => null }));
vi.mock('../src/client/bot-settings-open.js', () => ({ openModelsSettings: vi.fn() }));
vi.mock('../src/client/internal-tour.js', () => ({ startInternalTour: vi.fn(() => () => {}) }));

import type { OnboardingSnapshot, TutorialAction } from '../../core/src/onboarding/types.js';
import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { OnboardingSetting } from '../src/client/onboarding-view.js';
import { store } from '../src/client/store.js';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store.setConversation({ sending: false });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function harness(receipt?: Pick<OnboardingSnapshot, 'tutorial' | 'completed'>) {
  const actions = {
    onboarding: vi.fn(async (_slug?: string, action?: TutorialAction) => ({
      profileId: 'settings',
      completed: receipt?.completed ?? false,
      preparation: 'ready',
      tutorial:
        action === 'start' || action === 'restart' ? 'active' : (receipt?.tutorial ?? 'paused'),
      channelId: 'dm-ada',
    })),
    load: vi.fn(async () => {}),
    openChannel: vi.fn(async () => {}),
  };
  const closeBotSettings = vi.fn();
  return { actions, closeBotSettings, bridge: actions as unknown as BridgeActions };
}
async function render(
  bridge: BridgeActions,
  closeBotSettings: () => void,
  enter = true,
): Promise<void> {
  await act(async () => {
    if (enter) await onboardingFor(bridge).enter();
    root.render(
      createElement(OnboardingSetting, { actions: bridge, closeBotSettings, t: zhTranslate }),
    );
  });
}
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (found === undefined) throw new Error(`Missing button: ${label}`);
  return found;
}
it('offers Start before the receipt is known without touching the Host on mount', async () => {
  const { actions, closeBotSettings, bridge } = harness();
  await render(bridge, closeBotSettings, false);
  expect(button(zhTranslate('onboarding.start'))).toBeDefined();
  expect(actions.onboarding).not.toHaveBeenCalled();
  await act(async () => button(zhTranslate('onboarding.start')).click());
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'start');
  expect(actions.load).toHaveBeenCalled();
  expect(actions.openChannel).toHaveBeenCalledWith('dm-ada');
  expect(closeBotSettings).toHaveBeenCalledOnce();
});
it.each(['paused', 'active'] as const)(
  'offers Continue for a %s tutorial and closes into the DM',
  async (tutorial) => {
    const { actions, closeBotSettings, bridge } = harness({ tutorial, completed: false });
    await render(bridge, closeBotSettings);
    await act(async () => button(zhTranslate('onboarding.continue')).click());
    expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'continue');
    expect(closeBotSettings).toHaveBeenCalledOnce();
  },
);
it.each([
  { tutorial: 'skipped' as const, completed: false },
  { tutorial: 'active' as const, completed: true },
])('offers Restart for skipped or completed onboarding', async ({ tutorial, completed }) => {
  const { actions, closeBotSettings, bridge } = harness({ tutorial, completed });
  await render(bridge, closeBotSettings);
  await act(async () => button(zhTranslate('onboarding.restart')).click());
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'restart');
  expect(closeBotSettings).toHaveBeenCalledOnce();
});
it('offers Start while the shared receipt is still not started', async () => {
  const { actions, closeBotSettings, bridge } = harness({
    tutorial: 'not-started',
    completed: false,
  });
  await render(bridge, closeBotSettings);
  await act(async () => button(zhTranslate('onboarding.start')).click());
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'start');
});
