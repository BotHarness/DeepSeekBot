import { expect, it, vi } from 'vitest';
import type { ComputerUnlockOwner } from '../../computer/src/unlock-contract.js';
import { dispatchComputerUnlock } from '../src/devices/computer-unlock-channel.js';

it.each([false, true])(
  'dispatches only admitted owner LAN requests (owner LAN = %s)',
  async (ownerLan) => {
    const handle = vi.fn<ComputerUnlockOwner['handle']>(async () => ({
      code: 'ready',
      locked: true,
    }));
    const send = vi.fn<(message: Record<string, unknown>) => void>();
    const caller = { host: 'mac', device: 'phone' };
    const requests = new Map<string, () => void>();
    dispatchComputerUnlock({
      owner: { handle, status: async () => ({ code: 'ready', locked: true }) },
      ownerLan,
      caller,
      requests,
      id: 'ready',
      input: { method: 'POST', body: '{"kind":"status"}' },
      send,
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    const answer: unknown = JSON.parse(
      Buffer.from(String(send.mock.calls[0]?.[0]?.['body']), 'base64').toString(),
    );
    if (ownerLan) {
      expect(answer).toEqual({ code: 'ready', locked: true });
      expect(handle).toHaveBeenCalledExactlyOnceWith(
        caller,
        { kind: 'status' },
        expect.any(AbortSignal),
      );
    } else {
      expect(answer).toEqual({ code: 'unavailable' });
      expect(handle).not.toHaveBeenCalled();
    }
    expect(requests.size).toBe(0);
  },
);
