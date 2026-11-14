import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { TeamError, type TeamService } from './service.js';
import type { MemberDevices } from './devices.js';
import { passwordTransportAllowed, readTeamBody, teamJson } from './http.js';

const PREFIX = '/botharness-device';
const SIGN_IN = `${PREFIX}/team/device-sign-in`;
const PASSWORD = `${PREFIX}/team/device-password`;
const rpcSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(256),
  method: z.string(),
  payload: z.object({ args: z.record(z.string(), z.unknown()).optional() }).optional(),
});
const frameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('open'),
    streamId: z.string().min(1).max(256),
    endpoint: z.string(),
    payload: z.unknown(),
  }),
  z.object({ type: z.literal('cancel'), streamId: z.string().min(1).max(256) }),
]);
function authorization(request: IncomingMessage): string | undefined {
  const value = request.headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}
export function memberDeviceRequest(request: IncomingMessage): boolean {
  return authorization(request)?.startsWith('Device member.') === true;
}
function failure(error: unknown, gateway: TypertGateway) {
  return error instanceof TeamError
    ? { code: error.code, message: error.code, details: {} }
    : error instanceof z.ZodError
      ? { code: 'invalid-input', message: 'invalid-input', details: {} }
      : gateway.wireStream.failure(error);
}
export function deviceFailure(response: ServerResponse, error: unknown): void {
  const code =
    error instanceof TeamError
      ? error.code
      : error instanceof z.ZodError
        ? 'invalid-input'
        : 'internal';
  teamJson(
    response,
    code === 'credentials-invalid'
      ? 401
      : code === 'rate-limited'
        ? 429
        : code === 'password-reused'
          ? 409
          : ['invalid-input', 'password-weak'].includes(code)
            ? 400
            : code === 'internal'
              ? 503
              : 403,
    {
      code,
      ...(error instanceof TeamError && error.retryAfterSeconds
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    },
  );
}

export function createTeamDeviceHttp(options: {
  team: TeamService;
  devices: MemberDevices;
  gateway: TypertGateway;
  tls(): boolean;
}) {
  const sockets = new Set<() => void>();
  let activeStreams = 0;
  const peerFor = (request: IncomingMessage) => {
    const peer = options.team.admitDevice(authorization(request));
    if (!peer) throw new TeamError('credentials-invalid');
    return peer;
  };
  const assertDevice = (peer: PeerScope) => options.team.assertCall(peer.principal, 'device');
  const transport = (request: IncomingMessage) => {
    if (!options.tls() && !passwordTransportAllowed(request, options, false))
      throw new TeamError('insecure-transport');
  };
  return {
    async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
      const path = new URL(request.url ?? '/', 'http://device').pathname;
      try {
        if (request.headers.origin || request.headers['sec-fetch-site'] === 'cross-site')
          throw new TeamError('origin-refused');
        if (path === SIGN_IN && request.method === 'POST') {
          transport(request);
          return teamJson(
            response,
            200,
            await options.devices.signIn(
              await readTeamBody(request),
              request.socket.remoteAddress ?? 'unknown',
            ),
          );
        }
        const peer = peerFor(request);
        if (path === PASSWORD && request.method === 'POST') {
          transport(request);
          const input = z
            .object({ current: z.string().max(1024), next: z.string().max(1024) })
            .parse(await readTeamBody(request));
          await options.team.changeWebPassword(
            peer.principal,
            input.current,
            input.next,
            request.socket.remoteAddress ?? 'unknown',
          );
          return teamJson(response, 200, {});
        }
        assertDevice(peer);
        if (
          path === `${PREFIX}/unpair` &&
          request.method === 'POST' &&
          peer.principal.kind === 'botharness-member'
        ) {
          await options.team.revoke(peer.principal.grantId);
          return teamJson(response, 200, { revoked: true });
        }
        if (!path.startsWith(`${PREFIX}/api/`) || request.method !== 'POST')
          throw new TeamError('remote-access/denied');
        const endpoint = path.slice(`${PREFIX}/api/`.length);
        const [namespace, method, tail] = endpoint.split('/');
        const input = rpcSchema.parse(await readTeamBody(request));
        if (!namespace || !method || tail !== undefined || input.method !== endpoint)
          throw new TeamError('invalid-input');
        try {
          options.team.assertCall(peer.principal, method);
          const changingPassword = namespace === 'botharness' && method === 'memberPasswordChange';
          if (changingPassword) transport(request);
          const invoke = () =>
            options.gateway.invoke({
              namespace,
              method,
              args: input.payload?.args ?? {},
              peer,
              signal: peer.signal,
            });
          const value =
            changingPassword && peer.principal.kind === 'botharness-member'
              ? await options.team.withPasswordCaller(
                  peer.principal,
                  request.socket.remoteAddress ?? 'unknown',
                  invoke,
                )
              : await invoke();
          teamJson(response, 200, {
            type: 'server-response',
            rpcId: input.rpcId,
            result: { ok: true, value },
          });
        } catch (error) {
          teamJson(response, 200, {
            type: 'server-response',
            rpcId: input.rpcId,
            result: { ok: false, error: failure(error, options.gateway) },
          });
        }
      } catch (error) {
        deviceFailure(response, error);
      }
    },
    async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
      let peer: PeerScope;
      try {
        if (request.headers.origin || request.url !== `${PREFIX}/api/remote.mux`)
          throw new TeamError('remote-access/denied');
        peer = peerFor(request);
        assertDevice(peer);
        if (sockets.size >= 64) throw new TeamError('rate-limited');
      } catch (error) {
        const code = error instanceof TeamError ? error.code : 'internal';
        const body = JSON.stringify({ code });
        socket.end(
          `HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
        );
        return;
      }
      const server = new WebSocketServer({
        noServer: true,
        clientTracking: false,
        maxPayload: 1024 * 1024,
        perMessageDeflate: false,
      });
      server.handleUpgrade(request, socket, head, (client) => {
        const streams = new Map<string, AbortController>();
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          detach();
          for (const controller of streams.values()) controller.abort();
          streams.clear();
          sockets.delete(close);
          client.terminate();
          server.close();
        };
        const detach = () => peer.signal.removeEventListener('abort', close);
        sockets.add(close);
        peer.signal.addEventListener('abort', close, { once: true });
        client.on('close', close);
        client.on('error', close);
        const send = (value: unknown) => {
          if (client.readyState !== WebSocket.OPEN) return;
          const text = JSON.stringify(value);
          if (client.bufferedAmount + Buffer.byteLength(text) > 4 * 1024 * 1024) {
            close();
            return;
          }
          client.send(text);
        };
        client.on('message', (raw, binary) => {
          let frame: z.infer<typeof frameSchema>;
          try {
            if (binary) throw new TeamError('invalid-input');
            frame = frameSchema.parse(JSON.parse(raw.toString()));
            assertDevice(peer);
          } catch {
            close();
            return;
          }
          if (frame.type === 'cancel') {
            streams.get(frame.streamId)?.abort();
            streams.delete(frame.streamId);
            return;
          }
          if (streams.has(frame.streamId) || streams.size >= 16 || activeStreams >= 256) {
            close();
            return;
          }
          const controller = new AbortController();
          streams.set(frame.streamId, controller);
          activeStreams++;
          void (async () => {
            try {
              options.team.assertCall(peer.principal, frame.endpoint.split('/').at(-1) ?? '');
              const signal = AbortSignal.any([peer.signal, controller.signal]);
              const iterable = await options.gateway.wireStream.open(
                frame.endpoint,
                frame.payload,
                (async function* () {})(),
                peer,
                signal,
              );
              for await (const value of iterable) {
                if (signal.aborted) break;
                assertDevice(peer);
                send({ type: 'item', streamId: frame.streamId, value });
              }
              if (!signal.aborted) send({ type: 'end', streamId: frame.streamId });
            } catch (error) {
              if (!controller.signal.aborted)
                send({
                  type: 'error',
                  streamId: frame.streamId,
                  error: failure(error, options.gateway),
                });
            } finally {
              activeStreams--;
              if (streams.get(frame.streamId) === controller) streams.delete(frame.streamId);
            }
          })();
        });
        if (peer.signal.aborted) close();
      });
    },
    close() {
      for (const close of [...sockets]) close();
    },
  };
}
export type TeamDeviceHttp = ReturnType<typeof createTeamDeviceHttp>;
