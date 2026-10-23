import { createHostClient, deviceRefusal, MethodRefused } from './client';
import type { HostCarrier } from './carrier';
import type { SavedHost } from './hosts';
import {
  BotCreationFailure,
  creationReceipt,
  gitImportSource,
  type BotCreationOperation,
  type BotCreationPort,
} from './bot-creation';

export function botCreationTransport(
  hosts: () => readonly SavedHost[],
  carrier: HostCarrier,
): BotCreationPort {
  const request = async (
    operation: { hostId: string; deviceId: string },
    method: string,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
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
        const result = await client.call<unknown>(method, args);
        if (!stillPaired()) throw new BotCreationFailure('target-unpaired');
        return result;
      } catch (error) {
        if (error instanceof BotCreationFailure) throw error;
        const refusal = deviceRefusal(error);
        if (refusal) throw new BotCreationFailure(refusal);
        if (error instanceof MethodRefused)
          throw new BotCreationFailure(
            (method === 'createLookup' ||
              method === 'botImportLookup' ||
              method === 'botImportPreview') &&
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
  const call = async (operation: BotCreationOperation, lookup: boolean) => {
    const method = operation.source
      ? lookup
        ? 'botImportLookup'
        : 'createFromGit'
      : lookup
        ? 'createLookup'
        : 'create';
    const result = await request(operation, method, {
      ...operation.input,
      operationKey: operation.operationKey,
      ...(operation.source
        ? {
            gitUrl: operation.source.gitUrl,
            expectedCommit: operation.source.commit,
            ...(operation.source.origin ? { origin: operation.source.origin } : {}),
          }
        : {}),
    });
    if (typeof result !== 'object' || result === null || !('receipt' in result))
      throw new BotCreationFailure(lookup ? 'host-update-required' : 'invalid-receipt');
    return creationReceipt(result.receipt, operation.operationKey);
  };
  return {
    deviceId: (id) => hosts().find((host) => host.hostId === id)?.deviceId,
    async preview(target, gitUrl) {
      const result = await request(target, 'botImportPreview', { gitUrl });
      if (typeof result !== 'object' || result === null || !('source' in result))
        throw new BotCreationFailure('host-update-required');
      return gitImportSource(result.source);
    },
    lookup: (operation) => call(operation, true),
    async create(operation) {
      const receipt = await call(operation, false);
      if (receipt === null) throw new BotCreationFailure('invalid-receipt');
      return receipt;
    },
  };
}
