// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

import {
  DSH_BOT_SETTINGS_FALLBACK_MS,
  DshBotSettingsItem,
} from '../src/client/dsh-bot-settings-item.js';
import { zhTranslate } from '../src/client/locale.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.useRealTimers();
  document.body.replaceChildren();
});

function render(close: () => void, openBotSettings: () => void): void {
  act(() => {
    root.render(
      createElement(DshBotSettingsItem, { close, openBotSettings, t: zhTranslate } as never),
    );
  });
}

it('closes DSH settings and opens Bot Settings as soon as it mounts, showing nothing', () => {
  const calls: string[] = [];
  render(
    () => calls.push('close'),
    () => calls.push('open'),
  );
  expect(calls).toEqual(['close', 'open']);
  expect(host.textContent).toBe('');
});

it('offers a button when DSH settings is still showing the item after the redirect', () => {
  const close = vi.fn();
  const open = vi.fn();
  render(close, open);
  act(() => {
    vi.advanceTimersByTime(DSH_BOT_SETTINGS_FALLBACK_MS);
  });
  const button = host.querySelector('button');
  expect(button?.textContent).toBe('打开 Bot 设置');
  expect(host.textContent).toContain('Bot 设置已移到独立窗口');

  act(() => {
    button?.click();
  });
  expect(close).toHaveBeenCalledTimes(2);
  expect(open).toHaveBeenCalledTimes(2);
});

it('does not redirect again on re-render', () => {
  const open = vi.fn();
  const close = vi.fn();
  render(close, open);
  render(close, open);
  expect(open).toHaveBeenCalledTimes(1);
});
