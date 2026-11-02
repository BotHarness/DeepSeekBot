// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
}));
vi.mock('../src/ui/chat/sheet', () => ({
  Sheet: ({
    visible,
    label,
    children,
  }: {
    visible: boolean;
    label: string;
    children: ReactNode;
  }) => (visible ? createElement('div', { role: 'dialog', 'aria-label': label }, children) : null),
  SheetActions: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));

import { BotNameSetting } from '../src/ui/chat/bot-name-setting';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const type = (field: HTMLTextAreaElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
};

it('blocks duplicate submissions while saving', async () => {
  const request = Promise.withResolvers<void>();
  const save = vi.fn(() => request.promise);
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  try {
    await act(async () => root.render(<BotNameSetting name="Nova" onSave={save} />));
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="bot-name-change"]')!.click(),
    );
    await act(async () =>
      type(view.querySelector<HTMLTextAreaElement>('textarea')!, 'Nova Studio'),
    );
    const submit = view.querySelector<HTMLButtonElement>('[data-testid="bot-name-save"]')!;
    await act(async () => {
      submit.click();
      submit.click();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(submit.disabled).toBe(true);
    await act(async () => request.resolve());
    expect(view.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    view.remove();
  }
});

it('renames a Bot through its explicit Name setting, trimming input and closing after success', async () => {
  const save = vi.fn(async () => undefined);
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  try {
    await act(async () => root.render(<BotNameSetting name="Nova" onSave={save} />));
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="bot-name-change"]')!.click(),
    );
    const field = view.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(field.value).toBe('Nova');
    expect(button(view, t.botNameSave).disabled).toBe(true);
    await act(async () => type(field, '   '));
    expect(button(view, t.botNameSave).disabled).toBe(true);
    await act(async () => type(field, '  Nova Studio  '));
    await act(async () => button(view, t.botNameSave).click());
    expect(save).toHaveBeenCalledWith('Nova Studio');
    expect(view.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    view.remove();
  }
});

it('keeps a failed draft for retry and Cancel discards it without another save', async () => {
  const save = vi.fn(async () => {
    throw Error('Host unavailable');
  });
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  try {
    await act(async () => root.render(<BotNameSetting name="Nova" onSave={save} />));
    const open = () =>
      view.querySelector<HTMLButtonElement>('[data-testid="bot-name-change"]')!.click();
    await act(async () => open());
    await act(async () =>
      type(view.querySelector<HTMLTextAreaElement>('textarea')!, 'Edited Nova'),
    );
    await act(async () => button(view, t.botNameSave).click());
    expect(view.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Edited Nova');
    expect(view.querySelector('[role="alert"]')?.textContent).toContain('Host unavailable');
    expect(button(view, t.botNameSave).disabled).toBe(false);
    await act(async () => button(view, t.cancel).click());
    await act(async () => open());
    expect(view.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Nova');
    expect(save).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    view.remove();
  }
});
