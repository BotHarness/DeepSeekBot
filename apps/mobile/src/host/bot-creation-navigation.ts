import type { CreationSnapshot } from './bot-creation';

export async function openBotCreationResult(
  port: {
    recover(): Promise<void>;
    snapshot(): CreationSnapshot;
    deviceId(hostId: string): string | undefined;
    switchHost(hostId: string): Promise<boolean>;
    open(hostId: string, slug: string): Promise<void>;
    acknowledge(key: string): Promise<void>;
  },
  stillHere: () => boolean,
): Promise<boolean> {
  if (!stillHere()) return false;
  await port.recover();
  const state = port.snapshot();
  if (
    !stillHere() ||
    state.error ||
    state.record.kind !== 'submitted' ||
    state.receipt?.status !== 'created'
  )
    return false;
  const operation = state.record.operation;
  if (port.deviceId(operation.hostId) !== operation.deviceId) return false;
  if (
    !(await port.switchHost(operation.hostId)) ||
    !stillHere() ||
    port.deviceId(operation.hostId) !== operation.deviceId
  )
    return false;
  await port.open(operation.hostId, state.receipt.botSlug);
  await port.acknowledge(operation.operationKey);
  return true;
}
