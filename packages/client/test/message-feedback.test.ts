// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return dialogPrimitives();
});
import { MessageFeedbackDialog } from '../src/client/message-feedback.js';
import { zhTranslate } from '../src/client/locale.js';
import { buttonNamed } from './primitive-mocks.js';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
  vi.unstubAllGlobals();
});

it('requires a rating, previews evidence and keeps a failed submission available for retry', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const requests: string[] = [];
  let submits = 0;
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    requests.push(init.body?.toString() ?? '');
    if (path.endsWith('preview'))
      return {
        ok: true,
        json: async () => ({
          token: 'preview',
          canSubmit: true,
          bytes: 100,
          summary: {
            channels: [{ name: 'QA', role: 'selected', messages: 41 }],
            sessions: [],
            admissions: 0,
            omissions: [],
          },
          files: [],
        }),
      };
    submits += 1;
    return submits === 1
      ? { ok: false, json: async () => ({ error: { code: 'feedback-failed' } }) }
      : {
          ok: true,
          json: async () => ({ reportId: 'accepted-report', expiresAt: '2026-11-25T00:00:00Z' }),
        };
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(MessageFeedbackDialog, {
        channelId: 'dm',
        messageId: 'm30',
        t: zhTranslate,
        onClose() {},
      }),
    ),
  );
  cleanups.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  expect(buttonNamed('提交反馈').disabled).toBe(true);
  await act(async () => buttonNamed('不好').click());
  expect(buttonNamed('提交反馈').disabled).toBe(false);
  expect(container.textContent).toContain('41');
  await act(async () => buttonNamed('提交反馈').click());
  expect(container.textContent).toContain('提交失败');
  await act(async () => buttonNamed('提交反馈').click());
  expect(container.textContent).toContain('accepted-report');
  expect(requests[1]).toBe(requests[2]);
});
