import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { createReleaseService } from '../src/release/service.js';

const require = createRequire(
  realpathSync(new URL('../../../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)),
);
const native = await import(require.resolve('@deepseek-ai/dsh-app-boot'));
const names = ['@botharness/core', '@botharness/ui', '@botharness/browser', '@botharness/computer'];
function manifest(name: string, version: string, range = '>=0.2.0-rc.2 <0.3.0-0') {
  return {
    name,
    version,
    engines: { dsh: range },
    ...(name === 'deepseekbot'
      ? { dependencies: Object.fromEntries(names.map((name) => [name, version])) }
      : {}),
  };
}
function fixture() {
  const documents: Record<string, unknown> = {
    '/-/package/deepseekbot/dist-tags': { latest: '1.4.0' },
    '/deepseekbot': {
      versions: {
        '1.3.2': manifest('deepseekbot', '1.3.2'),
        '1.4.0': manifest('deepseekbot', '1.4.0', '>=0.2.2'),
      },
    },
  };
  for (const version of ['1.3.2', '1.4.0'])
    for (const name of ['deepseekbot', ...names])
      documents[`/${name}/${version}`] = manifest(
        name,
        version,
        version === '1.4.0' ? '>=0.2.2' : undefined,
      );
  return documents;
}
function service(
  documents: Record<string, unknown>,
  options: Partial<Parameters<typeof createReleaseService>[0]> = {},
) {
  return createReleaseService({
    version: () => '1.3.1',
    ledgers: () => undefined,
    runtime: async () => ({ version: '0.2.1-rc.2', evaluate: native.evaluatePluginCompatibility }),
    registries: ['https://registry.test'],
    noteSources: [],
    fetchImpl: async (input) => {
      const value = documents[decodeURIComponent(new URL(String(input)).pathname)];
      return value === undefined ? new Response('', { status: 404 }) : Response.json(value);
    },
    ...options,
  });
}
describe('compatible release discovery', () => {
  it('offers the newest compatible release when latest requires a newer DSH', async () => {
    expect(await service(fixture()).update()).toMatchObject({
      status: 'available',
      current: '1.3.1',
      latest: '1.3.2',
      compatibility: { status: 'compatible', dshVersion: '0.2.1-rc.2' },
      blockedLatest: { version: '1.4.0', compatibility: { status: 'incompatible' } },
    });
  });
});

it('requires current metadata again before invoking the installer or approval side effect', async () => {
  const documents = fixture();
  const installBundle = vi.fn(async () => ({ application: 'restart-required' }));
  const beforeEffect = vi.fn();
  const release = service(documents, {
    installer: () => ({
      listBundles: async () => [{ name: 'deepseekbot', installed: true }],
      installBundle,
    }),
  });
  expect((await release.update()).status).toBe('available');
  documents['/@botharness/core/1.3.2'] = manifest('@botharness/core', '1.3.2', '>=0.2.2');
  expect(await release.install('1.3.2', beforeEffect)).toEqual({
    status: 'failed',
    reason: 'incompatible',
  });
  expect(beforeEffect).not.toHaveBeenCalled();
  expect(installBundle).not.toHaveBeenCalled();
});
it('force bypasses a cached outage and stable users do not follow preview tags', async () => {
  const documents: Record<string, unknown> = {};
  const release = service(documents);
  expect((await release.update()).status).toBe('unavailable');
  Object.assign(documents, fixture());
  documents['/-/package/deepseekbot/dist-tags'] = { latest: '1.3.2', next: '2.0.0-beta.1' };
  expect((await release.update()).status).toBe('unavailable');
  expect(await release.update(true)).toMatchObject({ status: 'available', latest: '1.3.2' });
});
it.each(['0.2.0-rc.2', '0.2.1-rc.2'])(
  'uses native engine precedence and prerelease semantics on %s',
  async (version) => {
    const documents = fixture();
    documents['/-/package/deepseekbot/dist-tags'] = { latest: '1.3.2' };
    documents['/deepseekbot/1.3.2'] = {
      ...manifest('deepseekbot', '1.3.2'),
      peerDependencies: { '@deepseek-ai/dsh': '0.1.0' },
    };
    expect(
      await service(documents, {
        runtime: async () => ({ version, evaluate: native.evaluatePluginCompatibility }),
      }).update(),
    ).toMatchObject({
      status: 'available',
      compatibility: { status: 'compatible', dshVersion: version },
    });
  },
);
it('does not report missing metadata or unknown runtime as compatible', async () => {
  const documents = fixture();
  delete documents['/deepseekbot/1.4.0'];
  expect(await service(documents).update()).toMatchObject({
    status: 'blocked',
    compatibility: { status: 'unknown', reason: 'metadata-unavailable' },
  });
  expect(await service(fixture(), { runtime: async () => undefined }).update()).toMatchObject({
    status: 'blocked',
    compatibility: { status: 'unknown', reason: 'runtime-unavailable' },
  });
});

it('searches past twenty incompatible releases', async () => {
  const documents = fixture();
  const versions: Record<string, unknown> = {};
  for (let patch = 2; patch <= 25; patch++) {
    const version = `1.3.${patch}`;
    versions[version] = manifest('deepseekbot', version);
    for (const name of ['deepseekbot', ...names])
      documents[`/${name}/${version}`] = manifest(
        name,
        version,
        patch === 2 ? undefined : '>=0.2.2',
      );
  }
  documents['/deepseekbot'] = { versions };
  expect(await service(documents).update()).toMatchObject({ status: 'available', latest: '1.3.2' });
});
it.each(['packument', 'candidate'])(
  'retries incomplete %s discovery after the failure TTL',
  async (failure) => {
    const documents = fixture();
    const path = failure === 'packument' ? '/deepseekbot' : '/deepseekbot/1.3.2';
    const saved = documents[path];
    delete documents[path];
    let now = 0;
    const release = service(documents, { now: () => now });
    expect(await release.update()).toMatchObject({
      status: 'blocked',
      compatibility: { status: 'unknown' },
    });
    documents[path] = saved;
    now = 5 * 60_000 + 1;
    expect(await release.update()).toMatchObject({ status: 'available', latest: '1.3.2' });
  },
);
