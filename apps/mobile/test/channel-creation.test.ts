import { expect, it, vi } from 'vitest';
import { ChannelCreationNotAccepted, createChannelCreation } from '../src/host/channel-creation';

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

it('lets the Human correct a fresh operation explicitly rejected before Host acceptance', async () => {
  let rejected = true;
  let key = 0;
  const created: string[][] = [];
  const controller = createChannelCreation({
    key: () => `channel-correct-${++key}`,
    storage: { read: async () => undefined, write: async () => {} },
    port: {
      deviceId: () => 'phone',
      candidates: async () => [
        { slug: 'ada', displayName: 'Ada' },
        { slug: 'bo', displayName: 'Bo' },
      ],
      create: async (operation) => {
        if (rejected) throw new ChannelCreationNotAccepted('archived-bot');
        created.push(operation.members);
        return 'group-fixed';
      },
    },
  });
  await controller.ready;
  await controller.selectHost('A');
  controller.rename('Team');
  controller.toggle('ada');
  await controller.submit();
  expect(controller.getSnapshot().record.kind).toBe('draft');
  expect(controller.getSnapshot().record.name).toBe('Team');
  await controller.refresh();
  controller.toggle('ada');
  controller.toggle('bo');
  rejected = false;
  await controller.submit();
  expect(controller.getSnapshot().result).toBe('group-fixed');
  expect(created).toEqual([['bo']]);
});

it('does not unlock an old operation on a refusal that can also happen during receipt replay', async () => {
  const record = {
    kind: 'submitted',
    hostId: 'A',
    name: 'Team',
    members: ['ada'],
    deviceId: 'phone',
    operationKey: 'channel-uncertain-001',
  };
  const controller = createChannelCreation({
    key: () => 'must-not-use',
    storage: { read: async () => record, write: async () => {} },
    port: {
      deviceId: () => 'phone',
      candidates: async () => [],
      create: async () => {
        throw new ChannelCreationNotAccepted('unknown-bot');
      },
    },
  });
  await controller.ready;
  await controller.submit();
  expect(controller.getSnapshot().record).toEqual(record);
  await controller.selectHost('B');
  expect(controller.getSnapshot().record.hostId).toBe('A');
});

it('selects people beside Bots, resets them on another Host and sends humanIds', async () => {
  const create = vi.fn(async () => 'group-mixed');
  let finishA: ((people: { id: string; displayName: string }[]) => void) | undefined;
  const controller = createChannelCreation({
    key: () => 'channel-people-001',
    storage: { read: async () => undefined, write: async () => {} },
    port: {
      deviceId: () => 'phone',
      candidates: async () => [{ slug: 'ada', displayName: 'Ada' }],
      people: (hostId) =>
        hostId === 'late'
          ? new Promise((resolve) => {
              finishA = resolve;
            })
          : Promise.resolve(
              hostId === 'solo'
                ? undefined
                : [
                    { id: `${hostId}-ann`, displayName: 'Ann' },
                    { id: `${hostId}-cy`, displayName: 'Cy' },
                  ],
            ),
      create,
    },
  });
  await controller.ready;
  await controller.selectHost('A');
  expect(controller.getSnapshot().peopleStatus).toBe('ready');
  controller.toggle('ada');
  controller.togglePerson('A-ann');
  controller.togglePerson('A-cy');
  controller.togglePerson('A-cy');
  controller.togglePerson('not-offered');
  expect(controller.getSnapshot().record.humanIds).toEqual(['A-ann']);

  await controller.selectHost('solo');
  expect(controller.getSnapshot().record.humanIds).toBeUndefined();
  expect(controller.getSnapshot().selectionReset).toBe(true);
  expect(controller.getSnapshot().peopleStatus).toBe('off');
  controller.togglePerson('solo-ann');
  expect(controller.getSnapshot().record.humanIds).toBeUndefined();

  const late = controller.selectHost('late');
  expect(controller.getSnapshot().peopleStatus).toBe('loading');
  await controller.selectHost('B');
  finishA?.([{ id: 'late-ann', displayName: 'Late Ann' }]);
  await late;
  expect(controller.getSnapshot().people.map((person) => person.id)).toEqual(['B-ann', 'B-cy']);

  controller.rename('Mixed');
  controller.toggle('ada');
  controller.togglePerson('B-cy');
  await controller.submit();
  expect(create).toHaveBeenCalledWith({
    hostId: 'B',
    deviceId: 'phone',
    operationKey: 'channel-people-001',
    name: 'Mixed',
    members: ['ada'],
    humanIds: ['B-cy'],
  });
});

it('waits for people before a restored draft with people is submitted', async () => {
  let finish: ((people: { id: string; displayName: string }[]) => void) | undefined;
  const create = vi.fn(async () => 'group-restored');
  const controller = createChannelCreation({
    key: () => 'channel-people-002',
    storage: {
      read: async () => ({
        kind: 'draft',
        hostId: 'A',
        name: 'Restored',
        members: [],
        humanIds: ['kept'],
      }),
      write: async () => {},
    },
    port: {
      deviceId: () => 'phone',
      candidates: async () => [],
      people: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      create,
    },
  });
  await controller.ready;
  const loading = controller.refresh();
  await controller.submit();
  expect(create).not.toHaveBeenCalled();
  finish?.([{ id: 'kept', displayName: 'Kept' }]);
  await loading;
  expect(controller.getSnapshot().record.humanIds).toEqual(['kept']);
  await controller.submit();
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ humanIds: ['kept'] }));
});

it('keeps a restored selection outside the first 100 people until it is explicitly removed', async () => {
  const create = vi.fn(async () => 'group-capped');
  const people = Array.from({ length: 100 }, (_, index) => ({
    id: `person-${index}`,
    displayName: `Person ${index}`,
  }));
  const selected = ['past-cap', 'remove-me', ...people.slice(0, 98).map(({ id }) => id)];
  const controller = createChannelCreation({
    key: () => 'channel-people-003',
    storage: {
      read: async () => ({
        kind: 'draft',
        hostId: 'A',
        name: 'Restored',
        members: [],
        humanIds: selected,
      }),
      write: async () => {},
    },
    port: {
      deviceId: () => 'phone',
      candidates: async () => [],
      people: async () => people,
      create,
    },
  });
  await controller.ready;
  await controller.refresh();
  controller.togglePerson('person-99');
  expect(controller.getSnapshot().record.humanIds).toEqual(selected);
  controller.togglePerson('remove-me');
  controller.togglePerson('remove-me');
  await controller.submit();
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ humanIds: selected.filter((id) => id !== 'remove-me') }),
  );
});

it.each(['error', 'off'] as const)(
  'keeps a restored draft editable and blocks submission when people are %s',
  async (status) => {
    const create = vi.fn(async () => 'group-retried');
    let unavailable = true;
    const controller = createChannelCreation({
      key: () => 'channel-people-004',
      storage: {
        read: async () => ({
          kind: 'draft',
          hostId: 'A',
          name: 'Restored',
          members: [],
          humanIds: ['ann'],
        }),
        write: async () => {},
      },
      port: {
        deviceId: () => 'phone',
        candidates: async () => [],
        people: async () => {
          if (unavailable) {
            if (status === 'error') throw new Error('unreachable');
            return undefined;
          }
          return [{ id: 'ann', displayName: 'Ann' }];
        },
        create,
      },
    });
    await controller.ready;
    await controller.refresh();
    expect(controller.getSnapshot().peopleStatus).toBe(status);
    controller.rename('Renamed');
    await controller.submit();
    expect(create).not.toHaveBeenCalled();
    expect(controller.getSnapshot().record.humanIds).toEqual(['ann']);
    unavailable = false;
    await controller.refreshPeople();
    await controller.submit();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renamed', humanIds: ['ann'] }),
    );
  },
);
