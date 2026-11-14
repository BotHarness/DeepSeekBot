import { isIPv4 } from 'node:net';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway';
import { viewerCarrierScript } from '@deepseek-ai/dsh-experimental-liveshare-protocol';
import { z } from 'zod';
import { renderTeamSignInPage } from '../../../client/src/shared/team-sign-in-page.js';
import { isConnectRequest } from '../devices/route-context.js';
import { TeamError, type TeamService } from './service.js';

export const TEAM_PATH = '/botharness-device/team';
export const MEMBER_COOKIE = 'botharness-member';
const rpcSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('call'),
    path: z.string(),
    body: z.object({
      type: z.literal('client-request'),
      rpcId: z.string(),
      method: z.string(),
      payload: z.object({ args: z.record(z.string(), z.unknown()).optional() }).optional(),
    }),
  }),
  z.object({
    op: z.literal('stream-open'),
    id: z.number().int().positive(),
    endpoint: z.string(),
    payload: z.unknown(),
  }),
  z.object({ op: z.literal('stream-next'), id: z.number().int().positive() }),
  z.object({ op: z.literal('stream-cancel'), id: z.number().int().positive() }),
]);

export interface TeamHttp {
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>;
  close(): Promise<void>;
}
export interface TeamHttpOptions {
  team: TeamService;
  gateway: TypertGateway;
  hostName: () => string;
  tls: () => boolean;
  readResource(request: Request, peer: PeerScope): Promise<Response>;
  fetchBundle(request: Request): Promise<Response>;
}

function header(request: IncomingMessage, key: string): string | undefined {
  const value = request.headers[key];
  return Array.isArray(value) ? value[0] : value;
}
export function passwordTransportAllowed(
  request: IncomingMessage,
  options: Pick<TeamHttpOptions, 'tls' | 'team'>,
): boolean {
  const ip = request.socket.remoteAddress;
  const address = ip?.startsWith('::ffff:') ? ip.slice(7) : ip;
  const proxy = ['forwarded', 'x-forwarded-for', 'x-real-ip', 'via'].some((name) =>
    Object.hasOwn(request.headers, name),
  );
  return (
    (!proxy && (ip === '::1' || (isIPv4(address ?? '') && address?.startsWith('127.')))) ||
    options.tls() ||
    isConnectRequest(request) ||
    options.team.mode(options.team.ownerContext()).insecureHttpAllowed
  );
}
function token(request: IncomingMessage): string | undefined {
  return header(request, 'cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${MEMBER_COOKIE}=`))
    ?.slice(MEMBER_COOKIE.length + 1);
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    if (!(chunk instanceof Buffer)) throw new TeamError('invalid-input');
    length += chunk.length;
    if (length > 1024 * 1024) throw new TeamError('invalid-input');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new TeamError('invalid-input');
  }
}
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}
function sameOrigin(request: IncomingMessage, tls: boolean): boolean {
  const origin = header(request, 'origin');
  if (
    request.method === 'GET' &&
    [TEAM_PATH, `${TEAM_PATH}/`].includes(
      new URL(request.url ?? '/', 'http://member.invalid').pathname,
    ) &&
    header(request, 'sec-fetch-mode') === 'navigate' &&
    header(request, 'sec-fetch-dest') === 'document'
  )
    return true;
  if (!origin) return header(request, 'sec-fetch-site') !== 'cross-site';
  try {
    const parsed = new URL(origin);
    return (
      parsed.host === header(request, 'host') &&
      parsed.protocol === (tls || isConnectRequest(request) ? 'https:' : 'http:')
    );
  } catch {
    return false;
  }
}

export function createTeamHttp(options: TeamHttpOptions): TeamHttp {
  const failure = (error: unknown) =>
    error instanceof TeamError
      ? { code: error.code, message: error.code, details: {} }
      : options.gateway.wireStream.failure(error);
  const streams = new Map<
    string,
    {
      peer: PeerScope;
      iterator: AsyncIterator<unknown>;
      controller: AbortController;
      next?: Promise<IteratorResult<unknown>>;
      lastSeen: number;
      polling: boolean;
    }
  >();
  const pending = new Map<string, { peer: PeerScope; controller: AbortController }>();
  const cancel = async (key: string): Promise<void> => {
    const opening = pending.get(key);
    pending.delete(key);
    opening?.controller.abort();
    const stream = streams.get(key);
    if (!stream) return;
    streams.delete(key);
    stream.controller.abort();
    await stream.iterator.return?.();
  };
  const sweep = setInterval(() => {
    for (const [key, stream] of streams)
      if (stream.peer.signal.aborted || Date.now() - stream.lastSeen > 120_000)
        void cancel(key).catch(() => {});
  }, 30_000);
  sweep.unref();
  const rpc = async (request: IncomingMessage, peer: PeerScope): Promise<unknown> => {
    const command = rpcSchema.parse(await body(request));
    if (command.op === 'call') {
      const endpoint = command.path.replace(/^\/api\//u, '');
      const [namespace, method, tail] = endpoint.split('/');
      const rpcId = command.body.rpcId;
      try {
        if (
          !command.path.startsWith('/api/') ||
          !namespace ||
          !method ||
          tail !== undefined ||
          command.body.method !== endpoint
        )
          throw new TeamError('invalid-input');
        options.team.assertCall(peer.principal, method);
        const invoke = () =>
          options.gateway.invoke({
            namespace,
            method,
            args: command.body.payload?.args ?? {},
            peer,
            signal: peer.signal,
          });
        const changingPassword = namespace === 'botharness' && method === 'memberPasswordChange';
        if (changingPassword && !passwordTransportAllowed(request, options))
          throw new TeamError('insecure-transport');
        const value =
          changingPassword && peer.principal.kind === 'botharness-member'
            ? await options.team.withPasswordCaller(
                peer.principal,
                request.socket.remoteAddress ?? 'unknown',
                invoke,
              )
            : await invoke();
        return { type: 'server-response', rpcId, result: { ok: true, value } };
      } catch (error) {
        return {
          type: 'server-response',
          rpcId,
          result: { ok: false, error: failure(error) },
        };
      }
    }
    const key = `${peer.id}:${command.id}`;
    if (command.op === 'stream-cancel') {
      await cancel(key);
      return { end: true };
    }
    if (command.op === 'stream-open') {
      if (
        streams.has(key) ||
        pending.has(key) ||
        [...streams.values(), ...pending.values()].filter((stream) => stream.peer === peer)
          .length >= 16 ||
        streams.size + pending.size >= 256
      )
        throw new TeamError('rate-limited');
      const controller = new AbortController();
      const reservation = { peer, controller };
      pending.set(key, reservation);
      try {
        const signal = AbortSignal.any([peer.signal, controller.signal]);
        options.team.assertCall(peer.principal, command.endpoint.split('/').at(-1) ?? '');
        const iterable = await options.gateway.wireStream.open(
          command.endpoint,
          command.payload,
          (async function* () {})(),
          peer,
          signal,
        );
        const iterator = iterable[Symbol.asyncIterator]();
        if (signal.aborted || pending.get(key) !== reservation) {
          await iterator.return?.();
          throw new TeamError('credentials-invalid');
        }
        streams.set(key, {
          peer,
          iterator,
          controller,
          lastSeen: Date.now(),
          polling: false,
        });
        return {};
      } catch (error) {
        controller.abort();
        return { failure: failure(error) };
      } finally {
        if (pending.get(key) === reservation) pending.delete(key);
      }
    }
    const stream = streams.get(key);
    if (!stream) throw new TeamError('stream-not-found');
    if (stream.polling) throw new TeamError('rate-limited');
    stream.lastSeen = Date.now();
    stream.polling = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      stream.next ??= Promise.resolve(stream.iterator.next());
      const result = await Promise.race([
        stream.next,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), 20_000);
        }),
      ]);
      if (!result) return { pending: true };
      delete stream.next;
      if (result.done) {
        await cancel(key);
        return { end: true };
      }
      return { value: result.value };
    } catch (error) {
      await cancel(key);
      return { failure: failure(error) };
    } finally {
      if (timer) clearTimeout(timer);
      stream.polling = false;
    }
  };

  return {
    async handle(request, response) {
      const url = new URL(request.url ?? '/', 'http://member.invalid');
      const path = url.pathname;
      const cookie = token(request);
      const peer = cookie ? options.team.admit(cookie) : undefined;
      try {
        if (!sameOrigin(request, options.tls())) throw new TeamError('origin-refused');
        if (path === `${TEAM_PATH}/sign-in` && request.method === 'POST') {
          if (!passwordTransportAllowed(request, options))
            throw new TeamError('insecure-transport');
          const input = z
            .object({ username: z.string().max(32), password: z.string().max(1024) })
            .parse(await body(request));
          const result = await options.team.signIn(
            input.username,
            input.password,
            request.socket.remoteAddress ?? 'unknown',
          );
          if (peer?.principal.kind === 'botharness-member')
            await options.team.revoke(peer.principal.grantId);
          const secure =
            options.tls() ||
            isConnectRequest(request) ||
            Boolean('encrypted' in request.socket && request.socket.encrypted);
          response.setHeader(
            'set-cookie',
            `${MEMBER_COOKIE}=${result.token}; Path=${TEAM_PATH}/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`,
          );
          return json(response, 200, {
            humanId: result.member.humanId,
            displayName: result.member.displayName,
            mustChangePassword: result.member.mustChangePassword,
          });
        }
        if (path === `${TEAM_PATH}/password` && request.method === 'POST') {
          if (!peer) throw new TeamError('credentials-invalid');
          if (!passwordTransportAllowed(request, options))
            throw new TeamError('insecure-transport');
          const input = z
            .object({
              current: z.string().max(1024),
              next: z.string(),
              signOutOthers: z.boolean().optional(),
            })
            .parse(await body(request));
          await options.team.changeWebPassword(
            peer.principal,
            input.current,
            input.next,
            request.socket.remoteAddress ?? 'unknown',
            input.signOutOthers,
          );
          return json(response, 200, {});
        }
        if (path === `${TEAM_PATH}/sign-out` && request.method === 'POST') {
          if (peer?.principal.kind === 'botharness-member')
            await options.team.revoke(peer.principal.grantId);
          response.setHeader(
            'set-cookie',
            `${MEMBER_COOKIE}=; Path=${TEAM_PATH}/; HttpOnly; SameSite=Strict; Max-Age=0`,
          );
          return json(response, 200, { revoked: true });
        }
        if ((path === TEAM_PATH || path === `${TEAM_PATH}/`) && request.method === 'GET') {
          if (path === TEAM_PATH) {
            response.writeHead(308, { location: `${TEAM_PATH}/`, 'cache-control': 'no-store' });
            response.end();
            return;
          }
          const member =
            peer?.principal.kind === 'botharness-member'
              ? options.team.member(peer.principal.humanId)
              : undefined;
          if (!peer || member?.mustChangePassword) {
            const nonce = randomBytes(24).toString('base64');
            response.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
              'x-frame-options': 'DENY',
              'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
            });
            response.end(
              renderTeamSignInPage({
                language: header(request, 'accept-language')?.startsWith('zh') ? 'zh' : 'en',
                hostName: options.hostName(),
                nonce,
                insecure: !passwordTransportAllowed(request, options),
                ...(member ? { step: 'change-password', displayName: member.displayName } : {}),
              }),
            );
            return;
          }
          const resource = await options.readResource(new Request('http://member.invalid/'), peer);
          if (!resource.ok) throw new TeamError('member-shell-unavailable');
          let html = await resource.text();
          const script = viewerCarrierScript({
            basePath: TEAM_PATH,
            shareId: '',
            sessionId: '',
            readTimeoutMs: 30_000,
          });
          html = html.replace(
            /<head([^>]*)>/iu,
            `<head$1><base href="${TEAM_PATH}/"><script>${script}</script>`,
          );
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'x-frame-options': 'DENY',
          });
          response.end(html);
          return;
        }
        if (!peer) throw new TeamError('credentials-invalid');
        if (path === `${TEAM_PATH}/__share/rpc` && request.method === 'POST')
          return json(response, 200, await rpc(request, peer));
        if (path.startsWith(`${TEAM_PATH}/api/`)) {
          options.team.assertCall(peer.principal, 'http');
          throw new TeamError('remote-access/denied');
        }
        const relative = path.slice(`${TEAM_PATH}/`.length);
        if (
          request.method !== 'GET' ||
          !path.startsWith(`${TEAM_PATH}/`) ||
          !/^(?:assets\/|plugins\/|favicon(?:-[a-z]+)?\.(?:svg|png|ico)$|icons\/)/u.test(
            relative,
          ) ||
          /(?:\.map|%2e|%2f|%5c)/iu.test(relative)
        )
          throw new TeamError('not-found');
        const assetRequest = new Request(`http://member.invalid/${relative}${url.search}`);
        const asset = relative.startsWith('plugins/')
          ? await options.fetchBundle(assetRequest)
          : await options.readResource(assetRequest, peer);
        response.writeHead(asset.status, {
          'content-type': asset.headers.get('content-type') ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        response.end(Buffer.from(await asset.arrayBuffer()));
      } catch (error) {
        const code =
          error instanceof TeamError
            ? error.code
            : error instanceof z.ZodError
              ? 'invalid-input'
              : 'internal';
        const status =
          code === 'credentials-invalid'
            ? 401
            : path === `${TEAM_PATH}/password` && code === 'password-weak'
              ? 400
              : path === `${TEAM_PATH}/password` && code === 'password-reused'
                ? 409
                : path === `${TEAM_PATH}/password` && code === 'invalid-input'
                  ? 400
                  : code === 'rate-limited'
                    ? 429
                    : code === 'not-found'
                      ? 404
                      : code === 'internal' || code === 'member-shell-unavailable'
                        ? 503
                        : 403;
        json(response, status, {
          code,
          ...(error instanceof TeamError && error.retryAfterSeconds
            ? { retryAfterSeconds: error.retryAfterSeconds }
            : {}),
        });
      }
    },
    async close() {
      clearInterval(sweep);
      await Promise.all([...new Set([...streams.keys(), ...pending.keys()])].map(cancel));
    },
  };
}
