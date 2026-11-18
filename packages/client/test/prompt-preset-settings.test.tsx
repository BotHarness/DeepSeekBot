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

it('keeps the newest read when a focus read finishes after a later one', async () => {
  const pending: ((value: unknown) => void)[] = [];
  const racing = {
    promptParts: async () => ({ parts: [], limits: [] }),
    promptPresets: vi.fn(() => new Promise((resolve) => pending.push(resolve))),
  };
  await act(async () =>
    root.render(<PromptPresetSettings actions={racing as never} t={zhTranslate} />),
  );
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  const answer = (global: string) => ({
    presets: [preset('concise', '简洁回复', {}), preset('report', '长篇报告', {})],
    globalPresetId: global,
  });
  await act(async () => pending[1]!(answer('report')));
  await act(async () => pending[0]!(answer('concise')));
  expect(row('report').textContent).toContain('全局');
  expect(row('concise').textContent).not.toContain('全局');
});

it('keeps the presets on screen and offers a retry when a refresh fails', async () => {
  let fail = false;
  const flaky = {
    promptParts: async () => ({ parts: [], limits: [] }),
    promptPresets: vi.fn(async () => {
      if (fail) throw new Error('Host offline');
      return { presets: [preset('concise', '简洁回复', {})], globalPresetId: 'concise' };
    }),
  };
  await act(async () =>
    root.render(<PromptPresetSettings actions={flaky as never} t={zhTranslate} />),
  );
  fail = true;
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  const notice = () => host.querySelector('[data-prompt-refresh-error]');
  expect(row('concise').textContent).toContain('全局');
  expect(notice()?.textContent).toContain('Host offline');
  fail = false;
  await act(async () => (notice()!.querySelector('button') as HTMLButtonElement).click());
  expect(notice()).toBeNull();
});

it('removes the override on reset even if the built-in text changes while the editor is open', async () => {
  let defaultText = 'Lead the team.';
  const promptPresetUpdate = vi.fn(async () => ({
    preset: preset('concise', '简洁回复', {}),
  }));
  const editing = {
    promptParts: async () => ({
      parts: [{ id: 'coordination', kind: 'system', section: '', defaultText, defaultHash: 'h1' }],
      limits: [],
    }),
    promptPresets: async () => ({
      presets: [preset('concise', '简洁回复', { coordination: { text: 'Be brief.', base: 'h1' } })],
      globalPresetId: null,
    }),
    promptPresetUpdate,
  };
  await act(async () =>
    root.render(<PromptPresetSettings actions={editing as never} t={zhTranslate} />),
  );
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find((node) => node.textContent === label)!;
  await act(async () => button(zhTranslate('prompts.edit')).click());
  await act(async () =>
    button(zhTranslate('prompts.reset', { source: zhTranslate('prompts.source.builtIn') })).click(),
  );
  defaultText = 'Lead the team, and report back.';
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  await act(async () => {
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(promptPresetUpdate).toHaveBeenCalledWith('concise', {
    parts: { coordination: null },
    expectedRevision: 1,
  });
});
