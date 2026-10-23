import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { botCreationTransport } from '../src/host/bot-creation-transport';
import type { HostCarrier } from '../src/host/carrier';
import type { BotCreationOperation } from '../src/host/bot-creation';
import type { ZipImportSource } from '../src/host/zip-import-upload';

const bytes = new Uint8Array(30).fill(4);
const source: ZipImportSource = {
  kind: 'zip',
  uploadKey: 'upload:zip-test',
  fileId: '12345678-1234-1234-1234-123456789abc',
  fileName: 'Bot.zip',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sizeBytes: bytes.length,
};
const operation: BotCreationOperation = {
  hostId: 'B',
  deviceId: 'phone',
  operationKey: 'zip-operation-001',
  source,
  input: { displayName: 'Renamed' },
};
const host = {
  hostId: 'B',
  deviceId: 'phone',
  credential: 'secret',
  hostName: 'Desktop',
  routes: ['https://b.ts.net'],
};
const receipt = {
  operationKey: operation.operationKey,
  botSlug: 'zip-bot',
  status: 'created',
  channelId: 'zip-dm',
};
const answer = (value: unknown) => ({
  status: 200,
  text: async () => JSON.stringify({ type: 'server-response', result: { ok: true, value } }),
});
const status = (offset: number) => ({
  uploadKey: source.uploadKey,
  sha256: source.sha256,
  sizeBytes: source.sizeBytes,
  offset,
  chunkBytes: 262144,
});
function setup() {
  const request = vi.fn<HostCarrier['request']>();
  const open = vi.fn(async () => ({
    sizeBytes: bytes.length,
    read: async (offset: number, length: number) => bytes.slice(offset, offset + length),
    close() {},
  }));
  const port = botCreationTransport(
    () => [host],
    { request, openSocket: vi.fn() },
    { pick: async () => source, open },
  );
  return { request, open, port };
}

it('previews through the selected Host without sending a creation and extracts archive metadata', async () => {
  const f = setup();
  f.request
    .mockResolvedValueOnce(answer(status(0)))
    .mockResolvedValueOnce(answer(status(30)))
    .mockResolvedValueOnce(
      answer({
        source: { kind: 'archive', sha256: source.sha256 },
        descriptor: { displayName: 'Archive name', roles: ['Helper'] },
        fileCount: 2,
        expandedBytes: 100,
        history: false,
      }),
    );
  expect(await f.port.previewZip!(operation, source, () => {})).toMatchObject({
    source,
    displayName: 'Archive name',
    roles: ['Helper'],
  });
  expect(f.request.mock.calls.map(([url]) => url.split('/').at(-1))).toEqual([
    'zipUploadBegin',
    'zipUploadChunk',
    'zipUploadPreview',
  ]);
});

it('uses a durable receipt even when the source file no longer exists', async () => {
  const f = setup();
  f.request.mockResolvedValueOnce(answer({ receipt }));
  f.open.mockRejectedValue(new Error('missing'));
  expect(await f.port.create(operation)).toEqual(receipt);
  expect(f.open).not.toHaveBeenCalled();
  expect(JSON.parse(String(f.request.mock.calls[0]![1].body)).payload.args).toEqual({
    operationKey: operation.operationKey,
    sha256: source.sha256,
    displayName: 'Renamed',
  });
});

it('restages exact bytes after a receipt miss and sends the saved edited name', async () => {
  const f = setup();
  f.request
    .mockResolvedValueOnce(answer({ receipt: null }))
    .mockResolvedValueOnce(answer(status(0)))
    .mockResolvedValueOnce(answer(status(30)))
    .mockResolvedValueOnce(answer({ receipt }));
  expect(await f.port.create(operation)).toEqual(receipt);
  const calls = f.request.mock.calls;
  expect(calls.map(([url]) => url.split('/').at(-1))).toEqual([
    'zipImportLookup',
    'zipUploadBegin',
    'zipUploadChunk',
    'zipImport',
  ]);
  expect(JSON.parse(String(calls[3]![1].body)).payload.args).toEqual({
    operationKey: operation.operationKey,
    displayName: 'Renamed',
    sha256: source.sha256,
    sizeBytes: 30,
    uploadKey: source.uploadKey,
  });
  expect(
    calls.every(
      ([url, request]) =>
        url.startsWith('https://b.ts.net/') && request.headers?.authorization === 'Device secret',
    ),
  ).toBe(true);
});

it('does not read or upload bytes when an old Host lacks Zip receipt lookup', async () => {
  const f = setup();
  f.request.mockResolvedValue({
    status: 200,
    text: async () =>
      JSON.stringify({
        type: 'server-response',
        result: { ok: false, error: { code: 'METHOD_NOT_FOUND' } },
      }),
  });
  await expect(f.port.create(operation)).rejects.toMatchObject({ code: 'host-update-required' });
  expect(f.open).not.toHaveBeenCalled();
});
