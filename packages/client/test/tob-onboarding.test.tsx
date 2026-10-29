// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, variant: _variant, ...props }: { children: ReactNode; variant?: string }) =>
    createElement('button', props, children),
  Tooltip: ({ children }: { children: ReactNode }) => children,
  SegmentedControl: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) =>
    createElement(
      'div',
      { role: 'radiogroup', 'aria-label': label },
      options.map((option) =>
        createElement(
          'button',
          {
            key: option.value,
            role: 'radio',
            'aria-checked': option.value === value,
            onClick: () => onChange(option.value),
          },
          option.label,
        ),
      ),
    ),
}));
import type { OnboardingSnapshot } from '../../core/src/onboarding/types.js';
import type { BridgeActions } from '../src/client/actions.js';
import { CHANNEL_BODY_PANEL } from '../src/client/channel-dock-layout.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { desktopLayoutTourSteps } from '../src/client/onboarding-view.js';
import { PinnedPanelCards } from '../src/client/pinned-panel-cards.js';
import { TobOnboarding } from '../src/client/tob-onboarding.js';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

const receipt: OnboardingSnapshot = {
  profileId: 'qa',
  completed: false,
  preparation: 'ready',
  tutorial: 'active',
  channelId: 'dm-ada',
  journey: { version: 2, done: false, botSlug: 'ada', groupChannelId: 'group' },
};

async function journey() {
  const actions = {
    onboarding: vi.fn(async () => receipt),
    load: vi.fn(async () => {}),
    openChannel: vi.fn(async () => {}),
  } as unknown as BridgeActions;
  const controller = onboardingFor(actions);
  await controller.enter();
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <TobOnboarding
        actions={actions}
        t={t}
        ready
        hasDraft={false}
        suggest={() => {}}
        openChannel={() => {}}
      />,
    ),
  );
  return { controller, host, root };
}

it('asks for a Layout mode in step 4, applies it through the layout owner, and matches tips to it', async () => {
  const { controller, host, root } = await journey();
  const setMode = vi.fn();
  let detach = () => {};
  act(() => {
    detach = controller.attachLayout('simple', { setMode });
  });
  const radio = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (node) => node.textContent === label,
    )!;
  expect(host.querySelector('[data-onboarding-layout-mode]')).not.toBeNull();
  expect(radio(t('workspace.layoutMode.simple')).getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).toContain(t('onboarding.short.layoutSimpleHint'));
  act(() => radio(t('workspace.layoutMode.advanced')).click());
  expect(setMode).toHaveBeenCalledWith('advanced');
  act(() => {
    detach();
    detach = controller.attachLayout('advanced', { setMode });
  });
  expect(radio(t('workspace.layoutMode.advanced')).getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).toContain(t('onboarding.short.layoutAdvancedHint'));
  expect(desktopLayoutTourSteps(t, 'advanced').map((step) => step.title)).toEqual([
    t('onboarding.short.move'),
    t('onboarding.short.resize'),
    t('onboarding.short.hide'),
    t('onboarding.short.restore'),
  ]);
  expect(desktopLayoutTourSteps(t, 'simple').map((step) => step.title)).toEqual([
    t('onboarding.short.views'),
    t('onboarding.short.messages'),
    t('onboarding.short.column'),
    t('onboarding.short.switchMode'),
  ]);
  act(() => controller.finishTour());
  expect(host.querySelector('[data-onboarding-layout-mode]')).toBeNull();
  expect(host.textContent).toContain(t('onboarding.short.chatHint'));
  act(() => {
    detach();
    detach = controller.attachLayout('simple', { setMode });
  });
  expect(host.textContent).toContain(t('onboarding.short.chatHint'));
  act(() => detach());
  expect(controller.getSnapshot().layoutMode).toBeUndefined();
  act(() => root.unmount());
});

it('reports only a real rail selection, not a programmatic open', async () => {
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    icon: 'messages-circle',
    scope: 'global',
    component: () => null,
  });
  const open = vi.fn();
  registry.attach({ open, close: vi.fn() });
  const onActivate = vi.fn();
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  await act(async () =>
    root.render(<PinnedPanelCards registry={registry} collapsed onActivate={onActivate} t={t} />),
  );
  act(() => registry.open(CHANNEL_BODY_PANEL));
  expect(open).toHaveBeenCalledOnce();
  expect(onActivate).not.toHaveBeenCalled();
  act(() =>
    host.querySelector<HTMLButtonElement>(`[data-pinned-panel="${CHANNEL_BODY_PANEL}"]`)!.click(),
  );
  expect(open).toHaveBeenCalledTimes(2);
  expect(onActivate).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
  act(() => root.unmount());
});

it('insets the journey card to the composer edges instead of touching the panel edges', async () => {
  const { host, root } = await journey();
  const card = host.querySelector<HTMLElement>('[data-tob-onboarding]')!;
  expect(card.classList.contains('bh-composer-inset')).toBe(true);
  const { CSS } = await import('../src/client/styles.js');
  const { space } = await import('../src/client/ds/tokens.stylex.js');
  expect(CSS).toContain(`margin: 0 ${space.x4} calc(${space.x4} + env(safe-area-inset-bottom`);
  expect(CSS).toContain(`.bh-composer-inset { margin-inline: ${space.x4}; }`);
  expect(CSS).toContain(
    `.bh-composer-shell,\n  .bh-composer-inset {\n    margin-right: ${space.x3};`,
  );
  act(() => root.unmount());
});

it('suggests the Bot and group that match the persona picked in the intro', async () => {
  localStorage.setItem('botharness/onboarding/persona-v1/qa', 'engineer');
  const fresh = { ...receipt, journey: { version: 2, done: false } } as OnboardingSnapshot;
  const actions = {
    onboarding: vi.fn(async () => fresh),
    load: vi.fn(async () => {}),
    openChannel: vi.fn(async () => {}),
  } as unknown as BridgeActions;
  await onboardingFor(actions).enter();
  const suggested: string[] = [];
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <TobOnboarding
        actions={actions}
        t={t}
        ready
        hasDraft={false}
        suggest={(body) => suggested.push(body)}
        openChannel={() => {}}
      />,
    ),
  );
  act(() =>
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === t('onboarding.short.suggest'))!
      .click(),
  );
  expect(suggested).toEqual([t('onboarding.short.botPrompt.engineer')]);
  act(() => root.unmount());
});
