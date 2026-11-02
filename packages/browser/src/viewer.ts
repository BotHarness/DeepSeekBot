import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

import { ViewerProxy, proxyUpgrade, viewerUpgradePaths } from '../../core/src/http/viewer-proxy.js';

export interface BrowserViewerHost {
  register(route: {
    kind: 'prefix';
    path: string;
    handler(request: IncomingMessage, response: ServerResponse): Promise<void>;
  }): () => void;
  registerUpgrade(route: {
    path: string;
    handler(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  }): () => void;
}

function headersOf(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const entry of value) headers.append(key, entry);
    else if (value !== undefined) headers.set(key, value);
  }
  return headers;
}

export function registerBrowserViewer(options: {
  host: BrowserViewerHost;
  prefix: string;
  upstream: () => URL | undefined;
  rejection: (headers: Headers) => number | undefined;
}): () => void {
  const proxy = new ViewerProxy({ prefix: options.prefix, upstream: options.upstream });
  const sockets = new Set<Duplex>();
  const release = [
    options.host.register({
      kind: 'prefix',
      path: options.prefix,
      async handler(request, response) {
        const rejection = options.rejection(headersOf(request));
        if (rejection !== undefined) {
          response.writeHead(rejection);
          response.end();
          return;
        }
        try {
          const proxied = await proxy.handle(
            new Request(new URL(request.url ?? '/', 'http://127.0.0.1'), {
              method: request.method ?? 'GET',
            }),
          );
          const headers: Record<string, string> = {};
          proxied.headers.forEach((value, key) => {
            headers[key] = value;
          });
          response.writeHead(proxied.status, headers);
          response.end(
            proxied.body === null ? undefined : Buffer.from(await proxied.arrayBuffer()),
          );
        } catch {
          response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
          response.end('Container browser viewer unavailable');
        }
      },
    }),
  ];
  try {
    for (const path of viewerUpgradePaths(options.prefix)) {
      release.push(
        options.host.registerUpgrade({
          path,
          handler(request, socket, head) {
            const upstream = options.upstream();
            if (options.rejection(headersOf(request)) !== undefined || upstream === undefined) {
              socket.destroy();
              return;
            }
            sockets.add(socket);
            socket.once('close', () => sockets.delete(socket));
            proxyUpgrade({ upstream, prefix: options.prefix, request, socket, head });
          },
        }),
      );
    }
  } catch (error) {
    for (const dispose of release.reverse()) dispose();
    throw error;
  }
  return () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    for (const dispose of release.reverse()) dispose();
  };
}
