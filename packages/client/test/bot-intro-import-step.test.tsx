// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ImportableSession } from '@botharness/host-client/session-bot';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives, shellPrimitives } = await import('./primitive-mocks.js');
  return { ...shellPrimitives(), ...dialogPrimitives() };
});

import { ImportStep, NO_IMPORT, type ImportChoice } from '../src/client/bot-intro-import-step.js';
import { zhTranslate as t } from '../src/client/locale.js';

const session = (sessionId: string, product: ImportableSession['product']): ImportableSession => ({
  sessionId,
  source: { kind: 'native' },
  product,
  cwd: '/work/app',
  workspacePath: '/work/app',
  running: false,
  lastPromptAt: 1,
  updatedAt: 1,
});

function Harness(props: {
  rows: ImportableSession[];
  track: (source: string, detected: boolean) => void;
  start: (product: string | undefined, count: number) => void;
}) {
  const choice = useState<ImportChoice>(NO_IMPORT);
  return createElement(ImportStep, {
    t,
    choice,
    sessions: async () => props.rows,
    track: props.track,
    start: props.start,
  });
}

it('asks which tools were used, shows found sessions and starts the import for local ones', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const track = vi.fn();
  const start = vi.fn();
  const rows = [
    session('claude-code:a', 'claude-code'),
    session('claude-code:b', 'claude-code'),
    session('d1', 'deepseek'),
  ];
  try {
    await act(() => root.render(createElement(Harness, { rows, track, start })));
    await act(async () => {});
    const card = (id: string) =>
      document.body.querySelector<HTMLButtonElement>(`[data-import-source="${id}"]`)!;
    expect(card('claude-code').textContent).toContain('找到 2 个会话');
    expect(document.body.querySelector('[data-intro-import-start]')).toBeNull();

    await act(() => card('codex').click());
    expect(track).toHaveBeenLastCalledWith('codex', false);
    expect(document.body.textContent).toContain('这台电脑上没找到 Codex 的会话。');

    await act(() => card('grok').click());
    expect(track).toHaveBeenLastCalledWith('grok', false);
    expect(document.body.textContent).toContain('从这些工具导入还在做');

    await act(() => card('claude-code').click());
    expect(track).toHaveBeenLastCalledWith('claude-code', true);
    expect(card('claude-code').getAttribute('aria-pressed')).toBe('true');
    await act(() =>
      document.body.querySelector<HTMLButtonElement>('[data-intro-import-start]')!.click(),
    );
    expect(start).toHaveBeenCalledWith('claude-code', 2);

    await act(() => card('claude-code').click());
    expect(track).toHaveBeenCalledTimes(3);
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});

it('offers a retry when this computer could not be read', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  let fail = true;
  const sessions = vi.fn(async () => {
    if (fail) throw new Error('offline');
    return [session('codex:a', 'codex')];
  });
  function Retry() {
    const choice = useState<ImportChoice>(NO_IMPORT);
    return createElement(ImportStep, { t, choice, sessions, track: () => {}, start: () => {} });
  }
  try {
    await act(() => root.render(createElement(Retry)));
    await act(async () => {});
    await act(() =>
      document.body.querySelector<HTMLButtonElement>('[data-import-source="codex"]')!.click(),
    );
    expect(document.body.textContent).toContain(t('intro.import.failed'));
    expect(document.body.textContent).not.toContain('这台电脑上没找到');
    fail = false;
    await act(() =>
      document.body.querySelector<HTMLButtonElement>('[data-intro-import-failed] button')!.click(),
    );
    await act(async () => {});
    expect(sessions).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[data-intro-import-failed]')).toBeNull();
    expect(document.body.querySelector('[data-intro-import-start]')).not.toBeNull();
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});
