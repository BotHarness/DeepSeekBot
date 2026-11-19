import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export function engineGatewayResult(value: unknown): EngineGatewayCallResult {
  if (typeof value === 'string') return { text: value, isError: false };
  const content =
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { content?: unknown }).content)
      ? ((value as { content: unknown[] }).content.filter(
          (part) =>
            typeof part === 'object' &&
            part !== null &&
            (((part as { type?: unknown }).type === 'text' &&
              typeof (part as { text?: unknown }).text === 'string') ||
              ((part as { type?: unknown }).type === 'image' &&
                typeof (part as { data?: unknown }).data === 'string' &&
                typeof (part as { mimeType?: unknown }).mimeType === 'string')),
        ) as EngineGatewayCallResult['content'])
      : undefined;
  if (content !== undefined && content.length > 0)
    return {
      text: content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'),
      content,
      isError: (value as { isError?: unknown }).isError === true,
    };
  return { text: JSON.stringify(value) ?? 'null', isError: false };
}

export interface EngineGatewayTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type EngineGatewayContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface EngineGatewayCallResult {
  text: string;
  content?: readonly EngineGatewayContent[];
  isError: boolean;
}

export interface EngineGrantSpec {
  botSlug: string;
  sessionId: string;
  tools: readonly EngineGatewayTool[];
  channelId(): string | undefined;
  channelless?: boolean;
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
  channelless = false,
): string | undefined {
  if (channelId === undefined && !channelless) return 'session-not-running';
  const nested = args['arguments'];
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    const refusal = gatewayScopeRefusal(nested as Record<string, unknown>, channelId, channelless);
    if (refusal !== undefined) return refusal;
  }
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

class BodyTooLarge extends Error {}

const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/u;

function envelope(value: unknown): JsonRpc | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const message = value as Record<string, unknown>;
  const id = message['id'];
  const params = message['params'];
  if (message['jsonrpc'] !== '2.0' || typeof message['method'] !== 'string') return undefined;
  if (id !== undefined && id !== null && typeof id !== 'string' && typeof id !== 'number')
    return undefined;
  if (params !== undefined && (typeof params !== 'object' || params === null)) return undefined;
  return message as JsonRpc;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        chunks.length = 0;
        request.removeAllListeners('data');
        request.resume();
        reject(new BodyTooLarge());
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
  let starting: Promise<string> | undefined;

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
    const rawArgs = params['arguments'] ?? {};
    if (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs))
      return rpcError(message.id, -32602, 'Tool arguments must be an object');
    const args = rawArgs as Record<string, unknown>;
    if (typeof name !== 'string' || !grant.spec.tools.some((tool) => tool.name === name))
      return rpcError(message.id, -32602, `Unknown tool ${String(name)}`);
    const refusal = gatewayScopeRefusal(
      args,
      grant.spec.channelId(),
      grant.spec.channelless === true,
    );
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
      result: {
        content:
          'content' in result && result.content !== undefined
            ? result.content.map((part) => ({ ...part }))
            : [{ type: 'text', text: result.text }],
        isError: result.isError,
      },
    };
  };

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') {
      send(response, 405);
      return;
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !LOOPBACK_ORIGIN.test(origin)) {
      send(response, 403, rpcError(null, -32001, 'Origin is not allowed'));
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
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        response.setHeader('connection', 'close');
        send(response, 413, rpcError(null, -32600, 'Request body is too large'));
      } else send(response, 400, rpcError(null, -32700, 'Parse error'));
      return;
    }
    const controller = new AbortController();
    response.on('close', () => controller.abort());
    const messages: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    const replies: unknown[] = [];
    for (const raw of messages) {
      if (controller.signal.aborted) break;
      const message = envelope(raw);
      if (message === undefined) {
        replies.push(rpcError(null, -32600, 'Invalid Request'));
        continue;
      }
      if (message.id === undefined || message.id === null) continue;
      replies.push(
        grants.get(grant.path) === grant
          ? await answer(grant, message, controller.signal)
          : rpcError(message.id, -32001, 'Engine gateway token is not valid here'),
      );
    }
    if (replies.length === 0) send(response, 202);
    else send(response, 200, Array.isArray(parsed) ? replies : replies[0]);
  };

  return {
    start: () => {
      if (base !== undefined) return Promise.resolve(base);
      starting ??= (async () => {
        const listening = createServer((request, response) => {
          handle(request, response).catch(() => {
            if (!response.headersSent)
              send(response, 500, rpcError(null, -32603, 'Internal error'));
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
      })().finally(() => {
        starting = undefined;
      });
      return starting;
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
      await starting?.catch(() => undefined);
      grants.clear();
      const closing = server;
      server = undefined;
      base = undefined;
      if (closing !== undefined)
        await new Promise<void>((resolve) => closing.close(() => resolve()));
    },
  };
}
