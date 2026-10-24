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
  runDesktopZoomSetup,
} from '../../packages/deepseekbot/src/desktop-zoom-setup.mjs';
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
  writeFileSync(join(root, 'desktop-theme/lib/client.js'), 'qualified');
  writeFileSync(
    join(root, 'desktop-theme/botharness-zoom-compat.json'),
    JSON.stringify({
      sourceVersion: '0.2.1-rc.2',
      platforms: ['macos', 'windows'],
      clientAfter: createHash('sha256').update('qualified').digest('hex'),
    }),
  );
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
      symlinkSync(
        root + '/desktop-theme',
        join(directory, 'node_modules/@deepseek-ai/dsh-client-ui-theme'),
        'dir',
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
  expect(f.run.mock.calls[1][1]).toEqual([
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
function desktopFixture() {
  const f = fixture('desktop');
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
  f.run.mockImplementationOnce(() => '0.2.2');
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('version-unsupported');
  expect(() => readFileSync(lock)).toThrow();
});
it.each(['win32', 'linux'])('refuses enabling on %s before any package operation', (platform) => {
  const f = fixture();
  expect(() => configureDesktopZoom({ ...f, platform, action: 'enable' })).toThrow(
    'platform-unsupported',
  );
  expect(f.run).not.toHaveBeenCalled();
});
it('refuses unknown Host releases and other owners instead of replacing them', () => {
  const f = fixture();
  f.run.mockImplementationOnce(() => '0.2.0-rc.2');
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('version-unsupported');
  expect(f.run).toHaveBeenCalledTimes(1);
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
  f.run.mockImplementationOnce(() => '0.2.1-rc.2');
  f.run.mockImplementationOnce(() => {
    throw Error('interrupted');
  });
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('outcome-unconfirmed');
  expect(f.run).toHaveBeenCalledTimes(2);
});
it('requires an explicit target and refuses unknown or repeated flags', () => {
  expect(() => runDesktopZoomSetup(['enable'])).toThrow('explicit-profile-required');
  expect(() => runDesktopZoomSetup(['enable', '--profile', 'qa', '--profile', 'qb'])).toThrow(
    'arguments-invalid',
  );
  expect(() => runDesktopZoomSetup(['enable', '--token', 'secret'])).toThrow('arguments-invalid');
});

function windowsFixture() {
  const f = fixture('desktop');
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
    return '0.2.2';
  });
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('version-unsupported');
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
