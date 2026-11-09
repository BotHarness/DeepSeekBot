// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) =>
    createElement('button', { disabled: props.disabled, onClick: props.onClick }, props.children),
  Tooltip: (props: { children?: ReactNode }) => props.children,
  IconCloseOutlineRegular: () => null,
  IconDownloadOutlineRegular: () => null,
  Tag: (props: { children?: ReactNode }) => createElement('span', null, props.children),
  MarkdownText: (props: { text: string }) => createElement('div', null, props.text),
}));

import type { UpdateRun } from '../../core/src/release/update-runs.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { en, type BotHarnessTranslate } from '../src/client/locale.js';
import { UpdateRunPanel } from '../src/client/update-run-view.js';
import { parseUpdateRun, UpdateRunsController } from '../src/client/update-runs.js';

const t = ((key: string, params?: Record<string, unknown>) => {
  let text: string = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}) as unknown as BotHarnessTranslate;
const NAME = '@botharness/vrm-companion';
const ID = 'req-00000001';

function hostRun(overrides: Partial<UpdateRun> = {}): UpdateRun {
  return {
    id: ID,
    kind: 'plugin',
    name: NAME,
    version: '0.2.0',
    phase: 'installing',
    startedAt: '2026-11-09T18:00:00.000Z',
    commands: [
      {
        id: 'job-1',
        command: `pnpm add ${NAME}@0.2.0`,
        output: 'Progress: resolved 12, reused 10, downloaded 2\n',
        truncated: false,
      },
    ],
    cancellable: true,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('UpdateRunsController', () => {
  it('follows the Host run while the install is pending and keeps its final output', async () => {
    const install = deferred<unknown>();
    let host = hostRun();
    const ticks: (() => void)[] = [];
    const call = vi.fn<BridgeCall>(async (endpoint, payload) => {
      if (endpoint === 'updateRun') {
        expect(payload).toEqual({ id: ID });
        return { ok: true, value: host };
      }
      if (endpoint === 'pluginInstall') return { ok: true, value: await install.promise };
      throw new Error(`unexpected ${endpoint}`);
    });
    const runs = new UpdateRunsController(
      call,
      { wait: () => new Promise<void>((resolve) => ticks.push(resolve)) },
      () => ID,
    );
    const done = runs.run({ kind: 'plugin', name: NAME, version: '0.2.0' }, async (requestId) => {
      const result = await call('pluginInstall', { name: NAME, version: '0.2.0', requestId });
      return result.ok ? (result.value as { status: 'installed'; applied: boolean }) : undefined;
    });
    expect(runs.source.getSnapshot().run).toMatchObject({ id: ID, phase: 'checking' });
    expect(runs.busy()).toBe(true);
    await vi.waitFor(() => expect(ticks).toHaveLength(1));
    ticks.shift()!();
    await vi.waitFor(() =>
      expect(runs.source.getSnapshot().run?.commands[0]?.command).toBe(`pnpm add ${NAME}@0.2.0`),
    );
    host = hostRun({
      phase: 'installed',
      cancellable: false,
      installed: { applied: false },
      commands: [{ ...hostRun().commands[0]!, exitCode: 0 }],
    });
    install.resolve({ status: 'installed', applied: false });
    await done;
    expect(runs.source.getSnapshot().run).toMatchObject({
      phase: 'installed',
      commands: [{ exitCode: 0 }],
    });
    expect(runs.busy()).toBe(false);
    runs.dismiss();
    expect(runs.source.getSnapshot().run).toBeUndefined();
  });

  it('settles from the install answer when the Host has no update runs', async () => {
    const call = vi.fn<BridgeCall>(async () => ({
      ok: false,
      error: { code: 'unknown-method', message: 'no', details: {} },
    }));
    const runs = new UpdateRunsController(call, { wait: async () => {} }, () => ID);
    await runs.run({ kind: 'release', name: 'deepseekbot', version: '1.7.0' }, async () => ({
      status: 'failed' as const,
      reason: 'network',
      diagnostic: 'ERR_PNPM_FETCH_404',
    }));
    expect(runs.source.getSnapshot().run).toMatchObject({
      phase: 'failed',
      commands: [],
      failure: { reason: 'network', diagnostic: 'ERR_PNPM_FETCH_404' },
    });
  });

  it('asks the Host to stop the run and reports a run that can no longer stop', async () => {
    const install = deferred<unknown>();
    let answer = 'too-late';
    const call = vi.fn<BridgeCall>(async (endpoint) => {
      if (endpoint === 'updateCancel') return { ok: true, value: { status: answer } };
      if (endpoint === 'updateRun') return { ok: true, value: hostRun() };
      return { ok: true, value: await install.promise };
    });
    const runs = new UpdateRunsController(call, { wait: () => new Promise(() => {}) }, () => ID);
    const done = runs.run({ kind: 'plugin', name: NAME, version: '0.2.0' }, async () => {
      await call('pluginInstall', {});
      return { status: 'failed' as const, reason: 'cancelled' };
    });
    await runs.cancel();
    expect(call).toHaveBeenCalledWith('updateCancel', { id: ID });
    expect(runs.source.getSnapshot().cancel).toBe('too-late');
    answer = 'cancelled';
    await runs.cancel();
    expect(runs.source.getSnapshot().cancel).toBe('idle');
    expect(call.mock.calls.filter(([endpoint]) => endpoint === 'updateCancel')).toHaveLength(2);
    install.resolve(undefined);
    await done;
  });

  it('picks up an update another surface or the CLI started', async () => {
    let host: UpdateRun = hostRun();
    const call = vi.fn<BridgeCall>(async () => ({ ok: true, value: host }));
    const runs = new UpdateRunsController(call, {
      wait: async () => {
        host = hostRun({ phase: 'installed', cancellable: false, installed: { applied: true } });
      },
    });
    await runs.follow();
    expect(call).toHaveBeenNthCalledWith(1, 'updateRun', {});
    expect(call).toHaveBeenNthCalledWith(2, 'updateRun', { id: ID });
    expect(runs.source.getSnapshot().run?.phase).toBe('installed');
  });

  it('rejects malformed runs', () => {
    expect(parseUpdateRun(hostRun())).toEqual(hostRun());
    expect(parseUpdateRun({ ...hostRun(), phase: 'exploded' })).toBeUndefined();
    expect(parseUpdateRun({ ...hostRun(), commands: [{ id: 1 }] })).toBeUndefined();
  });
});

describe('UpdateRunPanel', () => {
  async function render(runs: UpdateRunsController, name = NAME) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(UpdateRunPanel, {
          controller: runs,
          kind: 'plugin',
          name,
          title: 'VRM Companion',
          t,
        }),
      );
    });
    return {
      host,
      unmount: () => {
        act(() => root.unmount());
        host.remove();
      },
    };
  }

  function seeded(run: UpdateRun, call: BridgeCall = async () => ({ ok: true, value: run })) {
    const runs = new UpdateRunsController(call, { wait: () => new Promise(() => {}) });
    runs.source.update((draft) => {
      draft.run = run;
    });
    return runs;
  }

  it('shows the steps, each command with its output, and Stop while installing', async () => {
    const call = vi.fn<BridgeCall>(async (endpoint) =>
      endpoint === 'updateCancel'
        ? { ok: true, value: { status: 'cancelling' } }
        : { ok: true, value: hostRun({ phase: 'cancelling' }) },
    );
    const view = await render(seeded(hostRun(), call));
    try {
      expect(view.host.textContent).toContain('Updating VRM Companion to 0.2.0');
      expect(view.host.querySelector('[aria-current="step"]')?.textContent).toContain(
        'Download and install',
      );
      expect(view.host.querySelector('[data-update-run-log]')?.textContent).toContain(
        `$ pnpm add ${NAME}@0.2.0\nProgress: resolved 12, reused 10, downloaded 2`,
      );
      const stop = view.host.querySelector<HTMLButtonElement>('button');
      expect(stop?.textContent).toBe('Stop');
      await act(async () => {
        stop?.click();
      });
      expect(call).toHaveBeenCalledWith('updateCancel', { id: ID });
      expect(view.host.textContent).toContain('Stopping and restoring the previous files');
    } finally {
      view.unmount();
    }
  });

  it('shows why the install failed, with the exit code and the log path', async () => {
    const view = await render(
      seeded(
        hostRun({
          phase: 'failed',
          cancellable: false,
          commands: [
            {
              id: 'job-1',
              command: `pnpm add ${NAME}@0.2.0`,
              output: 'ERR_PNPM_FETCH_404 GET https://registry.test/x: Not Found\n',
              truncated: false,
              exitCode: 1,
            },
          ],
          failure: {
            reason: 'failed',
            diagnostic: 'ERR_PNPM_FETCH_404 GET https://registry.test/x: Not Found',
            logPath: '/profile/install.log',
          },
        }),
      ),
    );
    try {
      expect(view.host.querySelector('[role="alert"]')?.textContent).toBe(
        'Update failed: ERR_PNPM_FETCH_404 GET https://registry.test/x: Not Found',
      );
      expect(view.host.querySelector('[data-update-run-log]')?.textContent).toContain('exit 1');
      expect(view.host.textContent).toContain('/profile/install.log');
      expect(view.host.querySelector('button')?.textContent).toBe('Close');
    } finally {
      view.unmount();
    }
  });

  it('stays out of another target’s surface', async () => {
    const view = await render(seeded(hostRun()), '@botharness/other');
    try {
      expect(view.host.textContent).toBe('');
    } finally {
      view.unmount();
    }
  });
});
