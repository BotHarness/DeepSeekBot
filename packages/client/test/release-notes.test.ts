// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) =>
    createElement('button', { disabled: props.disabled, onClick: props.onClick }, props.children),
  Tag: (props: { tone?: string; children?: ReactNode }) =>
    createElement('span', { 'data-tone': props.tone }, props.children),
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
          { role: 'dialog' },
          createElement('h1', null, props.title),
          createElement('p', null, props.description),
          props.children,
          props.footer,
        )
      : null,
}));

import type { ReleaseNote } from '../../core/src/release/notes.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import { RELEASE_NOTES_SEEN_KEY, ReleaseNotesController } from '../src/client/release-notes.js';
import {
  ReleaseNotesAnnouncement,
  ReleaseSettings,
  releaseUpdateCommand,
} from '../src/client/release-notes-view.js';

const t = zhTranslate as unknown as BotHarnessTranslate;

function note(version: string, entries = 1): ReleaseNote {
  return {
    version,
    date: '2026-10-06',
    summary: { en: `Summary ${version}`, zh: `摘要 ${version}` },
    sections: [
      {
        name: 'Added',
        entries: Array.from({ length: entries }, (_, index) => ({
          en: `Added ${version} #${index}`,
          zh: `新增 ${version} #${index}`,
        })),
      },
    ],
  };
}

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

function bridge(
  version: string,
  releases: (since: string | undefined) => ReleaseNote[],
  update: unknown = { status: 'current', current: version, latest: version },
  install: unknown = { status: 'failed', reason: 'unavailable' },
  restart: unknown = { status: 'failed', reason: 'unavailable' },
) {
  return vi.fn<BridgeCall>(async (endpoint, payload) => {
    if (endpoint === 'releaseInfo') {
      const since = typeof payload['since'] === 'string' ? payload['since'] : undefined;
      return { ok: true, value: { version, releases: releases(since) } };
    }
    if (endpoint === 'releaseUpdate') return { ok: true, value: update };
    if (endpoint === 'releaseChannel')
      return { ok: true, value: { channel: 'stable', writable: true } };
    if (endpoint === 'releasePrompt')
      return { ok: true, value: { status: 'suppressed', reason: 'not-beta' } };
    if (endpoint === 'releaseInstall') return { ok: true, value: install };
    if (endpoint === 'releaseRestart') return { ok: true, value: restart };
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

describe('ReleaseNotesController', () => {
  it('announces only the installed release on first install and remembers it', async () => {
    const storage = memoryStorage();
    const call = bridge('1.0.1', () => [note('1.0.1')]);
    const controller = new ReleaseNotesController(call, storage);
    await controller.start();
    expect(call).toHaveBeenCalledWith('releaseInfo', {});
    expect(controller.source.getSnapshot().announcement?.map((n) => n.version)).toEqual(['1.0.1']);
    controller.dismiss();
    expect(storage.values.get(RELEASE_NOTES_SEEN_KEY)).toBe('1.0.1');
    expect(controller.source.getSnapshot().announcement).toBeUndefined();
  });

  it('announces every release since the last seen version after an update', async () => {
    const storage = memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.0.1' });
    const call = bridge('1.2.0', (since) =>
      since === '1.0.1' ? [note('1.2.0'), note('1.1.0')] : [],
    );
    const controller = new ReleaseNotesController(call, storage);
    await controller.start();
    expect(call).toHaveBeenCalledWith('releaseInfo', { since: '1.0.1' });
    expect(controller.source.getSnapshot().announcement?.map((n) => n.version)).toEqual([
      '1.2.0',
      '1.1.0',
    ]);
  });

  it('stays quiet for an already seen version, a downgrade or a source build', async () => {
    for (const [installed, seen] of [
      ['1.0.1', '1.0.1'],
      ['1.0.1', '1.2.0'],
      ['0.0.0', undefined],
    ] as const) {
      const storage = memoryStorage(seen === undefined ? {} : { [RELEASE_NOTES_SEEN_KEY]: seen });
      const controller = new ReleaseNotesController(
        bridge(installed, () => []),
        storage,
      );
      await controller.start();
      expect(controller.source.getSnapshot().announcement).toBeUndefined();
      expect(storage.values.get(RELEASE_NOTES_SEEN_KEY)).toBe(seen);
    }
  });

  it('marks a release without notes as seen without announcing it', async () => {
    const storage = memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.0.1' });
    const controller = new ReleaseNotesController(
      bridge('1.0.2', () => []),
      storage,
    );
    await controller.start();
    expect(controller.source.getSnapshot().announcement).toBeUndefined();
    expect(storage.values.get(RELEASE_NOTES_SEEN_KEY)).toBe('1.0.2');
  });

  it('reads an available update with its notes and reports unreachable checks', async () => {
    const available = new ReleaseNotesController(
      bridge('1.0.1', () => [], {
        status: 'available',
        current: '1.0.1',
        latest: '1.1.0',
        releases: [note('1.1.0')],
      }),
      memoryStorage(),
    );
    await available.start();
    await available.checkUpdate();
    expect(available.source.getSnapshot().update).toMatchObject({
      status: 'available',
      latest: '1.1.0',
    });

    const broken = vi.fn<BridgeCall>(async (endpoint) =>
      endpoint === 'releaseInfo'
        ? { ok: true, value: { version: '1.0.1', releases: [] } }
        : { ok: false, error: { code: 'release-unavailable', message: 'down', details: {} } },
    );
    const unreachable = new ReleaseNotesController(broken, memoryStorage());
    await unreachable.start();
    await unreachable.checkUpdate();
    expect(unreachable.source.getSnapshot().update).toEqual({
      status: 'unavailable',
      current: '1.0.1',
    });
  });
});

describe('ReleaseNotesController install', () => {
  const available = {
    status: 'available',
    current: '1.0.1',
    latest: '1.1.0',
    releases: [],
    installable: true,
  };

  it('switches to a pending restart after the Plugin Manager installs the update', async () => {
    const call = bridge('1.0.1', () => [], available, {
      status: 'installed',
      current: '1.0.1',
      installed: '1.1.0',
      restartable: true,
    });
    const controller = new ReleaseNotesController(call, memoryStorage());
    await controller.start();
    await controller.checkUpdate();
    expect(controller.source.getSnapshot().update).toMatchObject({ installable: true });
    await controller.install('1.1.0');
    expect(call).toHaveBeenCalledWith('releaseInstall', { version: '1.1.0' });
    expect(controller.source.getSnapshot().install).toEqual({ status: 'idle' });
    expect(controller.source.getSnapshot().update).toEqual({
      status: 'restart-required',
      current: '1.0.1',
      installed: '1.1.0',
      restartable: true,
    });
  });

  it('restarts DSH and reloads the page once the new Host answers', async () => {
    let hostVersion = '1.0.1';
    let down = false;
    const call = vi.fn<BridgeCall>(async (endpoint) => {
      if (down) throw new Error('disconnected');
      if (endpoint === 'releaseInfo')
        return { ok: true, value: { version: hostVersion, releases: [] } };
      if (endpoint === 'releaseUpdate') {
        return {
          ok: true,
          value: {
            status: 'restart-required',
            current: '1.0.1',
            installed: '1.1.0',
            restartable: true,
          },
        };
      }
      if (endpoint === 'releaseRestart') return { ok: true, value: { status: 'restarting' } };
      throw new Error(`unexpected ${endpoint}`);
    });
    const reload = vi.fn();
    let polls = 0;
    const controller = new ReleaseNotesController(call, memoryStorage(), {
      wait: async () => {
        polls += 1;
        down = polls === 1;
        if (polls === 3) hostVersion = '1.1.0';
      },
      reload,
    });
    await controller.start();
    await controller.checkUpdate();
    await controller.restart();
    expect(controller.source.getSnapshot().restart).toEqual({ status: 'restarting' });
    expect(polls).toBe(3);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('marks the restart failed when the Host refuses it', async () => {
    const controller = new ReleaseNotesController(
      bridge('1.0.1', () => [], undefined, undefined, { status: 'failed', reason: 'unavailable' }),
      memoryStorage(),
    );
    await controller.restart();
    expect(controller.source.getSnapshot().restart).toEqual({
      status: 'failed',
      reason: 'unavailable',
    });
  });

  it('keeps the update offer and records why an install failed', async () => {
    const controller = new ReleaseNotesController(
      bridge('1.0.1', () => [], available, {
        status: 'failed',
        reason: 'network',
        diagnostic: 'ERR_PNPM_FETCH',
        logPath: '/logs/1.log',
      }),
      memoryStorage(),
    );
    await controller.start();
    await controller.checkUpdate();
    await controller.install('1.1.0');
    expect(controller.source.getSnapshot().update).toMatchObject({ status: 'available' });
    expect(controller.source.getSnapshot().install).toEqual({
      status: 'failed',
      reason: 'network',
      diagnostic: 'ERR_PNPM_FETCH',
      logPath: '/logs/1.log',
    });

    const malformed = new ReleaseNotesController(
      bridge('1.0.1', () => [], available, { status: 'weird' }),
      memoryStorage(),
    );
    await malformed.start();
    await malformed.install('1.1.0');
    expect(malformed.source.getSnapshot().install).toEqual({ status: 'failed', reason: 'failed' });
  });
});

describe('release notes views', () => {
  it('refreshes the offer when another client changes the Host choice', async () => {
    let channel = 'beta';
    const call = vi.fn<BridgeCall>(async (method) => {
      if (method === 'releaseChannel') return { ok: true, value: { channel, writable: true } };
      return {
        ok: true,
        value:
          channel === 'beta'
            ? {
                status: 'available',
                current: '1.1.0',
                latest: '1.2.0-beta.1',
                releases: [],
                installable: true,
              }
            : { status: 'current', current: '1.1.0', latest: '1.1.0' },
      };
    });
    const controller = new ReleaseNotesController(call, memoryStorage());
    await controller.loadChannel();
    await controller.checkUpdate();
    channel = 'stable';
    await controller.loadChannel();
    expect(controller.source.getSnapshot().update).toEqual({
      status: 'current',
      current: '1.1.0',
      latest: '1.1.0',
    });
  });
  it('does not let a Settings read started during saving overwrite the confirmed choice', async () => {
    let finishSave: (() => void) | undefined;
    let finishRead: (() => void) | undefined;
    const saving = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const reading = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    let reads = 0;
    const fallback = bridge('1.1.0', () => []);
    const call = vi.fn<BridgeCall>(async (method, args) => {
      if (method === 'releaseChannelSet') {
        await saving;
        return { ok: true, value: { status: 'saved', channel: 'beta' } };
      }
      if (method === 'releaseChannel') {
        reads += 1;
        if (reads > 1) await reading;
        return { ok: true, value: { channel: 'stable', writable: true } };
      }
      return fallback(method, args);
    });
    const controller = new ReleaseNotesController(call, memoryStorage());
    await controller.loadChannel();
    const save = controller.setChannel('beta');
    const read = controller.loadChannel();
    finishSave?.();
    await save;
    finishRead?.();
    await read;
    expect(controller.source.getSnapshot().channel?.channel).toBe('beta');
  });
  it('blocks prerelease installs and manual commands when Host enrollment cannot be confirmed', async () => {
    const call = bridge('1.1.0', () => [], {
      status: 'available',
      current: '1.1.0',
      latest: '1.2.0-beta.1',
      releases: [],
      installable: true,
    });
    const unavailable = vi.fn<BridgeCall>(async (method, args) =>
      method === 'releaseChannel' ? { ok: true, value: undefined } : call(method, args),
    );
    const controller = new ReleaseNotesController(unavailable, memoryStorage());
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      expect(view.host.querySelector('[data-release-update]')).toBeNull();
      await act(async () => buttonNamed(view.host, '检查更新')!.click());
      expect(buttonNamed(view.host, '立即更新')?.disabled).toBe(true);
      await act(async () => {
        await controller.install('1.2.0-beta.1');
      });
      expect(call.mock.calls.some(([method]) => method === 'releaseInstall')).toBe(false);
      expect(view.host.querySelector('code')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('never suggests a different Profile manual command after a Beta install fails', async () => {
    const fallback = bridge(
      '1.1.0',
      () => [],
      {
        status: 'available',
        current: '1.1.0',
        latest: '1.2.0-beta.1',
        releases: [],
        installable: true,
      },
      { status: 'failed', reason: 'network' },
    );
    const call = vi.fn<BridgeCall>(async (method, args) =>
      method === 'releaseChannel'
        ? { ok: true, value: { channel: 'beta', writable: true } }
        : fallback(method, args),
    );
    const controller = new ReleaseNotesController(call, memoryStorage());
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      await act(async () => {
        await controller.install('1.2.0-beta.1');
      });
      expect(controller.source.getSnapshot().install).toEqual({
        status: 'failed',
        reason: 'network',
      });
      expect(view.host.querySelector('code')).toBeNull();
    } finally {
      view.unmount();
    }
  });
  it('joins and leaves Beta only on the connected Host, with no install or downgrade', async () => {
    let channel = 'stable';
    const fallback = bridge('1.2.0-beta.1', () => []);
    const call = vi.fn<BridgeCall>(async (method, args) => {
      if (method === 'releaseChannel') return { ok: true, value: { channel, writable: true } };
      if (method === 'releaseChannelSet') {
        channel = String(args['channel']);
        return { ok: true, value: { status: 'saved', channel } };
      }
      return fallback(method, args);
    });
    const controller = new ReleaseNotesController(call, memoryStorage());
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      expect(view.host.textContent).toContain('这台电脑的 Beta 更新');
      const join = buttonNamed(view.host, '加入 Beta');
      expect(join).toBeDefined();
      await act(async () => {
        join?.click();
      });
      expect(channel).toBe('beta');
      expect(view.host.textContent).toContain('不代表手机与电脑组合已验证');
      await act(async () => {
        buttonNamed(view.host, '退出 Beta')?.click();
      });
      expect(channel).toBe('stable');
      expect(view.host.textContent).toContain('不会降级或撤销已安装的更新');
      expect(view.host.textContent).toContain('不保证已有兼容的正式版可替换');
      expect(
        call.mock.calls.some(
          ([method]) => method === 'releaseInstall' || method === 'releaseRestart',
        ),
      ).toBe(false);
    } finally {
      view.unmount();
    }
  });

  it('keeps the last confirmed choice on save failure and can retry an unavailable channel read', async () => {
    let available = false;
    let canSave = false;
    const fallback = bridge('1.1.0', () => []);
    const call = vi.fn<BridgeCall>(async (method, args) => {
      if (method === 'releaseChannel')
        return available
          ? { ok: true, value: { channel: 'stable', writable: true } }
          : { ok: false, error: { code: 'unavailable', message: 'offline', details: {} } };
      if (method === 'releaseChannelSet')
        return {
          ok: true,
          value: canSave
            ? { status: 'saved', channel: 'beta' }
            : { status: 'failed', reason: 'storage-unavailable' },
        };
      return fallback(method, args);
    });
    const view = await render(
      createElement(ReleaseSettings, {
        releaseNotes: new ReleaseNotesController(call, memoryStorage()),
        t,
      } as never),
    );
    try {
      expect(buttonNamed(view.host, '加入 Beta')?.disabled).toBe(true);
      available = true;
      await act(async () => {
        buttonNamed(view.host, '检查更新')?.click();
      });
      expect(buttonNamed(view.host, '加入 Beta')?.disabled).toBe(false);
      await act(async () => {
        buttonNamed(view.host, '加入 Beta')?.click();
      });
      expect(view.host.querySelector('[role="alert"]')?.textContent).toContain(
        '无法确认这台电脑的更新选择',
      );
      expect(buttonNamed(view.host, '加入 Beta')).toBeDefined();
      expect(buttonNamed(view.host, '退出 Beta')).toBeUndefined();
      await act(async () => {
        buttonNamed(view.host, '检查更新')?.click();
      });
      expect(view.host.querySelector('[role="alert"]')?.textContent).toContain(
        '无法确认这台电脑的更新选择',
      );
      canSave = true;
      await act(async () => {
        buttonNamed(view.host, '加入 Beta')?.click();
      });
      expect(view.host.querySelector('[role="alert"]')).toBeNull();
      expect(buttonNamed(view.host, '退出 Beta')).toBeDefined();
    } finally {
      view.unmount();
    }
  });
  it('pops the changelog when Bot mode opens and closes it for good on Got it', async () => {
    const storage = memoryStorage();
    const controller = new ReleaseNotesController(
      bridge('1.0.1', () => [note('1.0.1', 12)]),
      storage,
    );
    const view = await render(createElement(ReleaseNotesAnnouncement, { controller, t }));
    try {
      const dialog = view.host.querySelector('[role="dialog"]');
      expect(dialog?.querySelector('h1')?.textContent).toBe('DeepSeekBot 1.0.1 更新内容');
      expect(dialog?.textContent).toContain('摘要 1.0.1');
      expect(dialog?.querySelector('summary')?.textContent).toBe('v1.0.12026-10-06当前版本12 项');
      expect(dialog?.querySelector('p')?.textContent).toBe(
        '欢迎使用 DeepSeekBot，这是当前版本带来的内容。',
      );
      expect(dialog?.querySelector('details')?.hasAttribute('open')).toBe(true);
      const chips = dialog?.querySelectorAll('[data-release-section="Added"] [data-tone]');
      expect(chips?.length).toBe(12);
      expect(chips?.[0]?.getAttribute('data-tone')).toBe('success');
      expect(chips?.[0]?.textContent).toBe('新增');
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      [...(dialog?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent === '去官网查看')
        ?.click();
      expect(open).toHaveBeenCalledWith(
        'https://deepseekbot.botharness.ai/changelog/',
        '_blank',
        'noopener,noreferrer',
      );
      open.mockRestore();
      const done = [...(dialog?.querySelectorAll('button') ?? [])].find(
        (button) => button.textContent === '知道了',
      );
      await act(async () => {
        done?.click();
      });
      expect(view.host.querySelector('[role="dialog"]')).toBeNull();
      expect(storage.values.get(RELEASE_NOTES_SEEN_KEY)).toBe('1.0.1');
    } finally {
      view.unmount();
    }
  });

  it('shows the installed version, the update command and the newer notes in Settings', async () => {
    const controller = new ReleaseNotesController(
      bridge('1.0.1', () => [], {
        status: 'available',
        current: '1.0.1',
        latest: '1.1.0',
        releases: [note('1.1.0'), note('1.0.2')],
      }),
      memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.0.1' }),
    );
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.host.textContent).toContain('当前版本 1.0.1，新版本 1.1.0 可用');
      expect(view.host.querySelector('code')?.textContent).toBe(releaseUpdateCommand('1.1.0'));
      expect(releaseUpdateCommand('1.1.0')).toBe('dsh plugin --profile web add deepseekbot@1.1.0');
      expect(view.host.querySelector('[role="dialog"]')).toBeNull();
      const notes = [...view.host.querySelectorAll('button')].find(
        (button) => button.textContent === '查看新版本内容',
      );
      await act(async () => {
        notes?.click();
      });
      const dialog = view.host.querySelector('[role="dialog"]');
      expect(dialog?.querySelector('h1')?.textContent).toBe('DeepSeekBot 1.1.0 更新内容');
      expect(dialog?.textContent).toContain('新增 1.1.0 #0');
      expect(dialog?.querySelector('summary')?.textContent).toContain('最新');
      const versions = dialog?.querySelectorAll('details');
      expect(versions?.[0]?.hasAttribute('open')).toBe(true);
      expect(versions?.[1]?.hasAttribute('open')).toBe(false);
    } finally {
      view.unmount();
    }
  });
  function buttonNamed(host: HTMLElement, name: string): HTMLButtonElement | undefined {
    return [...host.querySelectorAll('button')].find((button) => button.textContent === name);
  }

  it('updates from Settings in one click and then asks for a DSH restart', async () => {
    const controller = new ReleaseNotesController(
      bridge(
        '1.0.1',
        () => [],
        { status: 'available', current: '1.0.1', latest: '1.1.0', releases: [], installable: true },
        { status: 'installed', current: '1.0.1', installed: '1.1.0', restartable: true },
        { status: 'failed', reason: 'unavailable' },
      ),
      memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.0.1' }),
    );
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.host.querySelector('code')).toBeNull();
      expect(view.host.textContent).toContain('直接在这里安装新版本');
      await act(async () => {
        buttonNamed(view.host, '立即更新')?.click();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(buttonNamed(view.host, '立即更新')).toBeUndefined();
      expect(view.host.textContent).toContain('已更新到 1.1.0，重启 DSH 后生效');
      expect(view.host.textContent).toContain('当前运行 1.0.1，已安装 1.1.0，重启 DSH 后生效');
      expect(buttonNamed(view.host, '检查更新')?.disabled).toBe(true);
      expect(view.host.textContent).toContain('仅在电脑空闲时重启');
      await act(async () => {
        buttonNamed(view.host, '立即重启')?.click();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.host.querySelector('[data-release-restart-error]')?.textContent).toBe(
        '没能自动重启，请按下面的方式手动重启。',
      );
      expect(view.host.textContent).toContain('在运行 dsh web 的终端按 Ctrl+C');
    } finally {
      view.unmount();
    }
  });

  it.each(['busy', 'activity-unavailable'])(
    'offers explicit retry without manual commands after a %s refusal',
    async (reason) => {
      const call = bridge(
        '1.0.1',
        () => [],
        { status: 'available', current: '1.0.1', latest: '1.1.0', releases: [], installable: true },
        { status: 'failed', reason },
        { status: 'failed', reason },
      );
      const wait = vi.fn();
      const reload = vi.fn();
      const controller = new ReleaseNotesController(call, memoryStorage(), { wait, reload });
      const view = await render(
        createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
      );
      try {
        await act(async () => {
          buttonNamed(view.host, '立即更新')!.click();
        });
        expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('重试');
        expect(view.host.querySelector('code')).toBeNull();
        expect(buttonNamed(view.host, '立即更新')?.disabled).toBe(false);
        call.mockImplementation(
          bridge('1.0.1', () => [], {
            status: 'available',
            current: '1.0.1',
            latest: '1.1.0',
            releases: [],
            installable: false,
          }),
        );
        await act(async () => {
          await controller.checkUpdate('manual');
        });
        expect(view.host.querySelector('code')).toBeNull();
        call.mockImplementation(
          bridge(
            '1.0.1',
            () => [],
            { status: 'restart-required', current: '1.0.1', installed: '1.1.0', restartable: true },
            undefined,
            { status: 'failed', reason },
          ),
        );
        await act(async () => {
          await controller.checkUpdate('manual');
        });
        await act(async () => {
          buttonNamed(view.host, '立即重启')!.click();
        });
        expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('重试');
        expect(view.host.textContent).not.toContain('Ctrl+C');
        expect(view.host.textContent).not.toContain('完全退出');
        expect(buttonNamed(view.host, '立即重启')?.disabled).toBe(false);
        expect(wait).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
        expect(call.mock.calls.filter(([method]) => method === 'releaseRestart')).toHaveLength(1);
      } finally {
        view.unmount();
      }
    },
  );

  it('shows only the Desktop restart step inside DSH Desktop', async () => {
    Object.assign(globalThis, { dshDesktop: {} });
    const controller = new ReleaseNotesController(
      bridge('1.0.1', () => [], {
        status: 'restart-required',
        current: '1.0.1',
        installed: '1.1.0',
        restartable: true,
      }),
      memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.0.1' }),
    );
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.host.textContent).toContain('桌面版：完全退出 DSH 后重新打开。');
      expect(buttonNamed(view.host, '立即重启')).toBeUndefined();
      expect(view.host.textContent).not.toContain('dsh web');
    } finally {
      view.unmount();
      delete (globalThis as { dshDesktop?: unknown }).dshDesktop;
    }
  });

  it('shows a Beta update card once, defers it, and preserves explicit manual checks', async () => {
    let claimed = false;
    const fallback = bridge('1.0.1', () => [], {
      status: 'available',
      current: '1.0.1',
      latest: '1.2.0-beta.1',
      releases: [],
      installable: true,
    });
    const call = vi.fn<BridgeCall>(async (method, payload) => {
      if (method === 'releaseChannel')
        return { ok: true, value: { channel: 'beta', writable: true } };
      if (method === 'releasePrompt') {
        const value = claimed
          ? { status: 'suppressed', reason: 'already-prompted' }
          : { status: 'claimed' };
        claimed = true;
        return { ok: true, value };
      }
      return fallback(method, payload);
    });
    const controller = new ReleaseNotesController(call, memoryStorage());
    let view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      expect(view.host.querySelector('[data-release-update]')).not.toBeNull();
      const later = buttonNamed(view.host, '稍后再看');
      expect(later).toBeDefined();
      await act(async () => later!.click());
      expect(view.host.querySelector('[data-release-update]')).toBeNull();
      view.unmount();
      const second = new ReleaseNotesController(call, memoryStorage());
      view = await render(createElement(ReleaseSettings, { releaseNotes: second, t } as never));
      expect(view.host.querySelector('[data-release-update]')).toBeNull();
      await act(async () => buttonNamed(view.host, '检查更新')!.click());
      expect(view.host.querySelector('[data-release-update]')).not.toBeNull();
      expect(call.mock.calls.filter(([method]) => method === 'releasePrompt')).toHaveLength(2);
      expect(
        call.mock.calls.some(
          ([method]) => method === 'releaseInstall' || method === 'releaseRestart',
        ),
      ).toBe(false);
    } finally {
      view.unmount();
    }
  });

  it('does not resurrect a dismissed card when its Host claim finishes late', async () => {
    let finish!: (value: Awaited<ReturnType<BridgeCall>>) => void;
    const claim = new Promise<Awaited<ReturnType<BridgeCall>>>((resolve) => {
      finish = resolve;
    });
    const fallback = bridge('1.0.1', () => [], {
      status: 'available',
      current: '1.0.1',
      latest: '1.2.0-beta.1',
      releases: [],
      installable: true,
    });
    const call: BridgeCall = async (method, payload) => {
      if (method === 'releaseChannel')
        return { ok: true, value: { channel: 'beta', writable: true } };
      if (method === 'releasePrompt') return claim;
      return fallback(method, payload);
    };
    const controller = new ReleaseNotesController(call, memoryStorage());
    await controller.loadChannel();
    const pendingCheck = controller.checkUpdate();
    await Promise.resolve();
    controller.dismissUpdate();
    finish({ ok: true, value: { status: 'claimed' } });
    await pendingCheck;
    expect(controller.source.getSnapshot().updateVisible).toBe(false);
    expect(controller.source.getSnapshot().update.status).toBe('idle');
  });

  it('keeps automatic Beta cards quiet on old Hosts without disabling manual checks', async () => {
    const fallback = bridge('1.0.1', () => [], {
      status: 'available',
      current: '1.0.1',
      latest: '1.2.0-beta.1',
      releases: [],
      installable: true,
    });
    const call: BridgeCall = async (method, payload) => {
      if (method === 'releaseChannel')
        return { ok: true, value: { channel: 'beta', writable: true } };
      if (method === 'releasePrompt') throw new Error('unsupported method');
      return fallback(method, payload);
    };
    const controller = new ReleaseNotesController(call, memoryStorage());
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      expect(view.host.querySelector('[data-release-update]')).toBeNull();
      await act(async () => buttonNamed(view.host, '检查更新')!.click());
      expect(view.host.querySelector('[data-release-update]')).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('claims against the Host even when its cached channel still says stable', async () => {
    const fallback = bridge('1.0.1', () => [], {
      status: 'available',
      current: '1.0.1',
      latest: '1.2.0-beta.1',
      releases: [],
      installable: true,
    });
    const call = vi.fn<BridgeCall>(async (method, payload) => {
      if (method === 'releasePrompt')
        return { ok: true, value: { status: 'suppressed', reason: 'already-prompted' } };
      return fallback(method, payload);
    });
    const controller = new ReleaseNotesController(call, memoryStorage());
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      expect(call).toHaveBeenCalledWith('releasePrompt', { version: '1.2.0-beta.1' });
      expect(view.host.querySelector('[data-release-update]')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('projects successful Beta claim authority before rendering controls from a stale stable cache', async () => {
    const fallback = bridge('1.0.1', () => [], {
      status: 'available',
      current: '1.0.1',
      latest: '1.2.0-beta.1',
      releases: [],
      installable: true,
    });
    const call: BridgeCall = async (method, payload) =>
      method === 'releasePrompt'
        ? { ok: true, value: { status: 'claimed' } }
        : fallback(method, payload);
    const controller = new ReleaseNotesController(call, memoryStorage());
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      expect(buttonNamed(view.host, '稍后再看')).toBeDefined();
      expect(buttonNamed(view.host, '立即更新')?.disabled).toBe(false);
      expect(view.host.textContent).toContain('不代表手机与电脑组合已通过验证');
      expect(controller.source.getSnapshot().channel?.channel).toBe('beta');
    } finally {
      view.unmount();
    }
  });

  it('resumes the new Settings visit after an older visit finishes saving its channel', async () => {
    let finish!: (value: Awaited<ReturnType<BridgeCall>>) => void;
    const save = new Promise<Awaited<ReturnType<BridgeCall>>>((resolve) => {
      finish = resolve;
    });
    const call = vi.fn<BridgeCall>(async (method, payload) => {
      if (method === 'releaseChannelSet') return save;
      if (method === 'releasePrompt') return { ok: true, value: { status: 'claimed' } };
      return bridge('1.0.1', () => [], {
        status: 'available',
        current: '1.0.1',
        latest: '1.2.0-beta.1',
        releases: [],
        installable: true,
      })(method, payload);
    });
    const controller = new ReleaseNotesController(call, memoryStorage());
    let view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    let pendingSave!: Promise<void>;
    await act(async () => {
      pendingSave = controller.setChannel('beta');
    });
    view.unmount();
    view = await render(createElement(ReleaseSettings, { releaseNotes: controller, t } as never));
    try {
      await act(async () => {
        finish({ ok: true, value: { status: 'saved', channel: 'beta' } });
        await pendingSave;
      });
      expect(controller.source.getSnapshot().update.status).toBe('available');
      expect(view.host.querySelector('[data-release-update]')).not.toBeNull();
      expect(call.mock.calls.filter(([method]) => method === 'releasePrompt')).toHaveLength(2);
    } finally {
      view.unmount();
    }
  });

  it('checks a newer candidate when Settings reopens with the same controller', async () => {
    let latest = '1.2.0-beta.1';
    const fallback = bridge('1.0.1', () => []);
    const call: BridgeCall = async (method, payload) => {
      if (method === 'releaseChannel')
        return { ok: true, value: { channel: 'beta', writable: true } };
      if (method === 'releaseUpdate')
        return {
          ok: true,
          value: { status: 'available', current: '1.0.1', latest, releases: [], installable: true },
        };
      if (method === 'releasePrompt') return { ok: true, value: { status: 'claimed' } };
      return fallback(method, payload);
    };
    const controller = new ReleaseNotesController(call, memoryStorage());
    let view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    expect(
      view.host.querySelector('[data-release-update]')?.getAttribute('data-release-update'),
    ).toBe(latest);
    view.unmount();
    latest = '1.2.0-beta.2';
    view = await render(createElement(ReleaseSettings, { releaseNotes: controller, t } as never));
    try {
      expect(
        view.host.querySelector('[data-release-update]')?.getAttribute('data-release-update'),
      ).toBe(latest);
    } finally {
      view.unmount();
    }
  });

  it('does not start a delayed manual check after Settings closes', async () => {
    let channelReads = 0;
    let finish!: (value: Awaited<ReturnType<BridgeCall>>) => void;
    const delayed = new Promise<Awaited<ReturnType<BridgeCall>>>((resolve) => {
      finish = resolve;
    });
    const fallback = bridge('1.0.1', () => [], {
      status: 'available',
      current: '1.0.1',
      latest: '1.2.0-beta.1',
      releases: [],
      installable: true,
    });
    const call = vi.fn<BridgeCall>(async (method, payload) => {
      if (method === 'releaseChannel') {
        if (++channelReads > 1) return delayed;
        return { ok: true, value: { channel: 'beta', writable: true } };
      }
      if (method === 'releasePrompt') return { ok: true, value: { status: 'claimed' } };
      return fallback(method, payload);
    });
    const controller = new ReleaseNotesController(call, memoryStorage());
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    await act(async () => buttonNamed(view.host, '检查更新')!.click());
    view.unmount();
    await act(async () => finish({ ok: true, value: { channel: 'beta', writable: true } }));
    expect(controller.source.getSnapshot().updateVisible).toBe(false);
    expect(call.mock.calls.filter(([method]) => method === 'releaseUpdate')).toHaveLength(1);
  });

  it('shows why the install failed and falls back to the manual command', async () => {
    const controller = new ReleaseNotesController(
      bridge(
        '1.0.1',
        () => [],
        { status: 'available', current: '1.0.1', latest: '1.1.0', releases: [], installable: true },
        { status: 'failed', reason: 'incompatible' },
      ),
      memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.0.1' }),
    );
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        buttonNamed(view.host, '立即更新')?.click();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.host.querySelector('[role="alert"]')?.textContent).toContain(
        '新版本与当前 DSH 版本不兼容',
      );
      expect(view.host.querySelector('code')?.textContent).toBe(releaseUpdateCommand('1.1.0'));
      expect(buttonNamed(view.host, '立即更新')?.disabled).toBe(false);
    } finally {
      view.unmount();
    }
  });
});
