import { describe, expect, it, vi } from 'vitest';
import {
  BotCreationFailure,
  createBotCreationController,
  parseCreationRecord,
  normalizedBlankInput,
  type BotCreationOperation,
  type CreationReceipt,
  type CreationRecord,
} from '../src/host/bot-creation';

const draft = {
  hostId: 'B',
  displayName: ' My Bot ',
  persona: 'Be curious',
  description: ' A friend ',
  tags: 'helper, helper，writing',
};
const receipt = (operation: BotCreationOperation): CreationReceipt => ({
  operationKey: operation.operationKey,
  botSlug: 'original-bot',
  status: 'created',
  channelId: 'dm-original-bot',
});

function rig() {
  let disk: CreationRecord | undefined;
  let pair: string | undefined = 'device-b';
  let failWrite = false;
  let canonical: CreationReceipt | null = null;
  const lookup = vi.fn(async (_operation: BotCreationOperation) => canonical);
  const create = vi.fn(async (operation: BotCreationOperation) => {
    canonical = receipt(operation);
    return canonical;
  });
  let serial = 0;
  const make = () =>
    createBotCreationController({
      key: () => `operation-${++serial}`,
      storage: {
        async read() {
          return disk;
        },
        async write(record) {
          if (failWrite) throw new Error('disk full');
          disk = structuredClone(record);
        },
      },
      port: { deviceId: (hostId) => (hostId === 'B' ? pair : undefined), lookup, create },
    });
  return {
    make,
    lookup,
    create,
    disk: () => disk,
    pair: (value?: string) => {
      pair = value;
    },
    failWrite: () => {
      failWrite = true;
    },
    canonical: () => canonical,
  };
}

describe('native blank Bot creation recovery', () => {
  it('fresh All entry requires a new target choice while preserving text and normal resume', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    await controller.enter({ kind: 'resume' });
    expect(controller.getSnapshot().record).toEqual({ kind: 'draft', draft });
    await controller.enter({ kind: 'all' });
    expect(controller.getSnapshot().record).toEqual({
      kind: 'draft',
      draft: { ...draft, hostId: '' },
    });
    await controller.submit();
    expect(test.lookup).not.toHaveBeenCalled();
    expect(test.create).not.toHaveBeenCalled();
    await controller.enter({ kind: 'host', hostId: 'B' });
    expect(controller.getSnapshot().record).toEqual({ kind: 'draft', draft });
  });

  it('does not redirect an already submitted operation when opened from All or another Host', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.create.mockRejectedValue(new BotCreationFailure('unreachable'));
    await controller.submit();
    const saved = test.disk();
    await controller.enter({ kind: 'all' });
    await controller.enter({ kind: 'host', hostId: 'A' });
    expect(test.disk()).toEqual(saved);
  });

  it('allows an explicit different Bot after an unavailable identity while retaining its recovery reference', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.create.mockRejectedValueOnce(new BotCreationFailure('unreachable'));
    await controller.submit();
    const original = test.create.mock.calls[0]?.[0];
    await controller.newAfterUnavailable();
    expect(controller.getSnapshot().record.kind).toBe('submitted');
    test.lookup.mockRejectedValueOnce(new BotCreationFailure('creation-identity-unavailable'));
    await controller.resume();
    await controller.newAfterUnavailable();
    expect(controller.getSnapshot().record.kind).toBe('draft');
    expect(test.disk()?.unavailableOperations).toEqual([original]);
    const reopened = test.make();
    await reopened.ready;
    expect(reopened.getSnapshot().record.unavailableOperations).toEqual([original]);
    await reopened.edit(draft);
    await reopened.submit();
    expect(test.create.mock.calls[1]?.[0].operationKey).not.toBe(original?.operationKey);
    expect(test.disk()?.unavailableOperations).toEqual([original]);
  });

  it('does not replace a terminal operation if its retained reference cannot be saved', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.lookup.mockRejectedValue(new BotCreationFailure('creation-identity-unavailable'));
    await controller.submit();
    const original = test.disk();
    test.failWrite();
    await controller.newAfterUnavailable();
    expect(controller.getSnapshot().record).toEqual(original);
    expect(controller.getSnapshot().error).toBe('storage-write');
  });
  it('persists the same optional-field normalization used by direct CLI creation and lookup', async () => {
    expect(
      normalizedBlankInput({
        hostId: 'B',
        displayName: ' Bot ',
        persona: '  ',
        description: '',
        tags: ', ，',
      }),
    ).toEqual({ displayName: 'Bot' });
    expect(normalizedBlankInput({ ...draft, persona: '  Be curious\n' })).toEqual({
      displayName: 'My Bot',
      persona: 'Be curious',
      description: 'A friend',
      roles: ['helper', 'writing'],
    });
    const test = rig();
    const controller = test.make();
    await controller.edit({ ...draft, persona: '', description: '', tags: '' });
    await controller.submit();
    expect(test.lookup.mock.calls[0]?.[0].input).toEqual({ displayName: 'My Bot' });
    expect(test.create.mock.calls[0]?.[0].input).toEqual({ displayName: 'My Bot' });
  });
  it('saves exact Host, pairing, key and normalized input before checking capability or mutating', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.lookup.mockImplementationOnce(async (operation) => {
      expect(test.disk()).toEqual({ kind: 'submitted', operation, mutationStarted: false });
      return null;
    });
    test.create.mockImplementationOnce(async (operation) => {
      expect(test.disk()).toEqual({ kind: 'submitted', operation, mutationStarted: true });
      expect(operation).toEqual({
        hostId: 'B',
        deviceId: 'device-b',
        operationKey: 'operation-1',
        input: {
          displayName: 'My Bot',
          persona: 'Be curious',
          description: 'A friend',
          roles: ['helper', 'writing'],
        },
      });
      return receipt(operation);
    });
    await controller.submit();
    expect(controller.getSnapshot().receipt?.status).toBe('created');
  });

  it('recovers the original Bot and DM after a lost response and app restart without another create', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.create.mockImplementationOnce(async (operation) => {
      test.lookup.mockResolvedValue(receipt(operation));
      throw new BotCreationFailure('unreachable');
    });
    await controller.submit();
    expect(controller.getSnapshot().error).toBe('unreachable');
    const reopened = test.make();
    await reopened.resume();
    expect(reopened.getSnapshot().receipt).toEqual({
      operationKey: 'operation-1',
      botSlug: 'original-bot',
      status: 'created',
      channelId: 'dm-original-bot',
    });
    expect(test.create).toHaveBeenCalledTimes(1);
    expect(test.lookup.mock.calls[1]?.[0]).toEqual(test.lookup.mock.calls[0]?.[0]);
  });

  it('reconciles a reserved identity using precisely the same input and key', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.lookup.mockImplementation(async (operation) => ({
      operationKey: operation.operationKey,
      botSlug: 'original-bot',
      status: 'reserved',
    }));
    await controller.submit();
    expect(test.create.mock.calls[0]?.[0]).toEqual(test.lookup.mock.calls[0]?.[0]);
    expect(controller.getSnapshot().receipt?.botSlug).toBe('original-bot');
  });

  it('does not send anything when the operation cannot be saved', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.failWrite();
    await controller.submit();
    expect(test.lookup).not.toHaveBeenCalled();
    expect(test.create).not.toHaveBeenCalled();
    expect(controller.getSnapshot().error).toBe('storage-write');
  });

  it('probes old Hosts before create and allows correcting an operation that was never sent', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.lookup.mockRejectedValue(new BotCreationFailure('host-update-required'));
    await controller.submit();
    expect(test.create).not.toHaveBeenCalled();
    await controller.editBeforeSend();
    expect(controller.getSnapshot().record.kind).toBe('draft');
  });

  it('never unlocks uncertain work or silently submits an unsubmitted draft on resume', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    await controller.resume();
    expect(test.lookup).not.toHaveBeenCalled();
    test.create.mockRejectedValue(new BotCreationFailure('unreachable'));
    await controller.submit();
    await controller.editBeforeSend();
    await controller.edit({ ...draft, hostId: 'A', displayName: 'Changed' });
    await controller.another('A');
    expect(controller.getSnapshot().record).toEqual(test.disk());
    expect(controller.getSnapshot().record.kind).toBe('submitted');
  });

  it('only reads after a preflight connection failure until the Human explicitly retries', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.lookup.mockRejectedValueOnce(new BotCreationFailure('unreachable'));
    await controller.submit();
    const reopened = test.make();
    await reopened.resume();
    expect(test.create).not.toHaveBeenCalled();
    await reopened.submit();
    expect(test.create).toHaveBeenCalledTimes(1);
  });

  it('keeps form contents when the destination changes before submission', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    await controller.edit({ ...draft, hostId: 'A' });
    expect(controller.getSnapshot().record).toEqual({
      kind: 'draft',
      draft: { ...draft, hostId: 'A' },
    });
    expect(test.lookup).not.toHaveBeenCalled();
  });

  it('coalesces repeat taps and only allocates a fresh key for an explicit next Bot', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    await Promise.all([controller.submit(), controller.submit(), controller.submit()]);
    expect(test.create).toHaveBeenCalledTimes(1);
    await controller.submit();
    expect(test.create).toHaveBeenCalledTimes(1);
    await controller.another('B');
    await controller.edit(draft);
    test.lookup.mockResolvedValue(null);
    await controller.submit();
    expect(test.create.mock.calls.map(([operation]) => operation.operationKey)).toEqual([
      'operation-1',
      'operation-2',
    ]);
  });

  it('refuses removed or replaced pairing before requests and after awaited lookup', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.lookup.mockImplementationOnce(async (operation) => {
      test.pair('different-device');
      return receipt(operation);
    });
    await controller.submit();
    expect(controller.getSnapshot().error).toBe('target-unpaired');
    expect(controller.getSnapshot().receipt).toBeUndefined();
    expect(test.create).not.toHaveBeenCalled();
    await controller.resume();
    expect(test.lookup).toHaveBeenCalledTimes(1);
  });

  it('does not publish a result received after unpairing during creation', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.create.mockImplementationOnce(async (operation) => {
      test.pair();
      return receipt(operation);
    });
    await controller.submit();
    expect(controller.getSnapshot().receipt).toBeUndefined();
    expect(controller.getSnapshot().error).toBe('target-unpaired');
  });

  it('fails closed on corrupt saved data rather than replacing a possibly submitted key', async () => {
    expect(() => parseCreationRecord({ kind: 'submitted', operation: {} })).toThrow();
    const test = rig();
    const controller = createBotCreationController({
      storage: {
        async read() {
          return 'broken';
        },
        write: vi.fn(),
      },
      port: { lookup: test.lookup, create: test.create, deviceId: () => 'device-b' },
      key: () => 'new-key-123',
    });
    await controller.edit(draft);
    await controller.submit();
    expect(controller.getSnapshot().error).toBe('storage-invalid');
    expect(test.create).not.toHaveBeenCalled();
  });

  it('durably consumes only a confirmed result and preserves uncertain operations', async () => {
    const test = rig();
    const controller = test.make();
    await controller.edit(draft);
    test.create.mockRejectedValueOnce(new BotCreationFailure('unreachable'));
    await controller.submit();
    await controller.acknowledge('operation-1');
    expect(test.disk()).not.toHaveProperty('acknowledged');
    await controller.submit();
    await controller.acknowledge('another-operation');
    expect(test.disk()).not.toHaveProperty('acknowledged');
    await controller.acknowledge('operation-1');
    expect(test.disk()).toHaveProperty('acknowledged', true);
    const restarted = test.make();
    await restarted.ready;
    await restarted.another('B');
    expect(restarted.getSnapshot().record.kind).toBe('draft');
  });
});
