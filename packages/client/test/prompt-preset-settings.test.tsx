// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PromptPresetSettings } from '../src/client/prompt-preset-settings.js';
import { zhTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = ({ children }: { children?: ReactNode }) =>
    createElement('span', null, children ?? null);
  return new Proxy(
    {},
    { has: (_, key) => key !== 'then', get: (_, key) => (key === 'then' ? undefined : stub) },
  );
});

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let globalPresetId: string | null = 'concise';

const preset = (id: string, name: string, parts: Record<string, unknown>) => ({
  id,
  name,
  revision: 1,
  parts,
  limits: {},
  updatedAt: '',
});
const actions = {
  promptParts: vi.fn(async () => ({ parts: [], limits: [] })),
  promptPresets: vi.fn(async () => ({
    presets: [
      preset('concise', '简洁回复', { reply: { text: 'Be brief.', base: 'h1' } }),
      preset('report', '长篇报告', {}),
    ],
    globalPresetId,
  })),
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  globalPresetId = 'concise';
});

const row = (id: string) => host.querySelector(`[data-prompt-preset="${id}"]`)!;

it('shows untouched presets as having no edits and rereads the global preset on return', async () => {
  await act(async () =>
    root.render(<PromptPresetSettings actions={actions as never} t={zhTranslate} />),
  );
  expect(row('concise').textContent).toContain('全局');
  expect(row('report').textContent).toContain('没有改动');
  expect(row('report').textContent).not.toContain('改了 0 处');

  globalPresetId = 'report';
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(actions.promptPresets).toHaveBeenCalledTimes(2);
  expect(row('report').textContent).toContain('全局');
  expect(row('concise').textContent).not.toContain('全局');
});
