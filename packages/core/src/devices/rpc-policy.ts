import type { IncomingMessage, ServerResponse } from 'node:http';

import { secretRouteRefusal } from '../bridge/secret-route.js';
import { isConnectRequest } from './route-context.js';

export async function refuseConnectRpc(
  request: IncomingMessage,
  response: ServerResponse,
  endpoint: string,
  refused: () => void,
): Promise<boolean> {
  const error = isConnectRequest(request) ? secretRouteRefusal(endpoint) : undefined;
  if (error === undefined) return false;
  refused();
  let size = 0;
  const chunks: Buffer[] = [];
  let rpcId = '';
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += (chunk as Buffer).length;
    if (size > 1024 * 1024) {
      request.resume();
      response.writeHead(413, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        connection: 'close',
      });
      response.end(JSON.stringify({ code: error.code }));
      return true;
    }
    chunks.push(chunk as Buffer);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (
      body !== null &&
      typeof body === 'object' &&
      'rpcId' in body &&
      typeof body.rpcId === 'string'
    )
      rpcId = body.rpcId;
  } catch {}
  response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ type: 'server-response', rpcId, result: { ok: false, error } }));
  return true;
}
