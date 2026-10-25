import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const DEVICE_ROUTE_HEADER = 'x-botharness-device-route';
const connectTag = randomBytes(32).toString('base64url');

export function stampConnectRoute(request: IncomingMessage): void {
  request.headers[DEVICE_ROUTE_HEADER] = connectTag;
  const headers: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === DEVICE_ROUTE_HEADER) continue;
    headers.push(request.rawHeaders[index]!, request.rawHeaders[index + 1]!);
  }
  headers.push(DEVICE_ROUTE_HEADER, connectTag);
  request.rawHeaders = headers;
}

export function isConnectRequest(request: Pick<IncomingMessage, 'headers'>): boolean {
  return request.headers[DEVICE_ROUTE_HEADER] === connectTag;
}

export function forwardDeviceRoute(request: IncomingMessage): Record<string, string> {
  return isConnectRequest(request) ? { [DEVICE_ROUTE_HEADER]: connectTag } : {};
}
