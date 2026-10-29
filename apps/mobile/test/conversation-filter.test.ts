import { expect, it } from 'vitest';
import { createConversationFilter } from '../src/host/conversation-filter';
it('restores a source-scoped choice and does not overwrite a newer choice during hydration', async () => {
  let value: unknown = JSON.stringify(['computer', 'host_a']);
  const storage = {
    read: async () => value,
    write: (next: string) => {
      value = next;
    },
  };
  const restored = createConversationFilter(storage);
  await restored.ready;
  expect(restored.getSnapshot()).toBe(value);
  const next = createConversationFilter(storage);
  next.set(JSON.stringify(['cloud_account_b', 'org_b']));
  await next.ready;
  expect(next.getSnapshot()).toBe(value);
  expect(next.getSnapshot()).toContain('org_b');
});

it('retains a failed account filter reset for a durable retry', async () => {
  let disk = 'owned';
  let failed = true;
  const filter = createConversationFilter({
    read: async () => disk,
    write: (value) => {
      if (failed) throw new Error('disk');
      disk = value;
    },
  });
  await filter.ready;
  await expect(filter.clearPersisted('owned')).rejects.toThrow('disk');
  expect(filter.getSnapshot()).toBe('owned');
  failed = false;
  await filter.clearPersisted('owned');
  expect(disk).toBe('all');
  expect(filter.getSnapshot()).toBe('all');
});
