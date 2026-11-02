// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    'data-plugin-install'?: string;
    'data-plugin-restart-action'?: boolean;
  }) =>
    createElement(
      'button',
      {
        disabled: props.disabled,
        onClick: props.onClick,
        'data-plugin-install': props['data-plugin-install'],
        'data-plugin-restart-action': props['data-plugin-restart-action'] ? '' : undefined,
      },
      props.children,
    ),
}));

import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import {
  PluginUpdatesController,
  parsePluginInstall,
  parsePluginUpdates,
} from '../src/client/plugin-updates.js';
import { PluginsSection, pluginUpdateCommand } from '../src/client/plugin-updates-view.js';

const t = zhTranslate as unknown as BotHarnessTranslate;
const NAME = '@botharness/vrm-companion';
const compatible = { status: 'compatible', dshVersion: '0.2.1-rc.2' };

function available(current = '0.1.0', latest = '0.2.0') {
  return { name: NAME, status: 'available', current, latest, compatibility: compatible };
}

function watch() {
  return { wait: vi.fn(async () => undefined), reload: vi.fn() };
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

describe('plugin update parsing', () => {
  it('accepts the Host shapes and rejects malformed rows', () => {
    expect(
      parsePluginUpdates({ installable: true, restartable: false, plugins: [available()] }),
    ).toEqual({ installable: true, restartable: false, plugins: [available()] });
    expect(parsePluginUpdates({ plugins: [{ name: NAME, status: 'available' }] })).toBeUndefined();
    expect(parsePluginUpdates({})).toBeUndefined();
    expect(parsePluginInstall({ status: 'failed', name: NAME, reason: 'unknown-plugin' })).toEqual({
      status: 'failed',
      name: NAME,
      reason: 'unknown-plugin',
    });
    expect(parsePluginInstall({ status: 'failed', name: NAME, reason: 'boom' })).toBeUndefined();
  });

  it('builds the manual update command for a profile', () => {
    expect(pluginUpdateCommand(NAME, '0.2.0', 'web')).toBe(
      'dsh plugin --profile web add @botharness/vrm-companion@0.2.0',
    );
  });
});

describe('PluginUpdatesController', () => {
  it('reloads the page after a hot-applied update', async () => {
    const call = vi.fn<BridgeCall>(async (endpoint, payload) => ({
      ok: true,
      value:
        endpoint === 'pluginInstall'
          ? {
              status: 'installed',
              name: payload['name'],
              current: '0.1.0',
              installed: payload['version'],
              restartable: true,
              applied: true,
            }
          : { installable: true, restartable: true, plugins: [available()] },
    }));
    const restart = watch();
    const controller = new PluginUpdatesController(call, restart);
    await controller.load();
    await controller.install(NAME, '0.2.0');
    expect(call).toHaveBeenCalledWith('pluginInstall', { name: NAME, version: '0.2.0' });
    expect(controller.source.getSnapshot().rows[NAME]).toEqual({
      status: 'reloading',
      version: '0.2.0',
    });
    expect(restart.reload).toHaveBeenCalledOnce();
  });

  it('restarts the Host and reloads once the new version answers', async () => {
    let restarted = false;
    const call = vi.fn<BridgeCall>(async (endpoint) => {
      if (endpoint === 'pluginRestart') {
        restarted = true;
        return { ok: true, value: { status: 'restarting', plugins: [NAME] } };
      }
      return {
        ok: true,
        value: {
          installable: true,
          restartable: true,
          plugins: [
            restarted
              ? { name: NAME, status: 'current', current: '0.2.0', latest: '0.2.0' }
              : { name: NAME, status: 'restart-required', current: '0.1.0', installed: '0.2.0' },
          ],
        },
      };
    });
    const restart = watch();
    const controller = new PluginUpdatesController(call, restart);
    await controller.load();
    await controller.restart();
    expect(restart.reload).toHaveBeenCalledOnce();
    expect(controller.source.getSnapshot().restart).toBe('restarting');
  });

  it('keeps a failed install on its row', async () => {
    const call = vi.fn<BridgeCall>(async (endpoint) => ({
      ok: true,
      value:
        endpoint === 'pluginInstall'
          ? { status: 'failed', name: NAME, reason: 'network', diagnostic: 'ECONNRESET' }
          : { installable: true, restartable: false, plugins: [available()] },
    }));
    const controller = new PluginUpdatesController(call, watch());
    await controller.load();
    await controller.install(NAME, '0.2.0');
    expect(controller.source.getSnapshot().rows[NAME]).toEqual({
      status: 'failed',
      name: NAME,
      reason: 'network',
      diagnostic: 'ECONNRESET',
    });
  });
});

describe('PluginsSection', () => {
  it('shows each plugin with its version and an update button', async () => {
    const call = vi.fn<BridgeCall>(async () => ({
      ok: true,
      value: { installable: true, restartable: true, plugins: [available()] },
    }));
    const view = await render(createElement(PluginsSection, { call, t }));
    const row = view.host.querySelector(`[data-plugin-update="${NAME}"]`);
    expect(row?.textContent).toContain('VRM 伴侣');
    expect(row?.textContent).toContain('当前版本 0.1.0，可以更新到 0.2.0');
    expect(view.host.querySelector('[data-plugin-install="0.2.0"]')?.textContent).toBe('立即更新');
    view.unmount();
  });

  it('offers a restart once an update is staged', async () => {
    const call = vi.fn<BridgeCall>(async () => ({
      ok: true,
      value: {
        installable: true,
        restartable: true,
        plugins: [{ name: NAME, status: 'restart-required', current: '0.1.0', installed: '0.2.0' }],
      },
    }));
    const view = await render(createElement(PluginsSection, { call, t }));
    expect(view.host.textContent).toContain('已更新到 0.2.0，重启 DSH 后生效');
    expect(view.host.querySelector('[data-plugin-restart-action]')?.textContent).toBe('立即重启');
    view.unmount();
  });

  it('says when no other BotHarness plugin is installed', async () => {
    const call = vi.fn<BridgeCall>(async () => ({
      ok: true,
      value: { installable: true, restartable: true, plugins: [] },
    }));
    const view = await render(createElement(PluginsSection, { call, t }));
    expect(view.host.textContent).toContain('还没有安装其他 BotHarness 插件。');
    view.unmount();
  });
});
