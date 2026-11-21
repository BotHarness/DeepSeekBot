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
