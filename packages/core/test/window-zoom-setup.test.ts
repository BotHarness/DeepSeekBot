import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWindowZoomSetup, desktopAppFor } from '../src/window-zoom/setup.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(link?: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'zoom-host-setup-')));
  roots.push(root);
  const home = join(root, 'home');
  const profile = join(home, 'profiles/desktop');
  mkdirSync(join(profile, 'node_modules/deepseekbot/dist'), { recursive: true });
  writeFileSync(join(profile, 'node_modules/deepseekbot/dist/desktop-zoom-setup.mjs'), '');
  writeFileSync(
    join(profile, 'package.json'),
    JSON.stringify({
      dependencies: link ? { '@deepseek-ai/dsh-client-ui-theme': link } : {},
      dsh: { profile: { bundles: ['deepseekbot'] } },
    }),
  );
  const app = join(root, 'DeepSeek Harness.app');
  const pnpm = join(app, 'Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin');
  mkdirSync(pnpm, { recursive: true });
  writeFileSync(join(pnpm, 'pnpm.mjs'), '');
  const execPath = join(app, 'Contents/Resources/runtime/primary-runtime/bin/node');
  const spawn = vi.fn((_command: string, _args: readonly string[], _options: object) => ({
    pid: 4242,
    unref: vi.fn(),
  }));
  const alive = vi.fn(() => true);
  const setup = createWindowZoomSetup({
    dshHome: home,
    profileDir: profile,
    platform: 'darwin',
    execPath,
    argv: [execPath, join(app, 'Contents/Resources/dsh-desktop-host/index.js')],
    env: {},
    spawn,
    alive,
  });
  return { home, profile, app, execPath, spawn, alive, setup };
}
const post = (body: unknown) =>
  new Request('http://host/api/botharness/window-zoom-setup', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('Desktop window zoom setup after quit', () => {
  it('schedules the same setup command for after the Desktop quits', async () => {
    const { home, profile, app, execPath, spawn, setup } = fixture();
    expect(await (await setup.fetch(new Request('http://host/x'))).json()).toEqual({
      supported: true,
      enabled: false,
    });
    const response = await setup.fetch(post({ action: 'enable' }));
    expect(await response.json()).toMatchObject({
      supported: true,
      enabled: false,
      pending: { action: 'enable' },
    });
    const state = JSON.parse(readFileSync(join(home, 'botharness/window-zoom-setup.json'), 'utf8'));
    expect(state).toMatchObject({ status: 'waiting', action: 'enable', pid: 4242 });
    const [command, args, options] = spawn.mock.calls[0]!;
    expect(command).toBe(execPath);
    expect(args).toEqual([
      join(profile, 'node_modules/deepseekbot/dist/desktop-zoom-setup.mjs'),
      'enable',
      '--home',
      home,
      '--profile',
      'desktop',
      '--desktop-app',
      app,
      '--after-quit',
      join(home, 'botharness/window-zoom-setup.json'),
      '--request',
      state.id,
    ]);
    expect(options).toMatchObject({ detached: true, env: { ELECTRON_RUN_AS_NODE: '1' } });

    expect(await (await setup.fetch(post({ action: 'cancel' }))).json()).toEqual({
      supported: true,
      enabled: false,
    });
    expect(
      JSON.parse(readFileSync(join(home, 'botharness/window-zoom-setup.json'), 'utf8')),
    ).toMatchObject({ id: state.id, status: 'cancelled' });
  });

  it('offers disable once the Profile link is installed and refuses repeats', async () => {
    const { setup, spawn } = fixture('link:node_modules/deepseekbot/desktop-theme');
    expect(setup.status()).toEqual({ supported: true, enabled: true });
    const refused = await setup.fetch(post({ action: 'enable' }));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: { code: 'zoom-setup-already-enabled' } });
    await setup.fetch(post({ action: 'disable' }));
    expect(spawn.mock.calls[0]![1][1]).toBe('disable');
  });

  it('reports a helper that exited without an outcome as failed', async () => {
    const { setup, alive } = fixture();
    await setup.fetch(post({ action: 'enable' }));
    alive.mockReturnValue(false);
    expect(setup.status()).toEqual({
      supported: true,
      enabled: false,
      last: {
        action: 'enable',
        status: 'failed',
        code: 'zoom-setup-helper-exited',
        finishedAt: expect.any(String),
      },
    });
  });

  it('is unavailable outside the native Desktop Profile', async () => {
    const { home, execPath } = fixture();
    const web = createWindowZoomSetup({
      dshHome: home,
      profileDir: join(home, 'profiles/desktop'),
      platform: 'linux',
      execPath,
    });
    expect(web.status()).toEqual({ supported: false, code: 'zoom-setup-platform-unsupported' });
    mkdirSync(join(home, 'profiles/web'), { recursive: true });
    const other = createWindowZoomSetup({
      dshHome: home,
      profileDir: join(home, 'profiles/web'),
      platform: 'darwin',
      execPath,
    });
    expect(other.status()).toEqual({ supported: false, code: 'zoom-setup-not-desktop' });
    const elsewhere = createWindowZoomSetup({
      dshHome: home,
      profileDir: join(home, 'profiles/desktop'),
      platform: 'darwin',
      execPath: '/usr/local/bin/node',
      argv: ['/usr/local/bin/node', '/tmp/dsh.js'],
    });
    expect(elsewhere.status()).toEqual({
      supported: false,
      code: 'zoom-setup-desktop-app-unresolved',
    });
  });

  it('finds the Windows app directory beside its resources folder', () => {
    const exists = (path: string) =>
      [
        'C:/Apps/DSH/resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs',
        'C:/Apps/DSH/DeepSeek Harness.exe',
      ].includes(path.replaceAll('\\', '/'));
    expect(
      desktopAppFor('win32', ['C:\\Apps\\DSH\\resources\\app\\dsh-desktop-host\\index.js'], exists),
    ).toBe('C:\\Apps\\DSH');
  });
});
