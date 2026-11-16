// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: Record<string, unknown>) => <button {...props} />,
  IconRefreshOutlineRegular: () => null,
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
