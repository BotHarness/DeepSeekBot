import { expect, it, vi } from 'vitest';
import { createChannelCreation } from '../src/host/channel-creation';

it('clears members immediately on a different Host and ignores late candidate reads', async () => {
  let finishA: ((bots: { slug: string; displayName: string }[]) => void) | undefined;
  const create = vi.fn(async () => 'group-b');
  const controller = createChannelCreation({
    key: () => 'channel-test-001',
    storage: { read: async () => undefined, write: async () => {} },
    port: {
      deviceId: () => 'phone',
      candidates: (hostId) =>
        hostId === 'A'
          ? new Promise((resolve) => {
              finishA = resolve;
            })
          : Promise.resolve([{ slug: 'same-id', displayName: 'B Bot' }]),
      create,
    },
  });
  await controller.ready;
  controller.rename('Design team');
  const a = controller.selectHost('A');
  await controller.selectHost('B');
  controller.toggle('same-id');
  expect(controller.getSnapshot().record.members).toEqual(['same-id']);
  const back = controller.selectHost('A');
  expect(controller.getSnapshot().record.members).toEqual([]);
  expect(controller.getSnapshot().candidates).toEqual([]);
  await controller.selectHost('B');
  finishA?.([{ slug: 'old', displayName: 'Old A' }]);
  await back;
  void a;
  expect(controller.getSnapshot().candidates).toEqual([{ slug: 'same-id', displayName: 'B Bot' }]);
  expect(controller.getSnapshot().record.name).toBe('Design team');
  controller.toggle('same-id');
  await controller.submit();
  expect(create).toHaveBeenCalledWith({
    hostId: 'B',
    deviceId: 'phone',
    operationKey: 'channel-test-001',
    name: 'Design team',
    members: ['same-id'],
  });
});

it('retains the submitted Host and key across lost responses and app restart', async () => {
  let saved: unknown;
  const operations: unknown[] = [];
  let fail = true;
  const options = {
    key: () => 'channel-test-002',
    storage: {
      read: async () => saved,
      write: async (record: unknown) => {
        saved = structuredClone(record);
      },
    },
    port: {
      deviceId: () => 'phone',
      candidates: async () => [{ slug: 'ada', displayName: 'Ada' }],
      create: async (operation: unknown) => {
        operations.push(structuredClone(operation));
        if (fail) throw new Error('lost response');
        return 'group-original';
      },
    },
  };
  const first = createChannelCreation(options);
  await first.ready;
  await first.selectHost('A');
  first.rename('Launch');
  first.toggle('ada');
  await first.submit();
  await first.selectHost('B');
  expect(first.getSnapshot().record.hostId).toBe('A');
  const reopened = createChannelCreation(options);
  await reopened.ready;
  fail = false;
  await reopened.submit();
  expect(operations).toHaveLength(2);
  expect(operations[1]).toEqual(operations[0]);
  expect(reopened.getSnapshot().result).toBe('group-original');
});
