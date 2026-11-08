import type { Server } from 'node:http';
export function createPrivateRelay(options: { directory: string; bootstrap: string }): {
  server: Server;
  close(): void;
};
