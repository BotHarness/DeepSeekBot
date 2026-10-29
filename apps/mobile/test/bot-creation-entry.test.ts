import { expect, it, vi } from 'vitest';
import { createBotCreationController, type CreationRecord } from '../src/host/bot-creation';
import { enterBotCreation } from '../src/host/bot-creation-entry';

const file = {
  fileId: '12345678-1234-1234-1234-123456789abc',
  fileName: 'Helper.zip',
  sha256: 'a'.repeat(64),
  sizeBytes: 30,
};
function setup(previous?: CreationRecord) {
  let disk: CreationRecord | undefined = previous;
  const pickZip = vi.fn(async (): Promise<typeof file | null> => file);
  const controller = createBotCreationController({
    key: () => 'entry-operation-001',
    storage: {
      read: async () => disk,
      write: async (record) => {
        disk = structuredClone(record);
      },
    },
    port: {
      pickZip,
      previewZip: async (_target, source) => ({
        source,
        displayName: 'Archive helper',
        description: 'Archive bio',
        roles: ['archive'],
      }),
      deviceId: () => 'phone',
      lookup: async () => null,
      create: async () => {
        throw new Error('lost reply');
      },
    },
  });
  return { controller, pickZip, disk: () => disk };
}
function completedGit(): CreationRecord {
  return {
    kind: 'submitted',
    acknowledged: true,
    mutationStarted: true,
    operation: {
      hostId: 'A',
      deviceId: 'phone',
      operationKey: 'completed-git-operation',
      input: { displayName: 'Previous Git Bot', description: 'Old bio', roles: ['old'] },
      source: {
        kind: 'git',
        gitUrl: 'https://github.com/example/previous',
        commit: 'b'.repeat(40),
      },
    },
  };
}
it('prefills a new Zip from its archive after a completed Git import', async () => {
  const f = setup(completedGit());
  await enterBotCreation(f.controller, 'zip', { kind: 'host', hostId: 'B' });
  await f.controller.beginZip();
  await f.controller.preview();
  expect(f.controller.getSnapshot().error).toBeUndefined();
  expect(f.controller.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: {
      hostId: 'B',
      displayName: 'Archive helper',
      description: 'Archive bio',
      tags: 'archive',
      source: { kind: 'zip' },
    },
  });
});
it('keeps a name edited within the new Zip flow before its first preview', async () => {
  const f = setup(completedGit());
  await enterBotCreation(f.controller, 'zip', { kind: 'host', hostId: 'B' });
  await f.controller.beginZip();
  const record = f.controller.getSnapshot().record;
  if (record.kind !== 'draft') throw new Error('draft expected');
  await f.controller.edit({ ...record.draft, displayName: 'My new Zip name' });
  await f.controller.preview();
  expect(f.controller.getSnapshot().record).toMatchObject({
    draft: { displayName: 'My new Zip name', description: 'Archive bio', tags: 'archive' },
  });
});
it.each(['blank', 'git', 'zip'] as const)(
  'starts a fresh %s entry after acknowledged creation without inheriting the previous identity',
  async (source) => {
    const f = setup(completedGit());
    await enterBotCreation(f.controller, source, { kind: 'host', hostId: 'B' });
    expect(f.controller.getSnapshot().record).toMatchObject({
      kind: 'draft',
      draft: { hostId: 'B', displayName: '', persona: '', description: '', tags: '' },
    });
  },
);
it('starts each source explicitly and preserves edited metadata across source and target selection', async () => {
  const { controller } = setup();
  await enterBotCreation(controller, 'blank', { kind: 'host', hostId: 'A' });
  const state = controller.getSnapshot().record;
  if (state.kind !== 'draft') throw new Error('draft expected');
  await controller.edit({
    ...state.draft,
    displayName: 'My helper',
    persona: 'Keep this persona',
    tags: 'Writing',
  });
  await enterBotCreation(controller, 'git', { kind: 'host', hostId: 'B' });
  expect(controller.getSnapshot().record).toMatchObject({
    draft: { hostId: 'B', displayName: 'My helper', source: { kind: 'git', gitUrl: '' } },
  });
  await enterBotCreation(controller, 'blank', { kind: 'all' });
  expect(controller.getSnapshot().record).toMatchObject({
    draft: { hostId: '', displayName: 'My helper', persona: 'Keep this persona', tags: 'Writing' },
  });
  expect(controller.getSnapshot().record).not.toHaveProperty('draft.source');
});
it('leaves choosing the Zip to its own step and keeps the edited name and destination', async () => {
  const f = setup();
  await enterBotCreation(f.controller, 'git', { kind: 'host', hostId: 'A' });
  await f.controller.beginImport({
    gitUrl: 'https://github.com/example/helper',
    displayName: 'Edited',
  });
  expect(await enterBotCreation(f.controller, 'zip', { kind: 'host', hostId: 'B' })).toBe('ready');
  expect(f.pickZip).not.toHaveBeenCalled();
  expect(f.controller.getSnapshot().record).toMatchObject({
    draft: { hostId: 'B', displayName: 'Edited' },
  });
  expect(f.controller.getSnapshot().record).not.toHaveProperty('draft.source');
  await f.controller.beginZip();
  await enterBotCreation(f.controller, 'zip', { kind: 'all' });
  expect(f.controller.getSnapshot().record).toMatchObject({
    draft: { hostId: '', source: { kind: 'zip', fileName: 'Helper.zip' } },
  });
});
it('preselects from All with the last-used Environment the screen still allows', async () => {
  const f = setup();
  await enterBotCreation(f.controller, 'blank', { kind: 'host', hostId: 'A' });
  const seen: string[] = [];
  await enterBotCreation(f.controller, 'blank', { kind: 'all' }, (last) => {
    seen.push(last);
    return last;
  });
  expect(seen).toEqual(['A']);
  expect(f.controller.getSnapshot().record).toMatchObject({ draft: { hostId: 'A' } });
  await enterBotCreation(f.controller, 'blank', { kind: 'all' }, () => '');
  expect(f.controller.getSnapshot().record).toMatchObject({ draft: { hostId: '' } });
});
it('never replaces an unresolved submitted operation or opens a picker from another entry', async () => {
  const f = setup();
  await enterBotCreation(f.controller, 'blank', { kind: 'host', hostId: 'A' });
  const state = f.controller.getSnapshot().record;
  if (state.kind !== 'draft') throw new Error('draft expected');
  await f.controller.edit({ ...state.draft, displayName: 'Pending' });
  await f.controller.submit();
  const before = f.disk();
  expect(before?.kind).toBe('submitted');
  for (const source of ['blank', 'git', 'zip'] as const) {
    await enterBotCreation(f.controller, source, { kind: 'host', hostId: 'B' });
    expect(f.disk()).toEqual(before);
  }
  expect(f.pickZip).not.toHaveBeenCalled();
});
it('resume leaves the selected source and target unchanged and does not open the picker', async () => {
  const f = setup();
  await enterBotCreation(f.controller, 'blank', { kind: 'host', hostId: 'A' });
  await f.controller.beginZip();
  const before = f.disk();
  await enterBotCreation(f.controller, 'zip', { kind: 'resume' });
  expect(f.disk()).toEqual(before);
  expect(f.pickZip).toHaveBeenCalledTimes(1);
});
