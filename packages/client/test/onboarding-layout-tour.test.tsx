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
import { CHANNEL_BODY_PANEL } from '../src/client/channel-dock-layout.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { desktopLayoutTourSteps } from '../src/client/onboarding-view.js';
import { PinnedPanelCards } from '../src/client/pinned-panel-cards.js';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

it('teaches the layout of the chosen mode', () => {
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
