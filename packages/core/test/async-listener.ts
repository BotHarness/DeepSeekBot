import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

import { afterEach } from 'vitest';

const failures: unknown[] = [];

afterEach(() => {
  const [failure] = failures.splice(0);
  if (failure !== undefined)
    throw failure instanceof Error
      ? failure
      : new Error('async listener rejected', { cause: failure });
});

export function requestListener(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<unknown>,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    handler(request, response).catch((error: unknown) => {
      failures.push(error);
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' });
      response.end(error instanceof Error ? error.message : String(error));
    });
  };
}

export function upgradeListener(gateway: {
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<unknown>;
}): (request: IncomingMessage, socket: Duplex, head: Buffer) => void {
  return (request, socket, head) => {
    gateway.upgrade(request, socket, head).catch((error: unknown) => {
      failures.push(error);
      socket.destroy();
    });
  };
}
