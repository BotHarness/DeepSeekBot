import { createHash } from 'node:crypto';
import {
  mkdirSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  rmSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  configureDesktopZoom,
  configureDesktopZoomAfterQuit,
  relaunchDesktopApp,
  runDesktopZoomSetup,
} from '../../packages/deepseekbot/src/desktop-zoom-setup.mjs';
import { DESKTOP_ZOOM_THEMES } from '../../packages/core/src/window-zoom/theme-paths.mjs';
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(profile = 'qa', entry = 'deepseekbot') {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'zoom-setup-')));
  roots.push(home);
  const directory = join(home, 'profiles', profile);
  const root = join(directory, 'node_modules', entry);
  mkdirSync(join(root, 'desktop-theme/lib'), { recursive: true });
  const path = join(directory, 'package.json');
  const manifest = {
    private: true,
    dependencies: { [entry]: 'file:product.tgz' },
    dsh: { profile: { bundles: [entry] } },
  };
  writeFileSync(path, JSON.stringify(manifest));
  writeFileSync(join(directory, 'cordis.patch.yml'), 'native preference unchanged');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: entry, dsh: { bundle: { patch: 'cordis.im.patch.yml' } } }),
  );
  writeFileSync(join(root, 'cordis.im.patch.yml'), '[]');
  for (const [sourceVersion, themePath] of Object.entries(DESKTOP_ZOOM_THEMES)) {
    mkdirSync(join(root, themePath, 'lib'), { recursive: true });
    writeFileSync(join(root, themePath, 'lib/client.js'), 'qualified');
    writeFileSync(
      join(root, themePath, 'botharness-zoom-compat.json'),
      JSON.stringify({
        sourceVersion,
        adapterVersion: 1,
        platforms: ['macos', 'windows'],
        clientAfter: createHash('sha256').update('qualified').digest('hex'),
      }),
    );
  }
  const run = vi.fn((command, args) => {
    if (args[0] === '--version') return '0.2.1-rc.2\n';
    if (command === '/usr/libexec/PlistBuddy') return '0.2.1-rc.2\n';
    const adding = args.includes('add');
    const doc = JSON.parse(readFileSync(path));
    if (adding)
      doc.dependencies['@deepseek-ai/dsh-client-ui-theme'] = args
        .find((arg) => arg.startsWith('@deepseek-ai/dsh-client-ui-theme@'))
        .slice('@deepseek-ai/dsh-client-ui-theme@'.length);
    else delete doc.dependencies['@deepseek-ai/dsh-client-ui-theme'];
    if (adding) {
      mkdirSync(join(directory, 'node_modules/@deepseek-ai'), { recursive: true });
      const alias = join(directory, 'node_modules/@deepseek-ai/dsh-client-ui-theme');
      rmSync(alias, { force: true });
      symlinkSync(
        join(directory, doc.dependencies['@deepseek-ai/dsh-client-ui-theme'].slice('link:'.length)),
        alias,
        'junction',
      );
    }
    writeFileSync(path, JSON.stringify(doc));
    return '';
  });
  return { home, profile, platform: 'darwin', dsh: '/owned/dsh', run, path, directory };
}
it('enables and removes desktop compatibility at the stable Tobs Bundle path', () => {
  const f = fixture('qa', 'tobs');
  expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(true);
  expect(JSON.parse(readFileSync(f.path)).dependencies['@deepseek-ai/dsh-client-ui-theme']).toBe(
    'link:node_modules/tobs/desktop-theme',
  );
  expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(false);
  expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(true);
  expect(JSON.parse(readFileSync(f.path)).dsh.profile.bundles).toEqual(['tobs']);
});
it('keeps the owned Tobs theme link stable across a pnpm store version change', () => {
  const f = fixture('qa', 'tobs');
  const entry = join(f.directory, 'node_modules/tobs');
  const first = join(f.directory, 'node_modules/.pnpm/tobs@1.5.0/node_modules/tobs');
  const second = join(f.directory, 'node_modules/.pnpm/tobs@1.5.1/node_modules/tobs');
  mkdirSync(join(first, '..'), { recursive: true });
  renameSync(entry, first);
  symlinkSync(first, entry, 'junction');
  expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(true);
  const priorLink = JSON.parse(readFileSync(f.path)).dependencies[
    '@deepseek-ai/dsh-client-ui-theme'
  ];
  cpSync(first, second, { recursive: true });
  rmSync(entry);
  symlinkSync(second, entry, 'junction');
  expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(false);
  expect(JSON.parse(readFileSync(f.path)).dependencies['@deepseek-ai/dsh-client-ui-theme']).toBe(
    priorLink,
  );
  expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(true);
});
it('uses the native package manager to enable and remove only its own Profile alias', () => {
  const f = fixture();
  expect(configureDesktopZoom({ ...f, action: 'enable' })).toMatchObject({
    changed: true,
    restartRequired: true,
    runtimeVerified: false,
  });
  expect(f.run.mock.calls[0][1]).toEqual([
    'plugin',
    '--profile',
    'qa',
    'add',
    '@deepseek-ai/dsh-client-ui-theme@link:node_modules/deepseekbot/desktop-theme',
  ]);
  expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(false);
  expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(true);
  expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(false);
  expect(JSON.parse(readFileSync(f.path))).toEqual({
    private: true,
    dependencies: { deepseekbot: 'file:product.tgz' },
    dsh: { profile: { bundles: ['deepseekbot'] } },
  });
  expect(readFileSync(join(f.directory, 'cordis.patch.yml'), 'utf8')).toBe(
    'native preference unchanged',
  );
});
function desktopFixture(entry = 'deepseekbot') {
  const f = fixture('desktop', entry);
  const desktopApp = join(f.home, 'Harness.app');
  const pnpm = join(
    desktopApp,
    'Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs',
  );
  mkdirSync(join(pnpm, '..'), { recursive: true });
  writeFileSync(pnpm, '');
  return { ...f, desktopApp, pnpm, processes: vi.fn(() => '') };
}
it('installs the Desktop override offline using the selected app package manager without scripts', () => {
  const f = desktopFixture();
  expect(configureDesktopZoom({ ...f, action: 'enable' })).toMatchObject({
    changed: true,
    runtimeVerified: false,
  });
  expect(f.run.mock.calls[1][0]).toBe(process.execPath);
  expect(f.run.mock.calls[1][1]).toEqual([
    f.pnpm,
    'add',
    '@deepseek-ai/dsh-client-ui-theme@link:node_modules/deepseekbot/desktop-theme',
    '--config.ignore-scripts=true',
  ]);
  expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(true);
  expect(f.run.mock.calls.at(-1)[1]).toEqual([
    f.pnpm,
    'remove',
    '@deepseek-ai/dsh-client-ui-theme',
    '--config.ignore-scripts=true',
  ]);
  expect(readFileSync(join(f.directory, 'cordis.patch.yml'), 'utf8')).toBe(
    'native preference unchanged',
  );
});
it('refuses a running Desktop before any package operation and requires an explicit application', () => {
  const f = desktopFixture();
  f.processes.mockReturnValue(
    `/Applications/Harness/Contents/MacOS/Harness --expose-internals /app/dsh-desktop-host/lib/index.js /app ${f.directory}`,
  );
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('desktop-running');
  expect(f.run).toHaveBeenCalledTimes(1);
  expect(() => configureDesktopZoom({ ...f, desktopApp: undefined, action: 'enable' })).toThrow(
    'desktop-app-required',
  );
  expect(f.run).toHaveBeenCalledTimes(1);
});
it('checks Desktop ownership again immediately before changing packages', () => {
  const f = desktopFixture();
  f.processes
    .mockReturnValueOnce('')
    .mockReturnValue(`node /dsh-desktop-host/lib/index.js ${f.directory}`);
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('desktop-running');
  expect(f.run).toHaveBeenCalledTimes(1);
});
it('shares the native profile writer lock and releases it after refusals', () => {
  const f = desktopFixture();
  const lock = join(f.directory, 'package.json.lock');
  writeFileSync(lock, 'other writer');
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('profile-busy');
  expect(readFileSync(lock, 'utf8')).toBe('other writer');
  rmSync(lock);
  f.run.mockImplementationOnce(() => {
    throw Error('inspection-failed');
  });
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('inspection-failed');
  expect(() => readFileSync(lock)).toThrow();
});
it.each(['win32', 'linux'])('refuses enabling on %s before any package operation', (platform) => {
  const f = fixture();
  expect(() => configureDesktopZoom({ ...f, platform, action: 'enable' })).toThrow(
    'platform-unsupported',
  );
  expect(f.run).not.toHaveBeenCalled();
});
it('does not query a CLI version and refuses replacing another theme owner', () => {
  const f = fixture();
  expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(true);
  expect(f.run.mock.calls.some(([, args]) => args.includes('--version'))).toBe(false);
  const manifest = JSON.parse(readFileSync(f.path));
  manifest.dependencies['@deepseek-ai/dsh-client-ui-theme'] = 'file:other.tgz';
  writeFileSync(f.path, JSON.stringify(manifest));
  for (const action of ['enable', 'disable'])
    expect(() => configureDesktopZoom({ ...f, action })).toThrow('theme-conflict');
  expect(f.run).toHaveBeenCalledTimes(1);
});
it('refuses stale grouped product composition and changed client bytes', () => {
  const f = fixture();
  const root = join(f.directory, 'node_modules/deepseekbot');
  writeFileSync(join(root, 'cordis.im.patch.yml'), 'botharness-desktop-theme');
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow(
    'product-upgrade-required',
  );
  writeFileSync(join(root, 'desktop-theme/lib/client.js'), 'changed');
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('theme-unqualified');
});
it('reports uncertain package outcome without retrying or claiming runtime success', () => {
  const f = fixture();
  f.run.mockImplementationOnce(() => {
    throw Error('interrupted');
  });
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('outcome-unconfirmed');
  expect(f.run).toHaveBeenCalledTimes(1);
});
it('requires an explicit target and refuses unknown or repeated flags', () => {
  expect(() => runDesktopZoomSetup(['enable'])).toThrow('explicit-profile-required');
  expect(() => runDesktopZoomSetup(['enable', '--profile', 'qa', '--profile', 'qb'])).toThrow(
    'arguments-invalid',
  );
  expect(() => runDesktopZoomSetup(['enable', '--token', 'secret'])).toThrow('arguments-invalid');
});

function windowsFixture(entry = 'deepseekbot') {
  const f = fixture('desktop', entry);
  const desktopApp = join(f.home, 'Windows Harness');
  const executable = join(desktopApp, 'DeepSeek Harness.exe');
  const pnpm = join(desktopApp, 'resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs');
  mkdirSync(join(pnpm, '..'), { recursive: true });
  writeFileSync(pnpm, '');
  writeFileSync(executable, '');
  const original = f.run.getMockImplementation();
  f.run.mockImplementation((command, args) =>
    command === 'powershell.exe' ? '0.2.1-rc.2\n' : original(command, args),
  );
  return {
    ...f,
    desktopApp,
    executable,
    pnpm,
    platform: 'win32',
    windowsProcesses: vi.fn(() => []),
  };
}

it.each([desktopFixture, windowsFixture])(
  'refuses a mismatched Desktop release before installing a theme alias',
  (makeFixture) => {
    for (const version of ['0.2.2-rc.2', '0.2.1-rc.3', '', 'unknown']) {
      const f = makeFixture();
      const before = readFileSync(f.path, 'utf8');
      f.run.mockReturnValueOnce(version);
      expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow(
        'desktop-zoom-setup-version-unsupported',
      );
      expect(f.run).toHaveBeenCalledTimes(1);
      expect(readFileSync(f.path, 'utf8')).toBe(before);
      expect(() =>
        realpathSync(join(f.directory, 'node_modules/@deepseek-ai/dsh-client-ui-theme')),
      ).toThrow();
    }
  },
);

it.each([desktopFixture, windowsFixture])(
  'refuses re-enabling an old theme after a Desktop upgrade but permits disabling it',
  (makeFixture) => {
    const f = makeFixture();
    configureDesktopZoom({ ...f, action: 'enable' });
    f.run.mockReturnValueOnce('0.2.3-rc.1');
    expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow(
      'desktop-zoom-setup-version-unsupported',
    );
    f.run.mockReturnValueOnce('0.2.3-rc.1');
    expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(true);
    expect(
      JSON.parse(readFileSync(f.path)).dependencies['@deepseek-ai/dsh-client-ui-theme'],
    ).toBeUndefined();
  },
);

it('refuses a Desktop theme without its qualified source version', () => {
  const f = windowsFixture();
  const path = join(
    f.directory,
    'node_modules/deepseekbot/desktop-theme/botharness-zoom-compat.json',
  );
  const provenance = JSON.parse(readFileSync(path, 'utf8'));
  delete provenance.sourceVersion;
  writeFileSync(path, JSON.stringify(provenance));
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow(
    'desktop-zoom-setup-version-unsupported',
  );
  expect(f.run).toHaveBeenCalledTimes(1);
});

it.each([desktopFixture, windowsFixture])(
  'selects, upgrades and rolls back exact owned theme payloads',
  (makeFixture) => {
    for (const entry of ['deepseekbot', 'tobs']) {
      const f = makeFixture(entry);
      const alias = join(f.directory, 'node_modules/@deepseek-ai/dsh-client-ui-theme');
      for (const version of ['0.2.1-rc.2', '0.2.2-rc.1', '0.2.1-rc.2', '0.2.2-rc.1']) {
        f.run.mockReturnValueOnce(version);
        expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(true);
        expect(realpathSync(alias)).toBe(
          realpathSync(join(f.directory, 'node_modules', entry, DESKTOP_ZOOM_THEMES[version])),
        );
        f.run.mockReturnValueOnce(version);
        expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(false);
      }
      f.run.mockReturnValueOnce('0.2.3-rc.1');
      expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(true);
      expect(() => realpathSync(alias)).toThrow();
      expect(
        JSON.parse(readFileSync(f.path)).dependencies['@deepseek-ai/dsh-client-ui-theme'],
      ).toBeUndefined();
    }
  },
);

it('preserves an old alias when the replacement theme is unqualified', () => {
  const f = windowsFixture();
  configureDesktopZoom({ ...f, action: 'enable' });
  const before = readFileSync(f.path, 'utf8');
  const alias = join(f.directory, 'node_modules/@deepseek-ai/dsh-client-ui-theme');
  const original = realpathSync(alias);
  writeFileSync(
    join(f.directory, 'node_modules/deepseekbot/desktop-theme-0.2.2-rc.1/lib/client.js'),
    'changed',
  );
  f.run.mockReturnValueOnce('0.2.2-rc.1');
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('theme-unqualified');
  expect(readFileSync(f.path, 'utf8')).toBe(before);
  expect(realpathSync(alias)).toBe(original);
});

it('installs and disables on Windows using FileVersion and the exact app bundled pnpm', () => {
  const f = windowsFixture();
  expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(true);
  expect(f.run.mock.calls[0][0]).toBe('powershell.exe');
  const script = Buffer.from(f.run.mock.calls[0][1].at(-1), 'base64').toString('utf16le');
  expect(script).toContain('VersionInfo.FileVersion');
  expect(script).toContain('-LiteralPath');
  expect(f.run.mock.calls[1][1]).toEqual([
    f.pnpm,
    'add',
    '@deepseek-ai/dsh-client-ui-theme@link:node_modules/deepseekbot/desktop-theme',
    '--config.ignore-scripts=true',
  ]);
  expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(true);
  expect(readFileSync(join(f.directory, 'cordis.patch.yml'), 'utf8')).toBe(
    'native preference unchanged',
  );
});

it('refuses live Windows parent and Host processes including slash and case differences', () => {
  for (const action of ['enable', 'disable']) {
    const f = windowsFixture();
    for (const row of [
      { ExecutablePath: f.executable.toUpperCase().replaceAll('/', '\\') },
      {
        CommandLine: `node D:\\App\\dsh-desktop-host\\lib\\index.js "${f.directory.toUpperCase().replaceAll('/', '\\')}"`,
      },
    ]) {
      f.windowsProcesses.mockReturnValue([row]);
      expect(() => configureDesktopZoom({ ...f, action })).toThrow('desktop-running');
    }
    expect(f.run.mock.calls.every(([command]) => command === 'powershell.exe')).toBe(true);
  }
});

it('preserves a foreign writer that replaced the lock during a Windows transaction', () => {
  const f = windowsFixture();
  const lock = join(f.directory, 'package.json.lock');
  f.run.mockImplementationOnce(() => {
    rmSync(lock);
    writeFileSync(lock, 'other writer');
    throw Error('inspection-failed');
  });
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('inspection-failed');
  expect(readFileSync(lock, 'utf8')).toBe('other writer');
});

it('refuses a Windows process query failure without attempting package changes', () => {
  const f = windowsFixture();
  f.windowsProcesses.mockImplementation(() => {
    throw Error('access denied');
  });
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('access denied');
  expect(f.run).toHaveBeenCalledTimes(1);
});

it('refuses a macOS-only payload on Windows before adding its Profile alias', () => {
  const f = windowsFixture();
  const path = join(
    f.directory,
    'node_modules/deepseekbot/desktop-theme/botharness-zoom-compat.json',
  );
  const provenance = JSON.parse(readFileSync(path, 'utf8'));
  provenance.platforms = ['macos'];
  writeFileSync(path, JSON.stringify(provenance));
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('theme-unqualified');
  expect(f.run).toHaveBeenCalledTimes(1);
});
function afterQuitState(status = 'waiting') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'zoom-after-quit-')));
  roots.push(root);
  const state = join(root, 'window-zoom-setup.json');
  writeFileSync(state, JSON.stringify({ version: 1, id: 'r1', action: 'enable', status }));
  return state;
}
it('waits for the Desktop to quit, records the outcome and reopens the app', async () => {
  const state = afterQuitState();
  const refusal = Object.assign(Error('running'), { code: 'desktop-zoom-setup-desktop-running' });
  const configure = vi
    .fn()
    .mockImplementationOnce(() => {
      throw refusal;
    })
    .mockReturnValueOnce({ changed: true });
  const relaunch = vi.fn();
  const sleep = vi.fn(async () => {});
  expect(
    await configureDesktopZoomAfterQuit({
      action: 'enable',
      home: '/home',
      profile: 'desktop',
      desktopApp: '/Applications/DeepSeek Harness.app',
      platform: 'darwin',
      state,
      id: 'r1',
      configure,
      relaunch,
      sleep,
    }),
  ).toEqual({ status: 'done', changed: true });
  expect(configure).toHaveBeenCalledTimes(2);
  expect(configure.mock.calls[0][0]).toMatchObject({ action: 'enable', profile: 'desktop' });
  expect(sleep).toHaveBeenCalledTimes(1);
  expect(JSON.parse(readFileSync(state, 'utf8'))).toMatchObject({ id: 'r1', status: 'done' });
  expect(relaunch).toHaveBeenCalledWith('/Applications/DeepSeek Harness.app', 'darwin');
});
it('stops without touching the Profile once the request is cancelled or replaced', async () => {
  const configure = vi.fn();
  const relaunch = vi.fn();
  const base = { action: 'enable', id: 'r1', configure, relaunch };
  expect(
    await configureDesktopZoomAfterQuit({ ...base, state: afterQuitState('cancelled') }),
  ).toEqual({ status: 'superseded' });
  const state = afterQuitState();
  writeFileSync(state, JSON.stringify({ version: 1, id: 'r2', status: 'waiting' }));
  expect(await configureDesktopZoomAfterQuit({ ...base, state })).toEqual({
    status: 'superseded',
  });
  expect(configure).not.toHaveBeenCalled();
  expect(relaunch).not.toHaveBeenCalled();
});
it('gives up without reopening when the Desktop never quits', async () => {
  const state = afterQuitState();
  let time = 0;
  const configure = vi.fn(() => {
    throw Object.assign(Error('running'), { code: 'desktop-zoom-setup-desktop-running' });
  });
  const relaunch = vi.fn();
  expect(
    await configureDesktopZoomAfterQuit({
      action: 'enable',
      state,
      id: 'r1',
      configure,
      relaunch,
      timeoutMs: 3000,
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    }),
  ).toEqual({ status: 'failed', code: 'desktop-zoom-setup-wait-expired' });
  expect(relaunch).not.toHaveBeenCalled();
  expect(JSON.parse(readFileSync(state, 'utf8'))).toMatchObject({
    status: 'failed',
    code: 'desktop-zoom-setup-wait-expired',
  });
});
it('requires a request id with the after-quit state file', () => {
  expect(() =>
    runDesktopZoomSetup(['enable', '--profile', 'desktop', '--after-quit', '/tmp/state.json']),
  ).toThrow('arguments-invalid');
});
it('reopens the Windows executable rather than its folder', () => {
  const unref = vi.fn();
  const launch = vi.fn(() => ({ unref }));
  relaunchDesktopApp('C:/Apps/DSH', 'win32', launch, () => true);
  expect(launch.mock.calls[0][0]).toBe('explorer.exe');
  expect(launch.mock.calls[0][1][0].replaceAll('\\', '/')).toBe('C:/Apps/DSH/DeepSeek Harness.exe');
  relaunchDesktopApp('/Applications/DeepSeek Harness.app', 'darwin', launch, () => true);
  expect(launch.mock.calls[1]).toEqual([
    '/usr/bin/open',
    ['/Applications/DeepSeek Harness.app'],
    expect.objectContaining({ detached: true }),
  ]);
  expect(unref).toHaveBeenCalledTimes(2);
});
