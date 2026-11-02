import { expect, it } from 'vitest';
import { creationAvatarRecipe } from '../src/host/bot-avatar-choice';
import {
  createBotCreationController,
  parseCreationRecord,
  type BotCreationDraft,
  type CreationRecord,
} from '../src/host/bot-creation';
import { seededAvatarFor } from '../../../packages/core/src/bots/avatar-appearance';

it('a blank draft keeps its initial avatar through name edits, destination changes and reopening', async () => {
  let disk: CreationRecord | undefined;
  const make = () =>
    createBotCreationController({
      key: () => 'operation',
      storage: {
        read: async () => disk,
        write: async (record) => {
          disk = structuredClone(record);
        },
      },
      port: {
        deviceId: () => 'device',
        lookup: async () => null,
        create: async (operation) => ({
          operationKey: operation.operationKey,
          botSlug: 'new',
          status: 'created',
          channelId: 'dm-new',
        }),
      },
    });
  const first = make();
  await first.ready;
  const start = first.getSnapshot().record;
  if (start.kind !== 'draft') throw Error('Expected creation draft');
  const avatar = start.draft.avatar;
  expect(avatar).toMatchObject({ kind: 'generated', origin: 'initial' });
  let draft = start.draft;
  for (const displayName of ['A', 'An', 'Another Bot']) {
    draft = { ...draft, displayName };
    await first.edit(draft);
    const next = first.getSnapshot().record;
    expect(next.kind === 'draft' && next.draft.avatar).toEqual(avatar);
  }
  await first.enter({ kind: 'host', hostId: 'B' });
  const reopened = make();
  await reopened.ready;
  const saved = reopened.getSnapshot().record;
  expect(saved.kind === 'draft' && creationAvatarRecipe(saved.draft.avatar)).toEqual(
    creationAvatarRecipe(avatar),
  );
  await reopened.beginImport({ gitUrl: 'https://github.com/test/bot' });
  const imported = reopened.getSnapshot().record;
  expect(imported.kind === 'draft' && imported.draft.avatar).toBeUndefined();
});

it('retains custom recipes and photos when changing names and selecting an import', async () => {
  const recipe = seededAvatarFor('chosen', 2);
  for (const avatar of [
    { kind: 'recipe', recipe },
    { kind: 'photo', image: 'data:image/png;base64,AAAA' },
  ] satisfies NonNullable<BotCreationDraft['avatar']>[]) {
    const original = {
      kind: 'draft',
      draft: { hostId: 'A', displayName: 'A', persona: '', description: '', tags: '', avatar },
    } satisfies CreationRecord;
    expect(parseCreationRecord(structuredClone(original))).toEqual(original);
    const controller = createBotCreationController({
      key: () => 'operation',
      storage: { read: async () => original, write: async () => {} },
      port: {
        deviceId: () => 'device',
        lookup: async () => null,
        create: async () => {
          throw Error('Must not submit');
        },
      },
    });
    await controller.ready;
    await controller.edit({ ...original.draft, displayName: 'Changed' });
    await controller.beginImport({ gitUrl: 'https://github.com/test/bot' });
    const next = controller.getSnapshot().record;
    expect(next.kind === 'draft' && next.draft.avatar).toEqual(avatar);
  }
});

it('rejects invalid stored custom recipes without degrading them into a new random face', () => {
  expect(() =>
    parseCreationRecord({
      kind: 'draft',
      draft: {
        hostId: 'A',
        displayName: 'A',
        persona: '',
        description: '',
        tags: '',
        avatar: { kind: 'recipe', recipe: { family: 'unknown' } },
      },
    }),
  ).toThrow('storage-invalid');
});

it('a failed editor save keeps the previous draft, and retry durably commits the exact recipe', async () => {
  let disk: CreationRecord | undefined;
  let refuse = false;
  const controller = createBotCreationController({
    key: () => 'operation',
    storage: {
      read: async () => disk,
      write: async (record) => {
        if (refuse) throw Error('Disk full');
        disk = structuredClone(record);
      },
    },
    port: {
      deviceId: () => 'device',
      lookup: async () => null,
      create: async () => {
        throw Error('Must not create');
      },
    },
  });
  await controller.ready;
  const start = controller.getSnapshot().record;
  if (start.kind !== 'draft') throw Error('Expected draft');
  await controller.edit({ ...start.draft, hostId: 'A', displayName: 'Retained name' });
  const previous = controller.getSnapshot().record;
  const saved = disk;
  refuse = true;
  const avatar = { kind: 'recipe', recipe: seededAvatarFor('customized', 2) } satisfies NonNullable<
    BotCreationDraft['avatar']
  >;
  await controller.setAvatar(avatar);
  expect(controller.getSnapshot().error).toBe('storage-write');
  expect(controller.getSnapshot().record).toBe(previous);
  expect(disk).toBe(saved);
  refuse = false;
  await controller.setAvatar(avatar);
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: { hostId: 'A', displayName: 'Retained name', avatar },
  });
  expect(disk).toEqual(controller.getSnapshot().record);
});
