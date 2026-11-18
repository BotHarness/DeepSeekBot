import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface EngineGatewayTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface EngineGatewayCallResult {
  text: string;
  isError: boolean;
}

export interface EngineGrantSpec {
  botSlug: string;
  sessionId: string;
  tools: readonly EngineGatewayTool[];
  channelId(): string | undefined;
  call(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<EngineGatewayCallResult>;
}

export interface EngineGrant {
  url: string;
  token: string;
  revoke(): void;
}

export interface EngineGateway {
  start(): Promise<string>;
  grant(spec: EngineGrantSpec): EngineGrant;
  close(): Promise<void>;
}

const OUT_OF_SCOPE_ARGUMENTS = ['human_id', 'bot_id', 'binding_id', 'conversation_id', 'grant_id'];
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 1_000_000;

export function gatewayScopeRefusal(
  args: Record<string, unknown>,
  channelId: string | undefined,
): string | undefined {
  if (channelId === undefined) return 'session-not-running';
  const requested = args['channel_id'];
  if (requested !== undefined && requested !== channelId) return 'channel-out-of-scope';
  if (args['scope'] === 'joined') return 'channel-out-of-scope';
  for (const key of OUT_OF_SCOPE_ARGUMENTS)
    if (args[key] !== undefined) return 'destination-out-of-scope';
  return undefined;
}

interface StoredGrant {
  spec: EngineGrantSpec;
  token: Buffer;
  path: string;
}

type JsonRpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };

const rpcError = (id: JsonRpc['id'], code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
});

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function createEngineGateway(): EngineGateway {
  const grants = new Map<string, StoredGrant>();
  let server: Server | undefined;
  let base: string | undefined;

  const send = (response: ServerResponse, status: number, body?: unknown) => {
    response.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' });
    response.end(body === undefined ? undefined : JSON.stringify(body));
  };

  const authorize = (request: IncomingMessage): StoredGrant | undefined => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    const stored = grants.get(path);
    const header = request.headers.authorization ?? '';
    const presented = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '', 'utf8');
    if (stored === undefined) return undefined;
    if (presented.length !== stored.token.length) return undefined;
    return timingSafeEqual(presented, stored.token) ? stored : undefined;
  };

  const answer = async (
    grant: StoredGrant,
    message: JsonRpc,
    signal: AbortSignal,
  ): Promise<unknown> => {
    const params = (message.params ?? {}) as Record<string, unknown>;
    if (message.method === 'initialize') {
      const asked = params['protocolVersion'];
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion:
            typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked)
              ? asked
              : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'deepseekbot', version: '1' },
        },
      };
    }
    if (message.method === 'ping') return { jsonrpc: '2.0', id: message.id, result: {} };
    if (message.method === 'tools/list')
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: { tools: grant.spec.tools.map((tool) => ({ ...tool })) },
      };
    if (message.method !== 'tools/call')
      return rpcError(message.id, -32601, `Method ${String(message.method)} not found`);
    const name = params['name'];
    const args = (params['arguments'] ?? {}) as Record<string, unknown>;
    if (typeof name !== 'string' || !grant.spec.tools.some((tool) => tool.name === name))
      return rpcError(message.id, -32602, `Unknown tool ${String(name)}`);
    const refusal = gatewayScopeRefusal(args, grant.spec.channelId());
    const result =
      refusal !== undefined
        ? { text: `refused: ${refusal}`, isError: true }
        : await grant.spec.call(name, args, signal).catch((error: unknown) => ({
            text: error instanceof Error ? error.message : String(error),
            isError: true,
          }));
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: { content: [{ type: 'text', text: result.text }], isError: result.isError },
    };
  };

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') {
      send(response, 405);
      return;
    }
    const grant = authorize(request);
    if (grant === undefined) {
      send(response, 401, rpcError(null, -32001, 'Engine gateway token is not valid here'));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(request));
    } catch {
      send(response, 400, rpcError(null, -32700, 'Parse error'));
      return;
    }
    const controller = new AbortController();
    response.on('close', () => controller.abort());
    const messages = (Array.isArray(parsed) ? parsed : [parsed]) as JsonRpc[];
    const replies: unknown[] = [];
    for (const message of messages) {
      if (message.id === undefined || message.id === null) continue;
      replies.push(await answer(grant, message, controller.signal));
    }
    if (replies.length === 0) send(response, 202);
    else send(response, 200, Array.isArray(parsed) ? replies : replies[0]);
  };

  return {
    start: async () => {
      if (base !== undefined) return base;
      const listening = createServer((request, response) => {
        handle(request, response).catch(() => {
          if (!response.headersSent) send(response, 500, rpcError(null, -32603, 'Internal error'));
        });
      });
      await new Promise<void>((resolve, reject) => {
        listening.once('error', reject);
        listening.listen(0, '127.0.0.1', () => resolve());
      });
      listening.unref();
      server = listening;
      base = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
      return base;
    },
    grant: (spec) => {
      if (base === undefined) throw new Error('Engine gateway is not started');
      const path = `/mcp/${encodeURIComponent(spec.botSlug)}/${encodeURIComponent(spec.sessionId)}`;
      const token = randomBytes(32).toString('base64url');
      const stored: StoredGrant = { spec, token: Buffer.from(token, 'utf8'), path };
      grants.set(path, stored);
      return {
        url: `${base}${path}`,
        token,
        revoke: () => {
          if (grants.get(path) === stored) grants.delete(path);
        },
      };
    },
    close: async () => {
      grants.clear();
      const closing = server;
      server = undefined;
      base = undefined;
      if (closing !== undefined)
        await new Promise<void>((resolve) => closing.close(() => resolve()));
    },
  };
}
