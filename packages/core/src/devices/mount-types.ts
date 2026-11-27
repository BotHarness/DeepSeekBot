import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

export interface ConnectionLike {
  fetch: {
    register(route: {
      path: string;
      methods: readonly ('GET' | 'POST')[];
      requestBody: 'buffered' | 'streaming';
      fetch(request: Request): Promise<Response>;
    }): () => Promise<void>;
  };
  authenticatedUrl(baseUrl: string): string;
}

export interface WebServerLike {
  readonly port: number;
  getOrigin?(): string;
  register(route: {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
  }): () => void;
  registerUpgrade(route: {
    path: string;
    handler: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
  }): () => void;
}

export function isDeviceRouteConnection(value: unknown): value is ConnectionLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'authenticatedUrl' in value &&
    typeof value.authenticatedUrl === 'function' &&
    'fetch' in value &&
    typeof value.fetch === 'object' &&
    value.fetch !== null &&
    'register' in value.fetch &&
    typeof value.fetch.register === 'function'
  );
}

export function isDeviceRouteWebServer(value: unknown): value is WebServerLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'port' in value &&
    typeof value.port === 'number' &&
    (!('getOrigin' in value) ||
      value.getOrigin === undefined ||
      typeof value.getOrigin === 'function') &&
    'register' in value &&
    typeof value.register === 'function' &&
    'registerUpgrade' in value &&
    typeof value.registerUpgrade === 'function'
  );
}
