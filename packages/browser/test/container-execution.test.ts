import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';

import {
  CONTAINER_BROWSER_IMAGE,
  containerBrowserArgs,
  containerBrowserIdentity,
  createContainerBrowserExecution,
} from '../src/runtime/container.js';

describe('Container Browser execution boundary', () => {
  it('releases the old loopback relay and unique viewer registration before relaunch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'browser-relaunch-'));
    const identity = containerBrowserIdentity(directory);
    let owned = false;
    let registered = false;
    const release = vi.fn(() => {
      registered = false;
    });
    const execution = createContainerBrowserExecution({
      profileDirectory: directory,
      run: async (args) => {
        if (args[0] === 'ps') return owned ? 'owned' : '';
        if (args[0] === 'inspect' || (args[0] === 'volume' && args[1] === 'inspect'))
          return identity;
        if (args[0] === 'run' && args[1] === '-d') owned = true;
        if (args[0] === 'rm') owned = false;
        if (args[0] === 'exec')
          return JSON.stringify({
            webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/qa',
          });
        if (args[0] === 'port') return '127.0.0.1:12345';
        return '';
      },
      onViewer: () => {
        if (registered) throw new Error('duplicate viewer');
        registered = true;
        return release;
      },
    });
    try {
      const first = await execution.start();
      await execution.start();
      expect(release).toHaveBeenCalledOnce();
      expect(execution.isRunning()).toBe(true);
      const oldPort = Number(new URL(first.endpoint).port);
      await expect(
        new Promise<void>((resolve, reject) => {
          const socket = createConnection(oldPort, '127.0.0.1');
          socket.once('connect', () => {
            socket.destroy();
            resolve();
          });
          socket.once('error', reject);
        }),
      ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    } finally {
      await execution.stop();
      await rm(directory, { recursive: true, force: true });
    }
    expect(release).toHaveBeenCalledTimes(2);
  });
  it('keeps identity profile-scoped and separates named profiles', () => {
    expect(containerBrowserIdentity('/qa/profile/browser')).toBe(
      containerBrowserIdentity('/qa/profile/browser'),
    );
    expect(containerBrowserIdentity('/qa/profile/browser')).not.toBe(
      containerBrowserIdentity('/qa/other/browser'),
    );
    expect(containerBrowserIdentity('/qa/profile/browser')).not.toBe(
      containerBrowserIdentity('/qa/profile/browser-profiles/work'),
    );
  });

  it('publishes only a loopback viewer and never mounts Host or Computer resources', () => {
    const args = containerBrowserArgs('abc');
    expect(args.at(-1)).toBe(CONTAINER_BROWSER_IMAGE);
    expect(CONTAINER_BROWSER_IMAGE).toMatch(/@sha256:[a-f0-9]{64}$/u);
    expect(args.filter((arg) => arg.includes('type='))).toEqual([
      'type=volume,source=botharness-browser-abc,target=/config',
    ]);
    expect(args[args.indexOf('--publish') + 1]).toBe('127.0.0.1::3000');
    expect(args.join(' ')).not.toMatch(
      /--privileged|docker\.sock|--network host|botharness-computer/u,
    );
    expect(args).toContain('no-new-privileges=true');
    expect(args).toContain('SUBFOLDER=/botharness-browser/viewer/abc/');
    expect(args).toContain('START_DOCKER=false');
  });

  it('adds a loopback-only WebRTC media port when the Host is on a tailnet', () => {
    const args = containerBrowserArgs('abc', { address: '100.101.102.103', port: 45_000 });
    expect(args.filter((_, index) => args[index - 1] === '--publish')).toEqual([
      '127.0.0.1::3000',
      '127.0.0.1::45000/udp',
    ]);
    expect(args).toContain('SELKIES_WEBRTC_PUBLIC_IP=100.101.102.103');
    expect(args).toContain('SELKIES_WEBRTC_UDP_MUX_PORT=45000');
    expect(args).toContain('SELKIES_MODE=websockets');
    expect(containerBrowserArgs('abc').join(' ')).not.toContain('SELKIES_MODE');
  });

  it('refuses an existing foreign container without stopping or deleting it', async () => {
    const run = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'info') return '29';
      if (args[0] === 'ps') return 'occupied';
      if (args[0] === 'inspect') return 'another-owner';
      throw new Error('unexpected mutation');
    });
    const execution = createContainerBrowserExecution({
      profileDirectory: '/qa/profile/browser',
      run,
    });
    await expect(execution.start()).rejects.toThrow('belongs to another owner');
    expect(run.mock.calls.every(([args]) => ['info', 'ps', 'inspect'].includes(args[0]!))).toBe(
      true,
    );
    expect(execution.isRunning()).toBe(false);
  });

  it('rejects a foreign persistent volume before launching any browser', async () => {
    const run = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'info') return '29';
      if (args[0] === 'ps') return '';
      if (args[0] === 'volume' && args[1] === 'create') return 'existing';
      if (args[0] === 'volume' && args[1] === 'inspect') return 'foreign';
      throw new Error('unexpected mutation');
    });
    const execution = createContainerBrowserExecution({
      profileDirectory: '/qa/profile/browser',
      run,
    });
    await expect(execution.start()).rejects.toThrow('volume belongs to another owner');
    expect(run.mock.calls.some(([args]) => args[0] === 'run')).toBe(false);
  });

  it('reports missing Docker explicitly without publishing a viewer or claiming running', async () => {
    const execution = createContainerBrowserExecution({
      profileDirectory: '/qa/profile/browser',
      run: async () => {
        throw new Error('Docker unavailable');
      },
    });
    await expect(execution.start()).rejects.toThrow(
      'Container Bot Browser startup failed: Docker unavailable',
    );
    expect(execution.isRunning()).toBe(false);
    expect(execution.viewerUrl()).toBeUndefined();
    await expect(execution.prepareUpload('/qa/file')).rejects.toThrow('not running');
  });
});
