import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const SCRUBBED_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'content-encoding',
  'content-length',
  'transfer-encoding',
] as const;

export function scrubFramingHeaders(headers: Headers): Headers {
  const scrubbed = new Headers(headers);
  for (const name of SCRUBBED_HEADERS) scrubbed.delete(name);
  return scrubbed;
}

export function joinUpstream(base: URL, requestUrl: URL, prefix: string): URL {
  const relative = requestUrl.pathname.startsWith(prefix)
    ? requestUrl.pathname.slice(prefix.length)
    : requestUrl.pathname;
  const target = new URL(base.href);
  const basePath = target.pathname.endsWith('/') ? target.pathname.slice(0, -1) : target.pathname;
  target.pathname = `${basePath}${relative.startsWith('/') ? relative : `/${relative}`}`;
  target.search = requestUrl.search;
  return target;
}

export function viewerUpgradePaths(prefix: string): readonly string[] {
  return [`${prefix}/api/websockets`, `${prefix}/websockets`, `${prefix}/websocket`];
}

export interface ViewerProxyOptions {
  readonly upstream: () => URL | undefined;
  readonly prefix: string;
  readonly fetchImpl?: typeof fetch;
}

export class ViewerProxy {
  constructor(private readonly options: ViewerProxyOptions) {}

  async handle(request: Request): Promise<Response> {
    const upstream = this.options.upstream();
    if (upstream === undefined) {
      return new Response('viewer is not running', { status: 503 });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }
    const target = joinUpstream(upstream, new URL(request.url), this.options.prefix);
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(target, {
      method: request.method,
      redirect: 'manual',
      headers: { 'accept-encoding': 'identity' },
    });
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: scrubFramingHeaders(response.headers),
    });
  }
}

export interface UpgradeProxyOptions {
  readonly upstream: URL;
  readonly prefix: string;
  readonly request: IncomingMessage;
  readonly socket: Duplex;
  readonly head: Buffer;
}

export function proxyUpgrade(options: UpgradeProxyOptions): void {
  const requestUrl = new URL(options.request.url ?? '/', 'http://127.0.0.1');
  const target = joinUpstream(options.upstream, requestUrl, options.prefix);
  if (target.protocol !== 'http:') {
    options.socket.destroy();
    return;
  }
  const headers = { ...options.request.headers, host: target.host };
  delete headers.cookie;
  delete headers.authorization;
  delete headers['proxy-authorization'];
  const upstreamRequest = httpRequest({
    hostname: target.hostname,
    port: target.port,
    method: options.request.method,
    path: `${target.pathname}${target.search}`,
    headers,
  });
  upstreamRequest.on('upgrade', (response, upstreamSocket, upstreamHead) => {
    const status = response.statusCode ?? 101;
    const lines = [`HTTP/1.1 ${status} ${response.statusMessage ?? 'Switching Protocols'}`];
    for (const [key, value] of Object.entries(response.headers)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${item}`);
    }
    options.socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (upstreamHead.length > 0) options.socket.write(upstreamHead);
    if (options.head.length > 0) upstreamSocket.write(options.head);
    upstreamSocket.on('error', () => options.socket.destroy());
    options.socket.on('error', () => upstreamSocket.destroy());
    options.socket.once('close', () => upstreamSocket.destroy());
    upstreamSocket.once('close', () => options.socket.destroy());
    upstreamSocket.pipe(options.socket);
    options.socket.pipe(upstreamSocket);
  });
  upstreamRequest.setTimeout(10_000, () => upstreamRequest.destroy());
  upstreamRequest.on('response', (response) => {
    response.resume();
    options.socket.destroy();
  });
  options.socket.once('close', () => upstreamRequest.destroy());
  upstreamRequest.on('error', () => options.socket.destroy());
  upstreamRequest.end();
}
