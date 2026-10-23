import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { registerBridge } from '../src/bridge/rpc.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { writeZip } from '../src/bots/zip-archive.js';
import { BOT_ZIP_UPLOAD_TTL_MS } from '../src/bots/zip-upload.js';
import { createTempRoot } from './helpers.js';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
function fixture(home = createTempRoot('zip-import-receipt-')) {
  const core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected model execution');
      },
    },
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  closes.push(close);
  return { core, home, close, bridge: createBridgeMethods(core) };
}

it('previews and imports uploaded Zip once, retaining its receipt after staging expiry and Host restart', async () => {
  const archive = writeZip([
    { path: 'SOUL.md', data: Buffer.from('A portable personality.') },
    {
      path: '.botharness/bot.json',
      data: Buffer.from(
        JSON.stringify({ name: 'Archive name', bio: 'Portable', tags: ['research'] }),
      ),
    },
  ]);
  const input = {
    uploadKey: 'zip-upload-001',
    sha256: createHash('sha256').update(archive).digest('hex'),
    sizeBytes: archive.length,
  };
  const request = {
    ...input,
    operationKey: 'zip-operation-001',
    displayName: 'Renamed Bot',
    roles: ['chosen'],
    description: 'Confirmed',
  };
  const f = fixture();
  expect(f.bridge.zipImportLookup(request)).toEqual({ ok: true, value: { receipt: null } });
  expect(f.bridge.zipUploadBegin(input)).toMatchObject({ ok: true, value: { offset: 0 } });
  expect(
    f.bridge.zipUploadChunk({ ...input, offset: 0, dataBase64: archive.toString('base64') }),
  ).toMatchObject({ ok: true, value: { offset: archive.length } });
  expect(f.bridge.zipUploadPreview(input)).toMatchObject({
    ok: true,
    value: {
      descriptor: { displayName: 'Archive name', description: 'Portable', roles: ['research'] },
      fileCount: 2,
    },
  });
  expect(f.core.registry.list()).toHaveLength(0);
  const created = await f.bridge.zipImport(request);
  expect(created).toMatchObject({
    ok: true,
    value: {
      bot: { displayName: 'Renamed Bot', roles: ['chosen'], description: 'Confirmed' },
      receipt: { status: 'created' },
    },
  });
  if (!created.ok) throw new Error(created.error.code);
  await f.close();
  const time = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(time + BOT_ZIP_UPLOAD_TTL_MS + 1);
  const restarted = fixture(f.home);
  expect(restarted.bridge.zipUploadPreview(input)).toMatchObject({
    ok: false,
    error: { code: 'upload-expired' },
  });
  expect(restarted.bridge.zipImportLookup(request)).toEqual({
    ok: true,
    value: { receipt: created.value.receipt },
  });
  expect(await restarted.bridge.zipImport(request)).toEqual(created);
  expect(restarted.core.registry.list()).toHaveLength(1);
  expect(restarted.core.channels.list()).toHaveLength(1);
  expect(restarted.bridge.zipImportLookup({ ...request, displayName: 'Different' })).toMatchObject({
    ok: false,
    error: { code: 'creation-key-conflict' },
  });
  expect(restarted.core.grants.list(created.value.bot.slug)).toEqual([]);
});

it('exposes bounded Zip operations through Typert and refuses unsafe archives before creating a Bot', async () => {
  const f = fixture();
  const service = registerBridge(new Context(), f.bridge);
  const archive = writeZip([{ path: '../outside', data: Buffer.from('unsafe') }]);
  const sha = createHash('sha256').update(archive).digest('hex');
  expect(service.zipUploadBegin('unsafe-upload-01', sha, archive.length).offset).toBe(0);
  service.zipUploadChunk('unsafe-upload-01', sha, archive.length, 0, archive.toString('base64'));
  expect(() => service.zipUploadPreview('unsafe-upload-01', sha, archive.length)).toThrow(
    expect.objectContaining({ code: 'unsafe-path' }),
  );
  expect(service.zipImportLookup('unsafe-operation-01', sha, 'Unsafe')).toEqual({ receipt: null });
  await expect(
    service.zipImport('unsafe-operation-01', 'unsafe-upload-01', sha, archive.length, 'Unsafe'),
  ).rejects.toThrow(expect.objectContaining({ code: 'unsafe-path' }));
  expect(f.core.registry.list()).toHaveLength(0);
  expect(f.core.channels.list()).toHaveLength(0);
});
