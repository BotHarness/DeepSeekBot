import { describe, expect, it, vi } from 'vitest';
import { createPluginUpdateService, isUpdatablePlugin } from '../src/release/plugins.js';
import type { ReleaseInstallerResult } from '../src/release/service.js';
import { testReleaseRuntime } from './release-registry-fixture.js';

const NAME = '@botharness/vrm-companion';

function manifest(version: string, range = '>=0.2.0-rc.2 <0.3.0-0') {
  return { name: NAME, version, engines: { dsh: range } };
}

function registry(documents: Record<string, unknown>) {
  return vi.fn(async (input: string | URL | Request) => {
    const value = documents[decodeURIComponent(new URL(String(input)).pathname)];
    return value === undefined ? new Response('', { status: 404 }) : Response.json(value);
  });
}

function documents(latest = '0.2.0', range?: string) {
  return {
    [`/-/package/${NAME}/dist-tags`]: { latest },
    [`/${NAME}/${latest}`]: manifest(latest, range),
  };
}

function service(
  options: {
    docs?: Record<string, unknown>;
    version?: string;
    install?: (spec: string) => Promise<ReleaseInstallerResult>;
    restart?: () => void;
  } = {},
) {
  const bundles = [
    { name: 'deepseekbot', installed: true, version: '1.6.0' },
    { name: NAME, installed: true, version: options.version ?? '0.1.0' },
    { name: '@acme/other', installed: true, version: '1.0.0' },
  ];
  const installBundle = vi.fn(
    options.install ?? (async () => ({ application: 'restart-required' })),
  );
  const fetchImpl = registry(options.docs ?? documents());
  const updates = createPluginUpdateService({
    installer: () => ({ listBundles: async () => bundles, installBundle }),
    ...(options.restart === undefined ? {} : { restarter: () => ({ restart: options.restart! }) }),
    runtime: testReleaseRuntime,
    registries: ['https://registry.test'],
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { updates, installBundle, fetchImpl, bundles };
}

describe('plugin updates', () => {
  it('only covers BotHarness plugins other than the DeepSeekBot bundle', () => {
    expect(isUpdatablePlugin(NAME)).toBe(true);
    expect(isUpdatablePlugin('deepseekbot')).toBe(false);
    expect(isUpdatablePlugin('@acme/other')).toBe(false);
    expect(isUpdatablePlugin('@botharness/')).toBe(false);
  });

  it('lists an installed plugin with a compatible newer version', async () => {
    const { updates } = service();
    expect(await updates.list()).toEqual({
      installable: true,
      restartable: false,
      plugins: [
        {
          name: NAME,
          status: 'available',
          current: '0.1.0',
          latest: '0.2.0',
          compatibility: { status: 'compatible', dshVersion: '0.2.1-rc.2' },
        },
      ],
    });
  });

  it('reports current, blocked and unreachable registries without offering an install', async () => {
    expect((await service({ version: '0.2.0' }).updates.list()).plugins[0]).toMatchObject({
      status: 'current',
      latest: '0.2.0',
    });
    expect(
      (await service({ docs: documents('0.2.0', '>=0.9.0') }).updates.list()).plugins[0],
    ).toMatchObject({ status: 'blocked', compatibility: { status: 'incompatible' } });
    expect((await service({ docs: {} }).updates.list()).plugins[0]).toMatchObject({
      status: 'unavailable',
      current: '0.1.0',
    });
    expect((await service({ version: '0.0.0' }).updates.list()).plugins[0]).toMatchObject({
      status: 'development',
    });
  });

  it('caches the registry check until forced', async () => {
    const { updates, fetchImpl } = service();
    await updates.list();
    const calls = fetchImpl.mock.calls.length;
    await updates.list();
    expect(fetchImpl.mock.calls.length).toBe(calls);
    await updates.list(true);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(calls);
  });

  it('installs through the plugin manager and asks for a restart', async () => {
    const restart = vi.fn();
    const { updates, installBundle, bundles } = service({ restart });
    const beforeEffect = vi.fn();
    expect(await updates.install(NAME, '0.2.0', beforeEffect)).toEqual({
      status: 'installed',
      name: NAME,
      current: '0.1.0',
      installed: '0.2.0',
      restartable: true,
      applied: false,
    });
    expect(beforeEffect).toHaveBeenCalledOnce();
    expect(installBundle).toHaveBeenCalledWith(`${NAME}@0.2.0`);
    bundles[1]!.version = '0.2.0';
    expect((await updates.list()).plugins[0]).toEqual({
      name: NAME,
      status: 'restart-required',
      current: '0.1.0',
      installed: '0.2.0',
    });
    expect(await updates.restart()).toEqual({ status: 'restarting', plugins: [NAME] });
    expect(restart).toHaveBeenCalledOnce();
  });

  it('falls back to the registry tarball when the manager refuses an installed name', async () => {
    const { updates, installBundle } = service({
      install: async (spec) =>
        spec.endsWith('.tgz')
          ? { application: 'applied' }
          : { application: 'none', error: { code: 'already-installed' } },
    });
    expect(await updates.install(NAME, '0.2.0')).toMatchObject({
      status: 'installed',
      applied: true,
    });
    expect(installBundle).toHaveBeenLastCalledWith(
      'https://registry.test/@botharness/vrm-companion/-/vrm-companion-0.2.0.tgz',
    );
  });

  it('refuses unknown plugins, older versions and incompatible releases before installing', async () => {
    const { updates, installBundle } = service({ docs: documents('0.2.0', '>=0.9.0') });
    expect(await updates.install('deepseekbot', '2.0.0')).toMatchObject({
      reason: 'unknown-plugin',
    });
    expect(await updates.install('@botharness/missing', '1.0.0')).toMatchObject({
      reason: 'unknown-plugin',
    });
    expect(await updates.install(NAME, '0.1.0')).toMatchObject({ reason: 'invalid-version' });
    expect(await updates.install(NAME, '0.2.0')).toMatchObject({ reason: 'incompatible' });
    expect(installBundle).not.toHaveBeenCalled();
  });

  it('maps a failed install and refuses a restart with nothing pending', async () => {
    const { updates } = service({
      restart: vi.fn(),
      install: async () => ({
        application: 'none',
        packageResult: { kind: 'network', output: 'ECONNRESET', logPath: '/tmp/log' },
      }),
    });
    expect(await updates.install(NAME, '0.2.0')).toEqual({
      status: 'failed',
      name: NAME,
      reason: 'network',
      diagnostic: 'ECONNRESET',
      logPath: '/tmp/log',
    });
    expect(await updates.restart()).toEqual({ status: 'failed', reason: 'not-pending' });
  });

  it('is unavailable without the plugin manager', async () => {
    const updates = createPluginUpdateService({ installer: () => undefined });
    expect(await updates.list()).toEqual({ installable: false, restartable: false, plugins: [] });
    expect(await updates.install(NAME, '0.2.0')).toMatchObject({ reason: 'unavailable' });
    expect(await updates.restart()).toEqual({ status: 'failed', reason: 'unavailable' });
  });
});
