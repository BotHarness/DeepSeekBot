import type { Server } from 'node:http';
export const PROTOCOL_V1: 'botharness-private-v1';
export const PROTOCOL_V2: 'botharness-private-v2';
export function readHostKeys(file: string): Map<string, string>;
export function createPrivateRelay(options: {
  directory: string;
  bootstrap: string;
  hostKeys?: () => Map<string, string>;
}): {
  server: Server;
  close(): void;
};
