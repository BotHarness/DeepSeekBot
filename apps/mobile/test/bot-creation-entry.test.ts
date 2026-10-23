import { expect, it, vi } from 'vitest';
import { createBotCreationController, type CreationRecord } from '../src/host/bot-creation';
import { enterBotCreation } from '../src/host/bot-creation-entry';

const file = {
  fileId: '12345678-1234-1234-1234-123456789abc',
  fileName: 'Helper.zip',
  sha256: 'a'.repeat(64),
  sizeBytes: 30,
};
function setup() {
  let disk: CreationRecord | undefined;
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
      deviceId: () => 'phone',
      lookup: async () => null,
      create: async () => {
        throw new Error('lost reply');
      },
    },
  });
  return { controller, pickZip, disk: () => disk };
}
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
it('opens the native Zip picker first; cancellation preserves the complete previous draft and destination', async () => {
  const f = setup();
  await enterBotCreation(f.controller, 'git', { kind: 'host', hostId: 'A' });
  await f.controller.beginImport({
    gitUrl: 'https://github.com/example/helper',
    displayName: 'Edited',
  });
  const before = f.disk();
  f.pickZip.mockResolvedValueOnce(null);
  expect(await enterBotCreation(f.controller, 'zip', { kind: 'all' })).toBe('cancelled');
  expect(f.disk()).toEqual(before);
  await enterBotCreation(f.controller, 'zip', { kind: 'host', hostId: 'B' });
  expect(f.controller.getSnapshot().record).toMatchObject({
    draft: { hostId: 'B', displayName: 'Edited', source: { kind: 'zip', fileName: 'Helper.zip' } },
  });
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
it('resume leaves the selected source and target unchanged and does not re-open the picker', async () => {
  const f = setup();
  await enterBotCreation(f.controller, 'zip', { kind: 'host', hostId: 'A' });
  const before = f.disk();
  await enterBotCreation(f.controller, 'zip', { kind: 'resume' });
  expect(f.disk()).toEqual(before);
  expect(f.pickZip).toHaveBeenCalledTimes(1);
});
