import { expect, it, vi } from 'vitest';
import {
  BotCreationFailure,
  createBotCreationController,
  type BotCreationOperation,
  type CreationRecord,
} from '../src/host/bot-creation';
import type { ZipImportSource } from '../src/host/zip-import-upload';

const file = {
  fileId: '12345678-1234-1234-1234-123456789abc',
  fileName: 'Helper.zip',
  sha256: 'a'.repeat(64),
  sizeBytes: 30,
};
function setup() {
  let disk: CreationRecord | undefined;
  let paired = false;
  let keys = 0;
  const pickZip = vi.fn(async () => file as typeof file | null);
  const previewZip = vi.fn(
    async (
      _target: unknown,
      source: ZipImportSource,
      _onProgress?: (bytes: number, total: number) => void,
    ) => ({
      source,
      displayName: 'From archive',
      description: 'Archive bio',
      roles: ['Helper'],
    }),
  );
  const lookup = vi.fn<
    () => Promise<null | {
      operationKey: string;
      botSlug: string;
      status: 'created';
      channelId: string;
    }>
  >(async () => null);
  const create = vi.fn(async (operation: BotCreationOperation) => ({
    operationKey: operation.operationKey,
    botSlug: 'zip-bot',
    status: 'created' as const,
    channelId: 'zip-dm',
  }));
  const make = () =>
    createBotCreationController({
      key: () => `zip-operation-${++keys}`,
      storage: {
        read: async () => disk,
        write: async (record) => {
          disk = structuredClone(record);
        },
      },
      port: { pickZip, previewZip, lookup, create, deviceId: () => (paired ? 'phone' : undefined) },
    });
  return {
    make,
    pickZip,
    previewZip,
    lookup,
    create,
    disk: () => disk,
    pair: () => {
      paired = true;
    },
  };
}

it('shows upload progress only while the preview is active', async () => {
  const f = setup();
  f.pair();
  const controller = f.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginZip();
  let finish: (() => void) | undefined;
  f.previewZip.mockImplementationOnce(async (_target, source, onProgress) => {
    onProgress?.(source.sizeBytes, source.sizeBytes);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { source, displayName: 'From archive', description: 'Archive bio', roles: ['Helper'] };
  });
  const preview = controller.preview();
  await vi.waitFor(() =>
    expect(controller.getSnapshot().transfer).toEqual({ bytes: 30, total: 30 }),
  );
  expect(controller.getSnapshot().busy).toBe(true);
  finish?.();
  await preview;
  expect(controller.getSnapshot()).toMatchObject({ busy: false, transfer: undefined });
  expect(controller.getSnapshot().record).toMatchObject({ draft: { displayName: 'From archive' } });
});

it('retains a selected Zip without a paired Host, survives restart and preserves it on picker cancellation', async () => {
  const f = setup();
  const controller = f.make();
  await controller.beginZip();
  const saved = f.disk();
  expect(saved).toMatchObject({
    kind: 'draft',
    draft: { hostId: '', source: { kind: 'zip', ...file } },
  });
  const reopened = f.make();
  await reopened.ready;
  expect(reopened.getSnapshot().record).toEqual(saved);
  f.pickZip.mockResolvedValueOnce(null);
  await reopened.beginZip();
  expect(reopened.getSnapshot().record).toEqual(saved);
  await reopened.preview();
  expect(reopened.getSnapshot().error).toBe('target-unpaired');
  expect(f.previewZip).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
});

it('previews metadata before confirmation and preserves a renamed Bot when changing target', async () => {
  const f = setup();
  f.pair();
  const controller = f.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginZip();
  await controller.preview();
  expect(f.create).not.toHaveBeenCalled();
  const record = controller.getSnapshot().record;
  if (record.kind !== 'draft') throw new Error('draft expected');
  expect(record.draft.displayName).toBe('From archive');
  await controller.edit({ ...record.draft, displayName: 'My name', hostId: 'B' });
  await controller.submit();
  expect(controller.getSnapshot().error).toBe('zip-preview-required');
  await controller.preview();
  await controller.submit();
  expect(f.create.mock.calls[0]?.[0]).toMatchObject({
    hostId: 'B',
    input: { displayName: 'My name' },
    source: { kind: 'zip', ...file },
  });
});

it('keeps explicitly cleared metadata after restart, a target change and another preview', async () => {
  const f = setup();
  f.pair();
  const controller = f.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginZip();
  await controller.preview();
  const initial = controller.getSnapshot().record;
  if (initial.kind !== 'draft') throw new Error('draft expected');
  expect(initial.draft).toMatchObject({ description: 'Archive bio', tags: 'Helper' });
  await controller.edit({ ...initial.draft, displayName: 'My name', description: '', tags: '' });
  const reopened = f.make();
  await reopened.ready;
  const saved = reopened.getSnapshot().record;
  if (saved.kind !== 'draft') throw new Error('draft expected');
  await reopened.edit({ ...saved.draft, hostId: 'B' });
  await reopened.preview();
  expect(reopened.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: { hostId: 'B', displayName: 'My name', description: '', tags: '' },
  });
  await reopened.submit();
  expect(f.create.mock.calls[0]?.[0].input).toEqual({ displayName: 'My name' });
});

it('reports local file failures without a connection error or a Host request', async () => {
  const f = setup();
  f.pickZip.mockRejectedValueOnce(new BotCreationFailure('zip-file-read'));
  const controller = f.make();
  await controller.beginZip();
  expect(controller.getSnapshot().error).toBe('zip-file-read');
  expect(f.previewZip).not.toHaveBeenCalled();
  expect(f.lookup).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
});

it('recovers the same immutable Zip operation after a lost response without picking a new file', async () => {
  const f = setup();
  f.pair();
  const controller = f.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginZip();
  await controller.preview();
  f.create.mockRejectedValueOnce(new BotCreationFailure('unreachable'));
  await controller.submit();
  const operation = f.create.mock.calls[0]?.[0];
  const reopened = f.make();
  await reopened.resume();
  expect(f.create.mock.calls[1]?.[0]).toEqual(operation);
  expect(f.pickZip).toHaveBeenCalledOnce();
  expect(f.previewZip).toHaveBeenCalledOnce();
  expect(reopened.getSnapshot().receipt).toMatchObject({ botSlug: 'zip-bot', channelId: 'zip-dm' });
});

it('looks up a committed import before requiring the local file or starting another upload', async () => {
  const f = setup();
  f.pair();
  const controller = f.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginZip();
  await controller.preview();
  f.create.mockRejectedValueOnce(new BotCreationFailure('unreachable'));
  await controller.submit();
  const operation = f.create.mock.calls[0]![0];
  f.lookup.mockResolvedValue({
    operationKey: operation.operationKey,
    botSlug: 'zip-bot',
    status: 'created',
    channelId: 'zip-dm',
  });
  f.create.mockRejectedValue(new BotCreationFailure('zip-file-missing'));
  const reopened = f.make();
  await reopened.resume();
  expect(f.create).toHaveBeenCalledOnce();
  expect(reopened.getSnapshot().receipt?.status).toBe('created');
});

it('an unresolved Zip operation cannot be replaced by a different file or Git source', async () => {
  const f = setup();
  f.pair();
  const controller = f.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginZip();
  await controller.preview();
  f.create.mockRejectedValue(new BotCreationFailure('zip-file-missing'));
  await controller.submit();
  const saved = f.disk();
  await controller.beginZip();
  await controller.beginImport({ gitUrl: 'https://example.com/bot.git' });
  await controller.enter({ kind: 'host', hostId: 'B' });
  expect(f.disk()).toEqual(saved);
  expect(f.pickZip).toHaveBeenCalledOnce();
});

it('restores only the exact original file while retaining the submitted key and target', async () => {
  const f = setup();
  f.pair();
  const controller = f.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginZip();
  await controller.preview();
  f.create.mockRejectedValue(new BotCreationFailure('zip-file-missing'));
  await controller.submit();
  const before = f.disk();
  f.pickZip.mockResolvedValueOnce({ ...file, sha256: 'b'.repeat(64) });
  await controller.restoreZip();
  expect(f.disk()).toEqual(before);
  f.pickZip.mockResolvedValueOnce({ ...file, fileId: '87654321-1234-1234-1234-123456789abc' });
  await controller.restoreZip();
  const after = f.disk();
  if (before?.kind !== 'submitted' || after?.kind !== 'submitted')
    throw new Error('submitted expected');
  expect(after.operation).toEqual({
    ...before.operation,
    source: { ...before.operation.source, fileId: '87654321-1234-1234-1234-123456789abc' },
  });
});
