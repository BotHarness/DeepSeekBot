import { expect, it, vi } from 'vitest';
import type { MarketplaceDetail } from '../../../packages/core/src/marketplace/client';
import {
  createBotCreationController,
  type CreationRecord,
  type BotCreationOperation,
} from '../src/host/bot-creation';
import { selectMarketplaceImport } from '../src/marketplace/import-selection';

const detail: MarketplaceDetail = {
  bot: {
    id: 'listing-1',
    owner: 'example',
    name: 'writer',
    fullName: 'example/writer',
    displayName: 'Writer',
    roles: ['writing'],
    description: 'Writing helper',
    descriptionGenerated: false,
    banner: null,
    topics: ['writing'],
    stars: 12,
    pushedAt: '2026-10-23',
    htmlUrl: 'https://github.com/example/writer',
    cloneUrl: 'https://github.com/example/writer.git',
    defaultBranch: 'main',
    headCommit: { sha: 'a'.repeat(40), committedAt: '2026-10-23' },
  },
  commitSha: 'a'.repeat(40),
  readme: '# Writer',
  readmeLanguage: 'en',
};

function setup() {
  let disk: CreationRecord | undefined;
  let paired = false;
  const create = vi.fn(async (operation: BotCreationOperation) => ({
    operationKey: operation.operationKey,
    status: 'created' as const,
    botSlug: 'writer-copy',
    channelId: 'dm-writer-copy',
  }));
  const preview = vi.fn(async () => ({
    kind: 'git' as const,
    gitUrl: detail.bot.cloneUrl,
    commit: 'a'.repeat(40),
  }));
  const make = () =>
    createBotCreationController({
      key: () => 'marketplace-operation-1',
      storage: {
        read: async () => disk,
        write: async (record) => {
          disk = structuredClone(record);
        },
      },
      port: {
        deviceId: () => (paired ? 'phone' : undefined),
        lookup: async () => null,
        create,
        preview,
      },
    });
  return {
    make,
    create,
    preview,
    pair: () => {
      paired = true;
    },
  };
}

it('retains the selected listing without a Host, then imports its reviewed version after pairing', async () => {
  const test = setup();
  const controller = test.make();
  expect(await selectMarketplaceImport(controller, detail, { kind: 'all' })).toBeUndefined();
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: {
      hostId: '',
      displayName: 'Writer',
      source: { origin: 'marketplace', listingId: 'listing-1', expectedCommit: 'a'.repeat(40) },
    },
  });
  expect(test.create).not.toHaveBeenCalled();
  test.pair();
  const reopened = test.make();
  await reopened.ready;
  const saved = reopened.getSnapshot().record;
  if (saved.kind !== 'draft') throw new Error('Expected retained draft');
  await reopened.edit({ ...saved.draft, hostId: 'B', displayName: 'My writer' });
  await reopened.preview();
  await reopened.submit();
  expect(test.create).toHaveBeenCalledWith(
    expect.objectContaining({
      hostId: 'B',
      source: {
        kind: 'git',
        gitUrl: detail.bot.cloneUrl,
        commit: 'a'.repeat(40),
        origin: 'marketplace',
        listingId: 'listing-1',
      },
      input: { displayName: 'My writer', description: 'Writing helper', roles: ['writing'] },
    }),
  );
});

it('inherits scoped A and forces another explicit target choice on a fresh All entry', async () => {
  const controller = setup().make();
  await selectMarketplaceImport(controller, detail, { kind: 'host', hostId: 'A' });
  expect(controller.getSnapshot().record).toMatchObject({ draft: { hostId: 'A' } });
  await selectMarketplaceImport(controller, detail, { kind: 'all' });
  expect(controller.getSnapshot().record).toMatchObject({ draft: { hostId: '' } });
});

it('requires explicit listing refresh after a changed revision and preserves edits and target', async () => {
  const test = setup();
  test.pair();
  const controller = test.make();
  await selectMarketplaceImport(controller, detail, { kind: 'host', hostId: 'A' });
  const current = controller.getSnapshot().record;
  if (current.kind !== 'draft') throw new Error('Expected draft');
  await controller.edit({
    ...current.draft,
    hostId: 'B',
    displayName: 'Edited',
    description: 'My bio',
    tags: 'mine',
  });
  test.preview.mockResolvedValue({
    kind: 'git',
    gitUrl: detail.bot.cloneUrl,
    commit: 'b'.repeat(40),
  });
  await controller.preview();
  expect(controller.getSnapshot().error).toBe('git-source-changed');
  expect(test.create).not.toHaveBeenCalled();
  await selectMarketplaceImport(
    controller,
    { ...detail, commitSha: 'b'.repeat(40) },
    { kind: 'refresh' },
  );
  expect(controller.getSnapshot().record).toMatchObject({
    draft: {
      hostId: 'B',
      displayName: 'Edited',
      description: 'My bio',
      tags: 'mine',
      source: { expectedCommit: 'b'.repeat(40) },
    },
  });
  await controller.preview();
  await controller.submit();
  expect(controller.getSnapshot().receipt).toMatchObject({
    status: 'created',
    botSlug: 'writer-copy',
  });
});

it('never replaces submitted work or imports a listing with no verified version', async () => {
  const test = setup();
  test.pair();
  const controller = test.make();
  expect(
    await selectMarketplaceImport(controller, { ...detail, commitSha: null }, { kind: 'all' }),
  ).toBe('marketplace-version-unavailable');
  await selectMarketplaceImport(controller, detail, { kind: 'host', hostId: 'A' });
  await controller.preview();
  await controller.submit();
  const original = controller.getSnapshot().record;
  expect(
    await selectMarketplaceImport(
      controller,
      { ...detail, bot: { ...detail.bot, id: 'listing-2' } },
      { kind: 'host', hostId: 'B' },
    ),
  ).toBe('creation-pending');
  expect(controller.getSnapshot().record).toEqual(original);
  expect(test.create).toHaveBeenCalledTimes(1);
});
