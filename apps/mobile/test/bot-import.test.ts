import { expect, it, vi } from 'vitest';
import {
  BotCreationFailure,
  createBotCreationController,
  type BotCreationOperation,
  type CreationRecord,
} from '../src/host/bot-creation';

function setup() {
  let disk: CreationRecord | undefined;
  let device = 'phone-a';
  const preview = vi.fn(async () => ({
    kind: 'git' as const,
    gitUrl: 'https://github.com/a/b.git',
    commit: 'a'.repeat(40),
  }));
  const lookup = vi.fn(async () => null);
  const create = vi.fn(async (operation: BotCreationOperation) => ({
    operationKey: operation.operationKey,
    botSlug: 'imported',
    status: 'created' as const,
    channelId: 'dm-imported',
  }));
  let keys = 0;
  const make = () =>
    createBotCreationController({
      key: () => `import-key-${++keys}`,
      storage: {
        read: async () => disk,
        write: async (record) => {
          disk = structuredClone(record);
        },
      },
      port: { deviceId: () => device, preview, lookup, create },
    });
  return {
    make,
    preview,
    lookup,
    create,
    disk: () => disk,
    pair: (value: string) => {
      device = value;
    },
  };
}

it('previews Git without creating, then freezes the chosen revision and edited name across recovery', async () => {
  const test = setup();
  const controller = test.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginImport({ gitUrl: 'https://github.com/a/b', displayName: 'My helper' });
  await controller.submit();
  expect(test.create).not.toHaveBeenCalled();
  expect(controller.getSnapshot().error).toBe('git-preview-required');
  await controller.preview();
  expect(test.create).not.toHaveBeenCalled();
  test.create.mockRejectedValueOnce(new BotCreationFailure('unreachable'));
  await controller.submit();
  const submitted = test.disk();
  expect(submitted).toMatchObject({
    kind: 'submitted',
    operation: {
      hostId: 'A',
      source: { kind: 'git', gitUrl: 'https://github.com/a/b.git', commit: 'a'.repeat(40) },
      input: { displayName: 'My helper' },
    },
  });
  const reopened = test.make();
  await reopened.resume();
  expect(test.create.mock.calls[1]?.[0]).toEqual(test.create.mock.calls[0]?.[0]);
  expect(test.preview).toHaveBeenCalledTimes(1);
  expect(reopened.getSnapshot().receipt).toMatchObject({
    botSlug: 'imported',
    channelId: 'dm-imported',
  });
});

it('retains edits while changing environment and requires a fresh source check for that target', async () => {
  const test = setup();
  const controller = test.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginImport({
    gitUrl: 'https://github.com/a/b',
    displayName: 'Edited name',
    description: 'Bio',
    roles: ['helper'],
  });
  await controller.preview();
  const record = controller.getSnapshot().record;
  if (record.kind !== 'draft') throw new Error('Expected draft');
  await controller.edit({ ...record.draft, hostId: 'B' });
  await controller.submit();
  expect(test.create).not.toHaveBeenCalled();
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: { hostId: 'B', displayName: 'Edited name', description: 'Bio' },
  });
  await controller.preview();
  await controller.submit();
  expect(test.create.mock.calls[0]?.[0]).toMatchObject({
    hostId: 'B',
    input: { displayName: 'Edited name', description: 'Bio', roles: ['helper'] },
  });
});

it('does not replace an unresolved Git operation with another source or target', async () => {
  const test = setup();
  const controller = test.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginImport({ gitUrl: 'https://github.com/a/b', displayName: 'Helper' });
  await controller.preview();
  test.create.mockRejectedValueOnce(new BotCreationFailure('git-source-changed'));
  await controller.submit();
  const saved = test.disk();
  await controller.beginImport({ gitUrl: 'https://github.com/other/repo' });
  await controller.blank();
  await controller.another('B');
  await controller.editBeforeSend();
  expect(test.disk()).toEqual(saved);
});

it('requires explicit submission after reopening an offline draft and rejects a changed pairing preview', async () => {
  const test = setup();
  const controller = test.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginImport({ gitUrl: 'https://github.com/a/b', displayName: 'Helper' });
  await controller.preview();
  const reopened = test.make();
  await reopened.resume();
  expect(test.create).not.toHaveBeenCalled();
  test.pair('replacement-phone');
  await reopened.submit();
  expect(reopened.getSnapshot().error).toBe('git-preview-required');
  expect(test.create).not.toHaveBeenCalled();
});

it('keeps a reviewed market revision and refuses to silently import newer source', async () => {
  const test = setup();
  const controller = test.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginImport({
    gitUrl: 'https://github.com/a/b',
    displayName: 'Market helper',
    origin: 'marketplace',
    listingId: 'listing',
    expectedCommit: 'b'.repeat(40),
  });
  await controller.preview();
  expect(controller.getSnapshot().error).toBe('git-source-changed');
  await controller.submit();
  expect(test.create).not.toHaveBeenCalled();
});

it('an intentional extra copy retains source defaults but uses a fresh operation after another review', async () => {
  const test = setup();
  const controller = test.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginImport({
    gitUrl: 'https://github.com/a/b',
    displayName: 'Helper',
    description: 'My bio',
    roles: ['writer'],
  });
  await controller.preview();
  await controller.submit();
  await controller.another('A');
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: { displayName: 'Helper', description: 'My bio', tags: 'writer' },
  });
  await controller.submit();
  expect(test.create).toHaveBeenCalledTimes(1);
  await controller.preview();
  await controller.submit();
  expect(test.create.mock.calls[1]?.[0].operationKey).not.toBe(
    test.create.mock.calls[0]?.[0].operationKey,
  );
});

it('refreshing the same market listing replaces the reviewed version without overwriting a renamed draft', async () => {
  const test = setup();
  const controller = test.make();
  await controller.enter({ kind: 'host', hostId: 'B' });
  await controller.beginImport({
    gitUrl: 'https://github.com/a/b',
    displayName: 'Catalogue name',
    origin: 'marketplace',
    listingId: 'listing',
    expectedCommit: 'b'.repeat(40),
  });
  const current = controller.getSnapshot().record;
  if (current.kind !== 'draft') throw new Error('Expected draft');
  await controller.edit({
    ...current.draft,
    displayName: 'My name',
    description: 'My bio',
    tags: 'edited',
  });
  await controller.beginImport({
    gitUrl: 'https://github.com/a/b',
    displayName: 'New catalogue name',
    description: 'New bio',
    roles: ['catalogue'],
    origin: 'marketplace',
    listingId: 'listing',
    expectedCommit: 'a'.repeat(40),
  });
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: {
      hostId: 'B',
      displayName: 'My name',
      description: 'My bio',
      tags: 'edited',
      source: { expectedCommit: 'a'.repeat(40) },
    },
  });
});

it('only an explicit new import after a definite source-change refusal may replace a sent operation', async () => {
  const test = setup();
  const controller = test.make();
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginImport({
    gitUrl: 'https://github.com/a/b',
    displayName: 'My helper',
    description: 'My bio',
  });
  await controller.preview();
  test.create.mockRejectedValueOnce(new BotCreationFailure('unreachable'));
  await controller.submit();
  const previous = test.create.mock.calls[0]?.[0];
  await controller.newAfterSourceChanged();
  expect(controller.getSnapshot().record.kind).toBe('submitted');
  test.create.mockRejectedValueOnce(new BotCreationFailure('git-source-changed'));
  await controller.submit();
  await controller.newAfterSourceChanged();
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: {
      displayName: 'My helper',
      description: 'My bio',
      hostId: 'A',
      source: { kind: 'git', gitUrl: 'https://github.com/a/b.git' },
    },
    unavailableOperations: [previous],
  });
  await controller.submit();
  expect(test.create).toHaveBeenCalledTimes(2);
  await controller.preview();
  await controller.submit();
  expect(test.create.mock.calls[2]?.[0].operationKey).not.toBe(previous?.operationKey);
});
