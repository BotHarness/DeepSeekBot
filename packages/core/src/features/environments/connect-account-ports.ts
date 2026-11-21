import { createServer, type AddressInfo } from 'node:net';

import type { DeviceConnect } from '../../devices/connect.js';

export function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export function originPort(connect: DeviceConnect): number | undefined {
  const origin = connect.status().origin;
  if (origin === undefined) return undefined;
  const port = Number(new URL(origin).port);
  return Number.isInteger(port) && port > 0 ? port : undefined;
}
