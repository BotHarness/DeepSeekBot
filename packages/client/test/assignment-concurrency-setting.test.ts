// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentConcurrencySetting } from '../src/client/assignment-concurrency-setting.js';
import { zhTranslate } from '../src/client/locale.js';

async function mount(save: (limit: number) => Promise<boolean>, writable = true, limit = 3) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(AssignmentConcurrencySetting, { t: zhTranslate, limit, writable, save }),
    ),
  );
  const input = host.querySelector<HTMLInputElement>('input[role="spinbutton"]')!;
  const step = (label: '增加' | '减少') =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  return {
    host,
    input,
    step,
    type: async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
    },
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe('Assignment concurrency setting', () => {
  it('names the stepper after the row and saves each step right away', async () => {
    const save = vi.fn(async () => true);
    const ui = await mount(save);
    try {
      const row = ui.host.querySelector('[role="group"][aria-labelledby]')!;
      expect(row.textContent).toContain('Assignment 并发上限');
      expect(ui.input.getAttribute('aria-label')).toBe('Assignment 并发上限');
      await act(async () => ui.step('增加').click());
      expect(save).toHaveBeenCalledWith(4);
      expect(ui.host.querySelector('[role="status"]')?.textContent).toContain('已保存');
    } finally {
      await ui.close();
    }
  });

  it('clamps typed values to the allowed range and ignores text that is not a number', async () => {
    const save = vi.fn(async () => true);
    const ui = await mount(save);
    try {
      await ui.type('abc');
      expect(save).not.toHaveBeenCalled();
      expect(ui.input.value).toBe('3');
      await ui.type('99');
      expect(save).toHaveBeenCalledWith(32);
    } finally {
      await ui.close();
    }
  });

  it('locks the stepper while a save is in flight and reports a failed save', async () => {
    let settle: ((accepted: boolean) => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settle = resolve;
        }),
    );
    const ui = await mount(save);
    try {
      await act(async () => ui.step('增加').click());
      expect(ui.input.value).toBe('4');
      expect(ui.input.disabled).toBe(true);
      expect(ui.step('增加').disabled).toBe(true);
      await act(async () => settle!(false));
      expect(save).toHaveBeenCalledTimes(1);
      expect(ui.input.value).toBe('3');
      expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('原上限仍然有效');
    } finally {
      await ui.close();
    }
  });

  it('does not save without a writable Host and handles connection errors', async () => {
    const unavailable = vi.fn(async () => true);
    const ui = await mount(unavailable, false);
    try {
      expect(ui.input.disabled).toBe(true);
      expect(ui.step('增加').disabled).toBe(true);
      expect(unavailable).not.toHaveBeenCalled();
    } finally {
      await ui.close();
    }
    const failed = await mount(async () => {
      throw new Error('Connection lost');
    });
    try {
      await act(async () => failed.step('减少').click());
      expect(failed.host.querySelector('[role="alert"]')?.textContent).toContain('保存失败');
    } finally {
      await failed.close();
    }
  });
});
