import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { isAddressRouteRequest, isConnectRequest, isManagedTlsRequest } from './route-context.js';

export const OPEN_ROUTE_PENDING_LIMIT = 8;

export type OpenRoute = 'address' | 'connect' | 'managed-tls';

export type AdmissionSlot = { route: OpenRoute; release(): void };

function openRoute(request: IncomingMessage): OpenRoute | undefined {
  if (isAddressRouteRequest(request)) return 'address';
  if (isConnectRequest(request)) return 'connect';
  if (isManagedTlsRequest(request)) return 'managed-tls';
}

export function createAdmissionSlots(limit = OPEN_ROUTE_PENDING_LIMIT) {
  const pending = new Map<OpenRoute, number>();
  return (request: IncomingMessage, socket: Duplex): AdmissionSlot | 'full' | undefined => {
    const route = openRoute(request);
    if (!route) return;
    const count = pending.get(route) ?? 0;
    if (count >= limit) return 'full';
    pending.set(route, count + 1);
    let held = true;
    const slot = {
      route,
      release: () => {
        if (!held) return;
        held = false;
        pending.set(route, (pending.get(route) ?? 1) - 1);
      },
    };
    socket.once('close', slot.release);
    return slot;
  };
}
