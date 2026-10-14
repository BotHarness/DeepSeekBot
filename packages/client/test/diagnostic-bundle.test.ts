// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  const icon = () => null;
  return {
    ...dialogPrimitives(),
    IconCheckCircleOutlineRegular: icon,
    IconClockOutlineRegular: icon,
    IconInfoOutlineRegular: icon,
    IconShieldOutlineRegular: icon,
    IconWarningTriangleOutlineRegular: icon,
  };
});

import { DiagnosticBundleDialog } from '../src/client/diagnostic-bundle.js';
import { zhTranslate } from '../src/client/locale.js';
import { buttonNamed, dialog } from './primitive-mocks.js';

const PREVIEW = {
  token: 'reviewed',
  bytes: 4096,
  channels: [{ id: 'c1', type: 'group', name: 'QA', role: 'selected', messages: 3 }],
  bots: [{ slug: 'ada', displayName: 'Ada' }],
  sessions: [{ id: 's1', bot: 'ada', role: 'assignment', events: 7 }],
  admissions: 1,
  range: { start: '2026-10-06T09:00:00.000Z', end: '2026-10-06T10:00:00.000Z' },
  redaction: { level: 'standard', hits: { token: 2 } },
  omissions: [],
};

const selection = { channelId: 'c1', fromMessageId: 'm1', messageIds: ['m1'] };

function json(value: unknown, ok = true): Response {
  return { ok, json: async () => value } as Response;
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});

async function render(fetch: ReturnType<typeof vi.fn>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('fetch', fetch);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  await act(async () =>
    root.render(createElement(DiagnosticBundleDialog, { selection, onClose, t: zhTranslate })),
  );
  cleanups.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return { host, onClose };
}

describe('Diagnostic bundle dialog', () => {
  it('previews the selected scope before the download is offered', async () => {
    const fetch = vi.fn(async () => json(PREVIEW));
    const { host, onClose } = await render(fetch);
    expect(dialog().getAttribute('aria-label')).toBe('导出诊断包');
    expect(fetch).toHaveBeenCalledWith(
      './api/botharness/diagnostic-bundle/preview',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(selection) }),
    );
    expect(host.querySelector('[data-diagnostic-preview]')?.textContent).toContain('QA');
    expect(host.textContent).toContain('包含聊天原文');
    expect(buttonNamed('下载诊断包').disabled).toBe(false);
    await act(async () => buttonNamed('取消').click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports a failed preview and retries on request', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: 'scope-empty' } }, false))
      .mockResolvedValueOnce(json(PREVIEW));
    const { host } = await render(fetch);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('导出失败：scope-empty');
    expect(buttonNamed('下载诊断包').disabled).toBe(true);
    await act(async () => buttonNamed('重试').click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(buttonNamed('下载诊断包').disabled).toBe(false);
  });
});
