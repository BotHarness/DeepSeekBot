import { createHostClient, deviceRefusal, MethodRefused } from './client';
import type { HostCarrier } from './carrier';
import type { SavedHost } from './hosts';
import {
  BotCreationFailure,
  creationReceipt,
  type BotCreationOperation,
  type BotCreationPort,
} from './bot-creation';

export function botCreationTransport(
  hosts: () => readonly SavedHost[],
  carrier: HostCarrier,
): BotCreationPort {
  const call = async (operation: BotCreationOperation, method: 'createLookup' | 'create') => {
    const host = hosts().find(
      (host) => host.hostId === operation.hostId && host.deviceId === operation.deviceId,
    );
    if (!host) throw new BotCreationFailure('target-unpaired');
    const stillPaired = () =>
      hosts().some(
        (current) =>
          current.hostId === host.hostId &&
          current.deviceId === host.deviceId &&
          current.credential === host.credential,
      );
    for (const route of host.routes) {
      if (!stillPaired()) throw new BotCreationFailure('target-unpaired');
      const client = createHostClient({ ...host, routes: [route], carrier });
      try {
        const result = await client.call<unknown>(method, {
          ...operation.input,
          operationKey: operation.operationKey,
        });
        if (!stillPaired()) throw new BotCreationFailure('target-unpaired');
        if (typeof result !== 'object' || result === null || !('receipt' in result))
          throw new BotCreationFailure(
            method === 'createLookup' ? 'host-update-required' : 'invalid-receipt',
          );
        const receipt = creationReceipt(result.receipt, operation.operationKey);
        if (method === 'create' && receipt === null)
          throw new BotCreationFailure('invalid-receipt');
        return receipt;
      } catch (error) {
        if (error instanceof BotCreationFailure) throw error;
        const refusal = deviceRefusal(error);
        if (refusal) throw new BotCreationFailure(refusal);
        if (error instanceof MethodRefused)
          throw new BotCreationFailure(
            method === 'createLookup' &&
              /not.?found|unknown.?method|method.?unknown|unsupported/u.test(
                error.code.toLowerCase(),
              )
              ? 'host-update-required'
              : error.code,
          );
      } finally {
        client.stop();
      }
    }
    throw new BotCreationFailure('unreachable');
  };
  return {
    deviceId: (id) => hosts().find((host) => host.hostId === id)?.deviceId,
    lookup: (operation) => call(operation, 'createLookup'),
    async create(operation) {
      const receipt = await call(operation, 'create');
      if (receipt === null) throw new BotCreationFailure('invalid-receipt');
      return receipt;
    },
  };
}
