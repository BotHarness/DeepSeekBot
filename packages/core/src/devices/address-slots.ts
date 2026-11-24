import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { isAddressRouteRequest } from './route-context.js';

export const ADDRESS_PENDING_LIMIT = 8;

export type AddressSlot = { release(): void };

export function createAddressSlots(limit = ADDRESS_PENDING_LIMIT) {
  let pending = 0;
  return (request: IncomingMessage, socket: Duplex): AddressSlot | 'full' | undefined => {
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
}
