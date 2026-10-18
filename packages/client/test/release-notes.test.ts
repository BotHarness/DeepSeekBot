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
import {
  RELEASE_NOTES_SEEN_KEY,
  ReleaseNotesController,
  parseReleaseInfo,
} from '../src/client/release-notes.js';
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
      return {
        ok: true,
        value: {
          version,
          releases: releases(since),
          ...(version === '0.0.0' ? {} : { identity: { kind: 'release', version } }),
        },
      };
    }
    if (endpoint === 'releaseUpdate') return { ok: true, value: update };
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
  it('can retry About identity while the remaining Host components are starting', async () => {
    let ready = false;
    const call = vi.fn<BridgeCall>(async (endpoint) => ({
      ok: true,
      value:
        endpoint === 'releaseInfo'
          ? ready
            ? { version: '2.0.0', identity: { kind: 'release', version: '2.0.0' }, releases: [] }
            : {
                version: 'unknown',
                identity: { kind: 'unknown', reason: 'composition-unverified' },
                releases: [],
              }
          : { status: 'current', current: '2.0.0', latest: '2.0.0' },
    }));
    const controller = new ReleaseNotesController(call, memoryStorage());
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      const button = [...view.host.querySelectorAll('button')].find(
        (element) => element.textContent === t('release.check'),
      )!;
      expect(button.disabled).toBe(false);
      ready = true;
      await act(async () => {
        button.click();
      });
      expect(controller.source.getSnapshot().identity).toEqual({
        kind: 'release',
        version: '2.0.0',
      });
      expect(view.host.textContent).toContain('2.0.0');
    } finally {
      view.unmount();
    }
  });
  it.each([
    [
      { kind: 'development', source: { revision: 'a'.repeat(40), dirty: true } },
      '源码开发构建 aaaaaaaaa（含未提交修改）',
    ],
    [{ kind: 'unknown', reason: 'metadata-missing' }, '无法验证运行版本（metadata-missing）'],
    [undefined, '旧版电脑端未提供可验证的运行身份'],
  ])('renders explicit identity without a fake 0.0.0 release: %j', async (identity, expected) => {
    const call = vi.fn<BridgeCall>(async (endpoint) => ({
      ok: true,
      value:
        endpoint === 'releaseInfo'
          ? { version: '0.0.0', releases: [], ...(identity === undefined ? {} : { identity }) }
          : { status: 'development', current: '0.0.0' },
    }));
    const controller = new ReleaseNotesController(call, memoryStorage());
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      expect(view.host.textContent).toContain(expected);
      expect(view.host.textContent).not.toContain('0.0.0');
    } finally {
      view.unmount();
    }
  });

  it('does not accept a release identity that disagrees with its version', () => {
    expect(
      parseReleaseInfo({
        version: '1.0.0',
        releases: [],
        identity: { kind: 'release', version: '2.0.0' },
      })?.identity,
    ).toEqual({ kind: 'unknown', reason: 'metadata-invalid' });
  });
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
    expect(controller.source.getSnapshot().updateNotice).toBe(true);
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
        if (polls === 2) hostVersion = '1.0.2';
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
    expect(controller.source.getSnapshot().restart).toEqual({ status: 'failed' });
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
      expect(view.host.textContent).toContain('重启会中断正在运行的任务');
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

describe('automatic upgrade notice', () => {
  it('checks on Bot entry and remembers one exact target separately from installed notes', async () => {
    const storage = memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.3.1' });
    let profileId = 'profile-a';
    let latest = '1.4.0';
    const call: BridgeCall = async (method) => ({
      ok: true,
      value:
        method === 'releaseInfo'
          ? {
              version: '1.3.1',
              identity: { kind: 'release', version: '1.3.1' },
              profileId,
              releases: [],
            }
          : {
              status: 'available',
              current: '1.3.1',
              latest,
              installable: true,
              releases: [],
              compatibility: { status: 'compatible', dshVersion: '0.2.1-rc.2' },
            },
    });
    const controller = new ReleaseNotesController(call, storage);
    await controller.enter();
    expect(controller.source.getSnapshot().updateNotice).toBe(true);
    controller.dismissUpdate();
    const restarted = new ReleaseNotesController(call, storage);
    await restarted.enter();
    expect(restarted.source.getSnapshot().updateNotice).toBe(false);
    expect(restarted.source.getSnapshot().update.status).toBe('available');
    profileId = 'profile-b';
    const otherProfile = new ReleaseNotesController(call, storage);
    await otherProfile.enter();
    expect(otherProfile.source.getSnapshot().updateNotice).toBe(true);
    profileId = 'profile-a';
    latest = '1.4.1';
    const nextTarget = new ReleaseNotesController(call, storage);
    await nextTarget.enter();
    expect(nextTarget.source.getSnapshot().updateNotice).toBe(true);
  });
});

it('shows a pending restart independently after a fresh Client starts', async () => {
  const controller = new ReleaseNotesController(
    async (method) => ({
      ok: true,
      value:
        method === 'releaseInfo'
          ? { version: '1.3.1', releases: [], profileId: 'profile-a' }
          : { status: 'restart-required', current: '1.3.1', installed: '1.4.0', restartable: true },
    }),
    memoryStorage(),
  );
  await controller.enter();
  expect(controller.source.getSnapshot().updateNotice).toBe(true);
});

it('serializes installed notes before the pending restart modal', async () => {
  const controller = new ReleaseNotesController(
    async (method) => ({
      ok: true,
      value:
        method === 'releaseInfo'
          ? { version: '1.3.1', releases: [note('1.3.1')], profileId: 'profile-a' }
          : { status: 'restart-required', current: '1.3.1', installed: '1.4.0', restartable: true },
    }),
    memoryStorage(),
  );
  await controller.enter();
  const view = await render(createElement(ReleaseNotesAnnouncement, { controller, t }));
  try {
    expect(view.host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(view.host.textContent).toContain('1.3.1');
    await act(async () => controller.dismiss());
    expect(view.host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(view.host.textContent).toContain('1.4.0');
  } finally {
    view.unmount();
  }
});
