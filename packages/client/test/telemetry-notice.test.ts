// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode; onClick?: () => void }) =>
    createElement('button', { onClick: props.onClick }, props.children),
  Tag: (props: { children?: ReactNode }) => createElement('span', null, props.children),
  MarkdownText: (props: { text: string }) =>
    createElement('div', { 'data-markdown': '' }, props.text),
  Modal: (props: {
    open: boolean;
    title: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    props.open
      ? createElement(
          'section',
          { role: 'dialog', 'data-title': props.title },
          createElement('h1', null, props.title),
          createElement('p', null, props.description),
          props.children,
          props.footer,
        )
      : null,
}));

import type { ReleaseNote } from '../../core/src/release/notes.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import { ReleaseNotesController } from '../src/client/release-notes.js';
import { ReleaseNotesAnnouncement } from '../src/client/release-notes-view.js';
import {
  TELEMETRY_NOTICE_SEEN_KEY,
  TelemetryNoticeController,
} from '../src/client/telemetry-notice.js';
import { TelemetryNotice } from '../src/client/telemetry-notice-view.js';

const t = zhTranslate as unknown as BotHarnessTranslate;

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const NOTE: ReleaseNote = {
  version: '1.0.2',
  date: '2026-10-06',
  summary: { en: 'Summary', zh: '摘要' },
  sections: [{ name: 'Added', entries: [{ en: 'Added', zh: '新增' }] }],
};

function bridge(enabled: boolean, releases: ReleaseNote[] = []) {
  return vi.fn<BridgeCall>(async (endpoint) => {
    if (endpoint === 'telemetryStatus') return { ok: true, value: { enabled } };
    if (endpoint === 'releaseInfo') return { ok: true, value: { version: '1.0.2', releases } };
    throw new Error(`unexpected ${endpoint}`);
  });
}

async function render(element: ReturnType<typeof createElement>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('TelemetryNoticeController', () => {
  it('opens once while telemetry is on and remembers the dismissal', async () => {
    const storage = memoryStorage();
    const call = bridge(true);
    const controller = new TelemetryNoticeController(call, storage);
    await controller.start();
    expect(call).toHaveBeenCalledWith('telemetryStatus', {});
    expect(controller.source.getSnapshot().open).toBe(true);
    controller.dismiss();
    expect(storage.values.get(TELEMETRY_NOTICE_SEEN_KEY)).toBe('1');
    expect(controller.source.getSnapshot().open).toBe(false);

    const again = new TelemetryNoticeController(call, storage);
    await again.start();
    expect(again.source.getSnapshot().open).toBe(false);
    expect(call).toHaveBeenCalledOnce();
  });

  it('stays closed when the Host reports telemetry off', async () => {
    const storage = memoryStorage();
    const controller = new TelemetryNoticeController(bridge(false), storage);
    await controller.start();
    expect(controller.source.getSnapshot().open).toBe(false);
    expect(storage.values.has(TELEMETRY_NOTICE_SEEN_KEY)).toBe(false);
  });
});

describe('TelemetryNotice', () => {
  it('waits for the release announcement, then explains telemetry and links privacy and source', async () => {
    const storage = memoryStorage();
    const call = bridge(true, [NOTE]);
    const releaseNotes = new ReleaseNotesController(call, storage);
    const controller = new TelemetryNoticeController(call, storage);
    const opened = vi.fn();
    vi.stubGlobal('open', opened);
    const view = await render(
      createElement('div', null, [
        createElement(ReleaseNotesAnnouncement, { key: 'r', controller: releaseNotes, t }),
        createElement(TelemetryNotice, { key: 't', controller, releaseNotes, t }),
      ]),
    );
    const dialogs = () =>
      [...view.host.querySelectorAll('[role="dialog"]')].map((node) =>
        node.getAttribute('data-title'),
      );
    expect(dialogs()).toEqual(['Tobs 1.0.2 更新内容']);

    await act(async () => {
      releaseNotes.dismiss();
    });
    expect(dialogs()).toEqual(['关于匿名使用统计']);
    const notice = view.host.querySelector('[data-telemetry-notice]');
    expect(notice?.textContent).toContain('BOTHARNESS_TELEMETRY=0');
    expect(notice?.textContent).toContain('DO_NOT_TRACK=1');
    expect(notice?.textContent).toContain('telemetry: false');

    const buttons = [...view.host.querySelectorAll('button')];
    buttons.find((button) => button.textContent === '隐私说明')?.click();
    buttons.find((button) => button.textContent === '查看源码')?.click();
    expect(opened.mock.calls.map(([url]) => url)).toEqual([
      'https://tobs.app/privacy/',
      'https://github.com/BotHarness/BotHarness/tree/main/packages/core/src/telemetry',
    ]);

    await act(async () => {
      buttons.find((button) => button.textContent === '知道了')?.click();
    });
    expect(dialogs()).toEqual([]);
    expect(storage.values.get(TELEMETRY_NOTICE_SEEN_KEY)).toBe('1');
    view.unmount();
    vi.unstubAllGlobals();
  });

  it('leads the opt-out with the Bot settings switch and opens Bot settings from the notice', async () => {
    const storage = memoryStorage();
    const openSettings = vi.fn();
    const controller = new TelemetryNoticeController(bridge(true), storage, openSettings);
    const view = await render(createElement(TelemetryNotice, { controller, t }));
    const optOut = view.host.querySelector('[data-telemetry-row="opt-out"] dd');
    expect(optOut?.textContent?.startsWith('在「Bot 设置 → 匿名使用统计」中随时关闭')).toBe(true);
    expect(optOut?.textContent).toContain('telemetry: false');
    await act(async () => {
      [...view.host.querySelectorAll('button')]
        .find((button) => button.textContent === '打开 Bot 设置')
        ?.click();
    });
    expect(openSettings).toHaveBeenCalledOnce();
    expect(view.host.querySelector('[role="dialog"]')).toBeNull();
    expect(storage.values.get(TELEMETRY_NOTICE_SEEN_KEY)).toBe('1');
    view.unmount();
  });

  it('links the English privacy page from the English locale', () => {
    expect(en['telemetry.notice.privacyUrl']).toBe('https://tobs.app/en/privacy/');
  });
});
