import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { isAddressRouteRequest } from './route-context.js';

export const ADDRESS_PENDING_LIMIT = 8;

export type AddressSlot = { release(): void };

export function createAddressRoute(limit = ADDRESS_PENDING_LIMIT) {
  let pending = 0;
  const waiting = new Map<string, () => void>();
  const slot = (request: IncomingMessage, socket: Duplex): AddressSlot | 'full' | undefined => {
    if (!isAddressRouteRequest(request)) return;
    if (pending >= limit) return 'full';
    pending++;
    let held = true;
    const slot = {
      release: () => {
        if (!held) return;
        held = false;
        pending--;
      },
    };
    socket.once('close', slot.release);
    return slot;
  };
  const wait = (receipt: string, unwatch: () => void, replace: () => void) => {
    const older = waiting.get(receipt);
    waiting.set(receipt, replace);
    older?.();
    return () => {
      unwatch();
      if (waiting.get(receipt) === replace) waiting.delete(receipt);
    };
  };
  return { slot, wait };
}
