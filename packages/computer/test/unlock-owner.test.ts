import { expect, it, vi } from 'vitest';
import type { ComputerUnlockReply } from '../src/unlock-contract.js';
import { createComputerUnlockOwner } from '../src/unlock-owner.js';

it('forwards only bounded ciphertext through the paused unlock owner and audits the fixed result', async () => {
  const native = vi.fn(async (): Promise<ComputerUnlockReply> => ({ code: 'ok', receipt: 'T0s=' }));
  const runUnlock = vi.fn(
    async (operation: (signal: AbortSignal) => Promise<ComputerUnlockReply>, signal: AbortSignal) =>
      operation(signal),
  );
  const audit = vi.fn();
  const owner = createComputerUnlockOwner({ enabled: () => true, runUnlock, audit, native });
  const caller = { host: 'mac', device: 'iphone' };
  const signal = new AbortController().signal;
  const command = { kind: 'finish', operation: 'unlock', packet: 'Q0lQSEVS' };
  await expect(owner.handle(caller, { ...command, plaintext: 'fixture' }, signal)).resolves.toEqual(
    { code: 'invalid' },
  );
  expect(native).not.toHaveBeenCalled();
  await expect(owner.handle(caller, command, signal)).resolves.toEqual({
    code: 'ok',
    receipt: 'T0s=',
  });
  expect(runUnlock).toHaveBeenCalledOnce();
  expect(native).toHaveBeenCalledWith(command, caller, signal);
  expect(audit).toHaveBeenCalledExactlyOnceWith('iphone', 'ok');
});
