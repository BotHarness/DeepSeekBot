// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

import { ConnectionProgress } from '../src/client/connection-progress.js';
import { zhTranslate as t } from '../src/client/locale.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('copies a Bot prompt for the current phone step that names its CLI commands', async () => {
  const writeText = vi.fn(async (_text: string) => undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ConnectionProgress t={t} step={2} />));
  const button = host.querySelector<HTMLButtonElement>('[data-connection-bot-prompt]');
  expect(button?.textContent).toBe('复制给 Bot 的提示词');
  await act(async () => button?.click());
  expect(writeText).toHaveBeenCalledWith(t('connections.botPrompt.approve'));
  expect(String(writeText.mock.calls[0]?.[0])).toContain('deepseekbot device-requests');
  expect(String(writeText.mock.calls[0]?.[0])).toContain(
    'deepseekbot device-approve-key <receipt> <public-key> --confirm',
  );
  expect(button?.textContent).toBe('已复制，发给 Bot 即可');
  await act(async () => root.render(<ConnectionProgress t={t} joining step={1} />));
  expect(host.querySelector('[data-connection-bot-prompt]')).toBeNull();
  act(() => root.unmount());
});

it('shows the prompt as text with a failure note when copying fails, and retries', async () => {
  const writeText = vi.fn(async (_text: string): Promise<void> => {
    throw new Error('denied');
  });
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ConnectionProgress t={t} step={0} />));
  const button = host.querySelector<HTMLButtonElement>('[data-connection-bot-prompt]');
  await act(async () => button?.click());
  expect(host.textContent).toContain(t('connections.botPrompt.failed'));
  expect(host.textContent).toContain(t('connections.botPrompt.method'));
  expect(button?.textContent).toBe(t('connections.botPrompt.copy'));
  writeText.mockResolvedValueOnce(undefined);
  await act(async () => button?.click());
  expect(host.textContent).not.toContain(t('connections.botPrompt.failed'));
  expect(button?.textContent).toBe(t('connections.botPrompt.copied'));
  vi.stubGlobal('navigator', {});
  await act(async () => root.render(<ConnectionProgress t={t} step={1} />));
  await act(async () => button?.click());
  expect(host.textContent).toContain(t('connections.botPrompt.prepare'));
  act(() => root.unmount());
});
