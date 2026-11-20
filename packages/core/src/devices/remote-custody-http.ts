import { z } from 'zod';
import {
  custodyFailure,
  TEAM_DEVICE_PATHS,
  type CustodyResponse,
  type RemoteCustody,
} from './remote-custody.js';

export const REMOTE_CUSTODY_PATH = '/api/botharness/remote-custody';
export const REMOTE_CUSTODY_STREAM_PATH = '/api/botharness/remote-custody/stream';

const handle = z.string().max(64);
const url = z.string().url().max(4096);
const headers = z.record(z.string().max(128), z.string().max(4096)).optional();
const socket = z.string().regex(/^[A-Za-z0-9_-]{24}$/u);
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('seal'), host: z.unknown() }),
  z.object({ action: z.literal('forget'), handle }),
  z.object({
    action: z.literal('request'),
    handle,
    url,
    method: z.enum(['GET', 'POST']),
    headers,
    body: z.string().max(8_000_000).optional(),
    bodyBase64: z.string().max(12_000_000).optional(),
  }),
  z.object({ action: z.literal('socket'), handle, url, headers }),
  z.object({
    action: z.literal('team'),
    route: url,
    path: z.enum(TEAM_DEVICE_PATHS),
    headers,
    body: z.string().max(64_000),
  }),
  z.object({ action: z.literal('send'), socket, text: z.string().max(70_000) }),
  z.object({ action: z.literal('close'), socket }),
]);

export const REMOTE_CUSTODY_ACTIONS: readonly string[] = command.options.map(
  (option) => option.shape.action.value,
);

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const forwarded = (response: CustodyResponse) =>
  reply({
    status: response.status,
    contentType: response.contentType,
    body: Buffer.from(response.body).toString('base64'),
  });

export function createRemoteCustodyHttp(custody: RemoteCustody) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply({ code: 'method-not-allowed' }, 405);
    let input: z.infer<typeof command>;
    try {
      const text = await request.text();
      if (text.length > 12_100_000) return reply({ code: 'request-too-large' }, 413);
      const parsed = command.safeParse(JSON.parse(text));
      if (!parsed.success) return reply({ code: 'custody-input-invalid' }, 400);
      input = parsed.data;
    } catch {
      return reply({ code: 'custody-input-invalid' }, 400);
    }
    try {
      if (input.action === 'seal') return reply({ host: await custody.seal(input.host) });
      if (input.action === 'forget') {
        await custody.forget(input.handle);
        return reply({ ok: true });
      }
      if (input.action === 'request') {
        const response = await custody.request({
          handle: input.handle,
          url: input.url,
          method: input.method,
          ...(input.headers ? { headers: input.headers } : {}),
          ...(input.bodyBase64 !== undefined
            ? { body: new Uint8Array(Buffer.from(input.bodyBase64, 'base64')) }
            : input.body !== undefined
              ? { body: input.body }
              : {}),
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
        });
        return forwarded(response);
      }
      if (input.action === 'team') {
        const response = await custody.teamRequest({
          route: input.route,
          path: input.path,
          ...(input.headers ? { headers: input.headers } : {}),
          body: input.body,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
        });
        return forwarded(response);
      }
      if (input.action === 'socket')
        return reply({
          socket: await custody.prepareSocket({
            handle: input.handle,
            url: input.url,
            ...(input.headers ? { headers: input.headers } : {}),
          }),
        });
      if (input.action === 'send') {
        custody.sendSocket(input.socket, input.text);
        return reply({ ok: true });
      }
      custody.closeSocket(input.socket);
      return reply({ ok: true });
    } catch (error) {
      return reply(custodyFailure(error), 409);
    }
  };
}

export function createRemoteCustodyStream(custody: RemoteCustody) {
  return async (request: Request): Promise<Response> => {
    const id = new URL(request.url).searchParams.get('socket') ?? '';
    if (!socket.safeParse(id).success) return reply({ code: 'custody-input-invalid' }, 400);
    const encoder = new TextEncoder();
    let release: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let ended = false;
    const pending = new AbortController();
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          const emit = (event: string, data: unknown) => {
            if (ended) return;
            if (event === 'message' && (controller.desiredSize ?? 0) <= 0) {
              finish();
              return;
            }
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              );
            } catch {
              finish();
            }
          };
          const finish = () => {
            if (ended) return;
            ended = true;
            request.signal.removeEventListener('abort', finish);
            if (heartbeat !== undefined) clearInterval(heartbeat);
            pending.abort();
            release?.();
            try {
              controller.close();
            } catch {}
          };
          void custody
            .attachSocket(
              id,
              {
                open: () => emit('open', {}),
                message: (text) => emit('message', { text }),
                closed: (reason) => {
                  emit('closed', { reason });
                  release = undefined;
                  finish();
                },
              },
              pending.signal,
            )
            .then(
              (detach) => {
                if (ended) detach();
                else release = detach;
              },
              (error: unknown) => {
                emit('closed', { reason: custodyFailure(error).code });
                finish();
              },
            );
          heartbeat = setInterval(() => {
            if (ended || (controller.desiredSize ?? 0) <= 0) return;
            try {
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            } catch {
              finish();
            }
          }, 15_000);
          if (request.signal.aborted) finish();
          else request.signal.addEventListener('abort', finish, { once: true });
        },
        cancel() {
          ended = true;
          if (heartbeat !== undefined) clearInterval(heartbeat);
          pending.abort();
          release?.();
        },
      },
      new CountQueuingStrategy({ highWaterMark: 256 }),
    );
    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  };
}
